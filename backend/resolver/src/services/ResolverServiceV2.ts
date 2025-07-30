import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { ethers } from 'ethers';
import { ChainServiceSimple } from './ChainServiceSimple';
import dotenv from 'dotenv';

dotenv.config();

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
  private orderEngineUrl: string;
  private isProcessing: Set<string> = new Set();
  private ethereumAddress: string;
  private aptosAddress: string;
  private ethereumProvider: ethers.Provider;
  private aptosProvider: any; // Aptos client
  
  // Track fills we're monitoring
  private monitoringFills: Map<string, Fill> = new Map();
  // Track secrets for fills
  private fillSecrets: Map<string, Uint8Array> = new Map();
  // Track processed events to avoid duplicates
  private processedEvents: Set<string> = new Set();

  constructor() {
    this.orderEngineUrl = process.env.ORDER_ENGINE_URL || 'http://localhost:3001';
    this.chainService = new ChainServiceSimple();
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
    // TODO: Implement real profitability check with exchange rates
    // For now, accept all orders in testnet
    return true;
  }

  private async checkBalance(order: Order): Promise<boolean> {
    // TODO: Check resolver's balance on destination chain
    // Need to ensure we have enough toToken to lock in escrow
    return true;
  }

  private async createDestinationEscrow(order: Order) {
    console.log(`\n📦 Creating destination escrow for order ${order.id}`);
    
    // Generate secret for this fill
    const secret = ethers.randomBytes(32);
    const secretHash = ethers.keccak256(secret);
    
    // Create fill record
    const fill = await this.createFill(order.id, {
      resolver: order.toChain === 'ETHEREUM' ? this.ethereumAddress : this.aptosAddress,
      amount: order.minToAmount,
      secretHash,
      secretIndex: 0,
      status: 'PENDING'
    });

    try {
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
          order.minToAmount,
          secretHash,
          timelock,
          safetyDeposit
        );
      } else {
        console.log(`   Creating Aptos escrow for user ${order.receiver}`);
        destTxHash = await this.chainService.createAptosEscrow(
          ethers.getBytes(escrowId),
          order.receiver, // User is beneficiary on destination
          order.minToAmount,
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
        timelock
      });
      
      console.log(`   ✅ Destination escrow created: ${escrowId}`);
      console.log(`   ⏳ Waiting for user to create source escrow...`);
      
    } catch (error) {
      console.error(`Failed to create destination escrow:`, error);
      await this.updateFillStatus(order.id, fill.id, 'FAILED');
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
      await this.chainService.withdrawEthereumEscrow(sourceEscrowId, ethers.hexlify(secret));
      
      console.log('   ✅ Successfully withdrew from source escrow!');
      console.log('   🎉 User can now use the revealed secret to withdraw from destination escrow');
      
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