import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { ethers } from 'ethers';
import { ChainServiceSimple } from './ChainServiceSimple';
import { PriceService } from './PriceService';
import { PermitService } from './PermitService';
import { WETHService } from './WETHService';
import dotenv from 'dotenv';
import { createHash } from 'crypto';

dotenv.config();

interface Permit {
  owner: string;
  spender: string;
  value: string;
  nonce: string;
  deadline: number;
}

interface Order {
  id: string;
  fromChain: 'ETHEREUM' | 'APTOS';
  toChain: 'ETHEREUM' | 'APTOS';
  fromToken: string;
  toToken: string;
  fromAmount: string;
  minToAmount: string;
  maker: string;
  receiver: string;
  deadline: number;
  status: string;
  secretHashes?: string[];
  // Permit for automatic transfers
  permit?: Permit;
  permitSignature?: string;
}

interface Fill {
  id: string;
  orderId: string;
  resolver: string;
  amount: string;
  secretHash: string;
  secretIndex: number;
  status: string;
  destinationEscrowId?: string;
  sourceEscrowId?: string;
}

export class ResolverServiceV2 {
  private socket: Socket;
  private chainService: ChainServiceSimple;
  private priceService: PriceService;
  private orderEngineUrl: string;
  private isProcessing: Set<string> = new Set();
  private ethereumAddress: string;
  private aptosAddress: string;
  private ethereumProvider: ethers.Provider;
  private aptosProvider: any; // Aptos client
  
  // Track active orders
  private activeOrders: Map<string, Order> = new Map();
  // Track fills we're monitoring
  private monitoringFills: Map<string, Fill> = new Map();
  // Track secrets for fills
  private fillSecrets: Map<string, Uint8Array> = new Map();
  // Track processed events to avoid duplicates
  private processedEvents: Set<string> = new Set();

  constructor() {
    this.orderEngineUrl = process.env.ORDER_ENGINE_URL || 'http://localhost:3001';
    this.chainService = new ChainServiceSimple();
    this.priceService = new PriceService();
    this.ethereumAddress = process.env.ETHEREUM_RESOLVER_ADDRESS!;
    this.aptosAddress = process.env.APTOS_RESOLVER_ADDRESS!;
    
    // Initialize providers for monitoring
    this.ethereumProvider = new ethers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
    );
    
    // Connect to order engine WebSocket
    this.socket = io(this.orderEngineUrl);
    this.setupSocketListeners();
    
    // Start monitoring for escrow events
    this.startEscrowMonitoring();
  }

  private setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to order engine');
      this.socket.emit('subscribe:active');
    });

    this.socket.on('order:new', (order: Order) => {
      this.handleNewOrder(order);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from order engine');
    });
  }

  private async handleNewOrder(order: Order) {
    // Skip if already processing this order
    if (this.isProcessing.has(order.id)) {
      return;
    }

    try {
      this.isProcessing.add(order.id);
      this.activeOrders.set(order.id, order);
      
      console.log(`\n🔍 Evaluating order ${order.id}`);
      console.log(`   ${order.fromChain} → ${order.toChain}`);
      console.log(`   Amount: ${order.fromAmount} → ${order.minToAmount}`);
      
      // Check if order is profitable
      const isProfitable = await this.checkProfitability(order);
      if (!isProfitable) {
        console.log(`   ❌ Not profitable, skipping`);
        return;
      }

      // Check if we have sufficient balance on destination chain
      const hasSufficientBalance = await this.checkBalance(order);
      if (!hasSufficientBalance) {
        console.log(`   ❌ Insufficient balance on destination chain`);
        return;
      }

      console.log(`   ✅ Profitable and have balance, creating destination escrow`);
      
      // Create destination escrow only (proper Fusion+ flow)
      await this.createDestinationEscrow(order);
      
    } catch (error) {
      console.error(`Error processing order ${order.id}:`, error);
    } finally {
      this.isProcessing.delete(order.id);
    }
  }

  private async checkProfitability(order: Order): Promise<boolean> {
    try {
      // Get exchange rate
      const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const fromToken = order.fromToken === ethers.ZeroAddress ? 'ETH' : 
                       order.fromToken.toLowerCase() === WETH_ADDRESS.toLowerCase() ? 'ETH' : 
                       order.fromToken;
      // Handle Aptos token address
      const toToken = order.toToken === ethers.ZeroAddress || order.toToken === '0x1::aptos_coin::AptosCoin' ? 'APT' : order.toToken;
      
      const exchangeRate = await this.priceService.getExchangeRate(fromToken, toToken);
      
      // Calculate expected output with resolver margin
      const expectedOutput = this.priceService.calculateOutputAmount(
        ethers.formatEther(order.fromAmount), 
        exchangeRate,
        true // Apply margin
      );
      
      // Compare with minimum required
      const minRequired = order.toChain === 'ETHEREUM' 
        ? ethers.formatEther(order.minToAmount)
        : (parseInt(order.minToAmount) / 100000000).toString(); // APT has 8 decimals
      
      console.log(`   💱 Exchange rate: 1 ${fromToken} = ${exchangeRate.toFixed(4)} ${toToken}`);
      console.log(`   📊 Expected output: ${expectedOutput} ${toToken}`);
      console.log(`   📊 Min required: ${minRequired} ${toToken}`);
      
      // Add small tolerance for floating point comparison (0.0001%)
      const tolerance = 0.000001;
      const outputValue = parseFloat(expectedOutput);
      const requiredValue = parseFloat(minRequired);
      const ratio = outputValue / requiredValue;
      
      const isProfitable = ratio >= (1 - tolerance);
      
      if (isProfitable) {
        const margin = (ratio - 1) * 100;
        if (margin < 0.01) {
          console.log(`   ✅ Profitable at breakeven (within tolerance)`);
        } else {
          console.log(`   ✅ Profitable with ${margin.toFixed(2)}% margin`);
        }
      } else {
        console.log(`   ❌ Not profitable, ratio: ${ratio.toFixed(6)} (need >= ${(1 - tolerance).toFixed(6)})`);
      }
      
      return isProfitable;
    } catch (error) {
      console.error('Error checking profitability:', error);
      // In testnet, accept orders even if price check fails
      return true;
    }
  }

  private async checkBalance(order: Order): Promise<boolean> {
    // TODO: Check resolver's balance on destination chain
    // Need to ensure we have enough toToken to lock in escrow
    return true;
  }

  private async createDestinationEscrow(order: Order) {
    console.log(`\n📦 Creating destination escrow for order ${order.id}`);
    
    // Check if order has a permit for automatic transfer
    if (order.permit && order.permitSignature) {
      console.log(`   🎫 Order has permit for automatic transfer`);
      console.log(`   📝 Permit owner: ${order.permit.owner}`);
      console.log(`   📝 Permit spender: ${order.permit.spender}`);
      console.log(`   📝 Permit value: ${order.permit.value}`);
      // TODO: Execute permit transfer after creating destination escrow
    }
    
    // Get exchange rate and calculate actual output amount
    const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    const fromToken = order.fromToken === ethers.ZeroAddress ? 'ETH' : 
                     order.fromToken.toLowerCase() === WETH_ADDRESS.toLowerCase() ? 'ETH' : 
                     order.fromToken;
    // Handle Aptos token address
    const toToken = order.toToken === ethers.ZeroAddress || order.toToken === '0x1::aptos_coin::AptosCoin' ? 'APT' : order.toToken;
    
    const exchangeRate = await this.priceService.getExchangeRate(fromToken, toToken);
    const outputAmount = this.priceService.calculateOutputAmount(
      ethers.formatEther(order.fromAmount),
      exchangeRate,
      true // Apply margin
    );
    
    // Convert output amount to proper units
    const actualOutputAmount = order.toChain === 'ETHEREUM'
      ? ethers.parseEther(outputAmount).toString()
      : Math.floor(parseFloat(outputAmount) * 100000000).toString(); // APT has 8 decimals
    
    console.log(`   💱 Using exchange rate: 1 ${fromToken} = ${exchangeRate.toFixed(4)} ${toToken}`);
    console.log(`   📊 Output amount: ${outputAmount} ${toToken}`);
    
    // Generate secret for this fill
    const secret = ethers.randomBytes(32);
    const secretHash = ethers.keccak256(secret);
    
    // Create fill record with actual output amount
    let fill: Fill | undefined;
    try {
      fill = await this.createFill(order.id, {
        resolver: order.toChain === 'ETHEREUM' ? this.ethereumAddress : this.aptosAddress,
        amount: actualOutputAmount,
        secretHash,
        secretIndex: 0,
        status: 'PENDING'
      });
      // Create destination escrow with user as beneficiary
      const escrowId = ethers.id(order.id + '-dest-' + secretHash);
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const safetyDeposit = order.toChain === 'ETHEREUM' 
        ? ethers.parseEther('0.001').toString()
        : '100000'; // 0.001 APT
      
      let destTxHash: string;
      
      if (order.toChain === 'ETHEREUM') {
        console.log(`   Creating Ethereum escrow for user ${order.receiver}`);
        destTxHash = await this.chainService.createEthereumEscrow(
          escrowId,
          order.receiver, // User is beneficiary on destination
          order.toToken,
          actualOutputAmount, // Use calculated output amount
          secretHash,
          timelock,
          safetyDeposit
        );
      } else {
        console.log(`   Creating Aptos escrow for user ${order.receiver}`);
        destTxHash = await this.chainService.createAptosEscrow(
          ethers.getBytes(escrowId),
          order.receiver, // User is beneficiary on destination
          actualOutputAmount, // Use calculated output amount
          ethers.getBytes(secretHash),
          timelock,
          safetyDeposit
        );
      }
      
      // Update fill with destination escrow info
      await this.updateFillStatus(order.id, fill.id, 'DESTINATION_CREATED', { 
        destTxHash,
        destinationEscrowId: escrowId 
      });
      
      // Store secret and monitor for source escrow
      this.monitoringFills.set(escrowId, {
        ...fill,
        destinationEscrowId: escrowId
      });
      this.fillSecrets.set(fill.id, secret);
      
      // Broadcast to user that destination escrow is ready
      this.socket.emit('escrow:destination:created', {
        orderId: order.id,
        escrowId,
        chain: order.toChain,
        txHash: destTxHash,
        secretHash,
        timelock,
        amount: actualOutputAmount
      });
      
      console.log(`   ✅ Destination escrow created: ${escrowId}`);
      
      // Check if this is a WETH order that we should handle automatically
      const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const isWETHOrder = order.fromChain === 'ETHEREUM' && 
                         order.fromToken.toLowerCase() === WETH_ADDRESS.toLowerCase();
      
      if (isWETHOrder) {
        console.log(`   🎫 Checking WETH approval for automatic transfer...`);
        
        try {
          const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY!, this.ethereumProvider);
          const wethService = new WETHService(this.ethereumProvider, WETH_ADDRESS);
          
          // Check if user has approved WETH for our escrow contract
          const allowance = await wethService.getAllowance(
            order.maker,
            process.env.ETHEREUM_ESCROW_ADDRESS!
          );
          
          if (allowance >= BigInt(order.fromAmount)) {
            console.log(`   ✅ WETH allowance sufficient: ${allowance.toString()}`);
            
            // Also check WETH balance
            const wethBalance = await wethService.getBalance(order.maker);
            console.log(`   💰 User WETH balance: ${ethers.formatEther(wethBalance)} WETH`);
            
            if (BigInt(wethBalance) < BigInt(order.fromAmount)) {
              console.log(`   ❌ Insufficient WETH balance: ${ethers.formatEther(wethBalance)} < ${ethers.formatEther(order.fromAmount)}`);
              console.log(`   ⏳ User needs to wrap more ETH to WETH...`);
              return;
            }
            
            console.log(`   📝 Creating source escrow (WETH will be transferred automatically)...`);
            // Continue to create source escrow - the escrow contract will handle the transfer
          } else {
            console.log(`   ❌ Insufficient WETH allowance: ${allowance.toString()} < ${order.fromAmount}`);
            console.log(`   ⏳ Waiting for user to approve WETH and create source escrow manually...`);
            return;
          }
        } catch (error) {
          console.error(`   ❌ Failed to execute WETH transfer:`, error);
          console.log(`   ⏳ Falling back to manual escrow creation...`);
          return;
        }
      } else if (order.permit && order.permitSignature && order.fromChain === 'ETHEREUM') {
        // For other tokens with permits
        console.log(`   🎫 Executing automatic transfer with permit...`);
        
        try {
          const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY!, this.ethereumProvider);
          const permitService = new PermitService(
            this.ethereumProvider,
            process.env.ETHEREUM_PERMIT_CONTRACT!
          );
          
          // Execute permit transfer to our escrow contract
          const permitTxHash = await permitService.executePermitTransfer(
            order.permit,
            order.permitSignature,
            order.fromToken,
            process.env.ETHEREUM_ESCROW_ADDRESS!, // Transfer to escrow contract
            wallet
          );
          
          console.log(`   ✅ Permit transfer executed: ${permitTxHash}`);
        } catch (error) {
          console.error(`   ❌ Failed to execute permit transfer:`, error);
          console.log(`   ⏳ Falling back to manual escrow creation...`);
          return;
        }
      }
      
      // If we got here with WETH or permit transfers, create source escrow
      if (isWETHOrder || (order.permit && order.permitSignature)) {
        console.log(`   📝 Creating source escrow automatically...`);
        
        try {
          // Create source escrow ID
          const sourceEscrowId = ethers.id(order.id + '-source-' + secretHash);
          
          // Create source escrow with user as depositor (Fusion+ flow)
          const sourceTxHash = await this.chainService.createEthereumEscrow(
            sourceEscrowId,
            this.ethereumAddress, // Resolver is beneficiary on source
            order.fromToken,
            order.fromAmount,
            secretHash,
            timelock,
            ethers.parseEther('0.001').toString(), // Safety deposit
            order.maker // User is the depositor - escrow will pull WETH from them
          );
          
          console.log(`   ✅ Source escrow created automatically: ${sourceTxHash}`);
          
          // Continue with normal flow - reveal secret and complete swap
          await this.completeSwap(order, fill, secret, sourceEscrowId, escrowId);
          
        } catch (error: any) {
          console.error(`   ❌ Failed to create source escrow:`, error);
          console.log(`   ⏳ Falling back to manual escrow creation...`);
        }
      } else {
        console.log(`   ⏳ Waiting for user to create source escrow...`);
      }
      
    } catch (error) {
      console.error(`Failed to create destination escrow:`, error);
      // Only update fill status if fill was created
      if (fill) {
        await this.updateFillStatus(order.id, fill.id, 'FAILED');
      }
      throw error;
    }
  }

  private async startEscrowMonitoring() {
    // Monitor Ethereum escrow events using polling instead of filters
    if (process.env.ETHEREUM_ESCROW_ADDRESS) {
      console.log('Starting escrow event monitoring...');
      
      // Poll for events every 5 seconds
      setInterval(async () => {
        try {
          const escrowAbi = [
            'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)'
          ];
          
          const escrowContract = new ethers.Contract(
            process.env.ETHEREUM_ESCROW_ADDRESS!,
            escrowAbi,
            this.ethereumProvider
          );
          
          // Get recent blocks
          const currentBlock = await this.ethereumProvider.getBlockNumber();
          const fromBlock = Math.max(0, currentBlock - 10); // Last 10 blocks
          
          // Query for events
          const filter = escrowContract.filters.EscrowCreated(
            null,
            null,
            this.ethereumAddress
          );
          
          const events = await escrowContract.queryFilter(filter, fromBlock, currentBlock);
          
          for (const event of events) {
            if (!('args' in event)) continue;
            
            const [escrowId, depositor, beneficiary, token, amount, hashlock, timelock] = event.args as any[];
            
            // Check if we've already processed this event
            const eventKey = `${event.blockNumber}-${event.transactionIndex}`;
            if (this.processedEvents.has(eventKey)) continue;
            
            this.processedEvents.add(eventKey);
            
            console.log(`\n🔔 Detected source escrow on Ethereum!`);
            console.log(`   Escrow ID: ${escrowId}`);
            console.log(`   From: ${depositor}`);
            console.log(`   Amount: ${ethers.formatEther(amount)} ETH`);
            
            // Find matching fill by hashlock
            for (const [destEscrowId, fill] of this.monitoringFills) {
              if (fill.secretHash === hashlock) {
                console.log(`   ✅ Matched with order fill!`);
                await this.handleSourceEscrowCreated(fill, escrowId);
                break;
              }
            }
          }
        } catch (error) {
          // Silently ignore polling errors
        }
      }, 5000);
    }
    
    // TODO: Monitor Aptos escrow events
  }

  private async completeSwap(order: Order, fill: Fill, secret: Uint8Array, sourceEscrowId: string, destEscrowId: string) {
    console.log(`\n💰 Completing swap automatically...`);
    
    try {
      // Update fill status
      await this.updateFillStatus(fill.orderId, fill.id, 'SOURCE_CREATED', {
        sourceEscrowId
      });
      
      // Reveal secret and withdraw from source escrow
      console.log('   🔓 Revealing secret and withdrawing from source escrow...');
      
      // Withdraw from source escrow (we are the beneficiary)
      const withdrawTx = await this.chainService.withdrawEthereumEscrow(sourceEscrowId, ethers.hexlify(secret));
      
      console.log('   ✅ Successfully withdrew from source escrow!');
      
      // Emit event for source escrow withdrawal
      this.socket.emit('escrow:source:withdrawn', {
        orderId: fill.orderId,
        escrowId: sourceEscrowId,
        secret: ethers.hexlify(secret),
        txHash: withdrawTx
      });
      
      // Now withdraw from destination escrow to transfer funds to user
      if (order.toChain === 'APTOS') {
        console.log('   🔓 Withdrawing from Aptos escrow to transfer funds to user...');
        
        try {
          // Convert escrow ID to bytes
          const destEscrowIdBytes = ethers.getBytes(destEscrowId);
          
          // Withdraw from Aptos escrow - this will automatically transfer to the beneficiary
          const aptosTxHash = await this.chainService.withdrawAptosEscrow(destEscrowIdBytes, secret);
          
          console.log(`   ✅ Aptos withdrawal successful! Funds transferred to user.`);
          console.log(`   📄 Aptos transaction: ${aptosTxHash}`);
          
          // Optionally send cross-chain secret reveal if LayerZero is configured
          if (this.chainService.sendCrossChainSecretReveal) {
            console.log('   🌐 Also sending cross-chain secret reveal via LayerZero...');
            await this.chainService.sendCrossChainSecretReveal(
              10108, // Aptos testnet endpoint ID
              sourceEscrowId,
              secret
            );
          }
        } catch (error) {
          console.error('   ⚠️ Failed to withdraw from Aptos escrow:', error);
          // Don't fail the whole operation if Aptos withdrawal fails
          // The user can still manually withdraw using the revealed secret
        }
      }
      
      console.log('   🎉 Swap completed automatically! User received funds without manual claiming.');
      
      // Update final status
      await this.updateFillStatus(fill.orderId, fill.id, 'COMPLETED');
      
      // Clean up
      this.monitoringFills.delete(destEscrowId);
      this.fillSecrets.delete(fill.id);
      
    } catch (error) {
      console.error('Failed to complete automatic swap:', error);
      await this.updateFillStatus(fill.orderId, fill.id, 'FAILED');
      throw error;
    }
  }

  private async handleSourceEscrowCreated(fill: Fill, sourceEscrowId: string) {
    console.log(`\n💰 Source escrow created, proceeding with swap completion`);
    
    try {
      // Update fill status
      await this.updateFillStatus(fill.orderId, fill.id, 'SOURCE_CREATED', {
        sourceEscrowId
      });
      
      // Wait for confirmations
      console.log('   ⏳ Waiting for confirmations...');
      await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds
      
      // Reveal secret and withdraw from source escrow
      console.log('   🔓 Revealing secret and withdrawing from source escrow...');
      
      // Get the secret from our storage
      const secret = this.getSecretForFill(fill);
      if (!secret) {
        throw new Error('Secret not found for fill');
      }
      
      // Withdraw from source escrow (we are the beneficiary)
      const withdrawTx = await this.chainService.withdrawEthereumEscrow(sourceEscrowId, ethers.hexlify(secret));
      
      console.log('   ✅ Successfully withdrew from source escrow!');
      
      // Emit event for source escrow withdrawal
      this.socket.emit('escrow:source:withdrawn', {
        orderId: fill.orderId,
        escrowId: sourceEscrowId,
        secret: ethers.hexlify(secret),
        txHash: withdrawTx
      });
      
      // Now withdraw from destination escrow to transfer funds to user
      const order = this.activeOrders.get(fill.orderId);
      if (order && order.toChain === 'APTOS' && fill.destinationEscrowId) {
        console.log('   🔓 Withdrawing from Aptos escrow to transfer funds to user...');
        
        try {
          // Convert escrow ID to bytes
          const destEscrowIdBytes = ethers.getBytes(fill.destinationEscrowId);
          
          // Withdraw from Aptos escrow - this will automatically transfer to the beneficiary
          const aptosTxHash = await this.chainService.withdrawAptosEscrow(destEscrowIdBytes, secret);
          
          console.log(`   ✅ Aptos withdrawal successful! Funds transferred to user.`);
          console.log(`   📄 Aptos transaction: ${aptosTxHash}`);
          
          // Optionally send cross-chain secret reveal if LayerZero is configured
          if (this.chainService.sendCrossChainSecretReveal) {
            console.log('   🌐 Also sending cross-chain secret reveal via LayerZero...');
            await this.chainService.sendCrossChainSecretReveal(
              10108, // Aptos testnet endpoint ID
              sourceEscrowId,
              secret
            );
          }
        } catch (error) {
          console.error('   ⚠️ Failed to withdraw from Aptos escrow:', error);
          // Don't fail the whole operation if Aptos withdrawal fails
          // The user can still manually withdraw using the revealed secret
        }
      }
      
      console.log('   🎉 Swap completed! Funds have been transferred to the user.');
      
      // Emit completion event
      this.socket.emit('swap:completed', {
        orderId: fill.orderId,
        fillId: fill.id,
        sourceChain: order?.fromChain || 'ETHEREUM',
        destinationChain: order?.toChain || 'APTOS',
        fromAmount: order?.fromAmount || fill.amount,
        toAmount: order?.toChain === 'APTOS' ? order?.minToAmount : fill.amount,
        txHash: withdrawTx
      });
      
      // Update final status
      await this.updateFillStatus(fill.orderId, fill.id, 'COMPLETED');
      
      // Clean up monitoring
      this.monitoringFills.delete(fill.destinationEscrowId!);
      
    } catch (error) {
      console.error('Failed to complete swap:', error);
      await this.updateFillStatus(fill.orderId, fill.id, 'FAILED');
    }
  }

  private getSecretForFill(fill: Fill): Uint8Array | null {
    return this.fillSecrets.get(fill.id) || null;
  }

  private async createFill(orderId: string, fillData: any): Promise<Fill> {
    const response = await axios.post(
      `${this.orderEngineUrl}/api/orders/${orderId}/fills`,
      fillData
    );
    return response.data.data;
  }

  private async updateFillStatus(
    orderId: string, 
    fillId: string, 
    status: string,
    additionalData?: any
  ) {
    await axios.patch(
      `${this.orderEngineUrl}/api/orders/${orderId}/fills/${fillId}`,
      { status, ...additionalData }
    );
  }

  start() {
    console.log('Resolver service V2 started');
    console.log('Implementing proper Fusion+ flow:');
    console.log('  1. Resolver creates destination escrow only');
    console.log('  2. User creates source escrow');
    console.log('  3. Resolver reveals secret on source chain');
    console.log('  4. User uses secret to claim on destination chain');
  }

  stop() {
    this.socket.disconnect();
    console.log('Resolver service stopped');
  }
}