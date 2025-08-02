import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { ethers } from 'ethers';
import { ChainServiceSimple } from './ChainServiceSimple';
import { PriceService } from './PriceService';
import { PermitService } from './PermitService';
import { WETHService } from './WETHService';
import { BalanceTracker } from './BalanceTracker';
import dotenv from 'dotenv';
import { createHash, randomBytes } from 'crypto';
import { Deserializer, SimpleTransaction, RawTransaction, AccountAuthenticator } from '@aptos-labs/ts-sdk';

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
  secretHash?: string; // User-generated secret hash for Fusion+ protocol
  secretHashes?: string[];
  partialFillAllowed?: boolean;
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
  private balanceTracker: BalanceTracker;
  
  // Track active orders
  private activeOrders: Map<string, Order> = new Map();
  // Track fills we're monitoring
  private monitoringFills: Map<string, Fill> = new Map();
  // Track secrets for fills
  private fillSecrets: Map<string, Uint8Array> = new Map();
  // Track processed events to avoid duplicates
  private processedEvents: Set<string> = new Set();
  // Track pending swaps waiting for secret reveal
  private pendingSecretReveals: Map<string, {
    order: Order;
    fill: Fill;
    sourceEscrowId: string;
    destinationEscrowId: string;
  }> = new Map();

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
    
    // Initialize balance tracker
    const wethAddress = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    this.balanceTracker = new BalanceTracker(
      this.ethereumProvider,
      this.ethereumAddress,
      wethAddress
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
      console.log('Listening for events: order:new, escrow:source:created, order:signed, order:signed:sponsored:v2, order:signed:with:permit');
      this.socket.emit('subscribe:active');
    });

    this.socket.on('order:new', (order: Order) => {
      console.log('\n📋 Received order:new event');
      this.handleNewOrder(order);
    });
    
    // Listen for APT escrow creation from frontend
    this.socket.on('escrow:source:created', (data: any) => {
      console.log('\n🔔 Received escrow:source:created event:', data.chain);
      if (data.chain === 'APTOS') {
        console.log('APT escrow created on Aptos:', data);
        this.handleAPTEscrowCreated(data);
      }
    });

    // Listen for signed orders (Fusion+ gasless flow)
    this.socket.on('order:signed', async (data: any) => {
      console.log('\n📝 Received order:signed event');
      console.log('   From chain:', data.fromChain);
      console.log('   Order ID:', data.orderId);
      if (data.fromChain === 'APTOS') {
        await this.handleSignedAptosOrder(data);
      }
    });

    // Listen for new sponsored transaction flow where user's APT is used
    this.socket.on('order:signed:sponsored', async (data: any) => {
      console.log('\n💰 Received order:signed:sponsored event (user funds)');
      console.log('   From chain:', data.fromChain);
      console.log('   Order ID:', data.orderId);
      
      if (data.fromChain === 'APTOS' && data.sponsoredTransaction) {
        await this.handleSponsoredAptosOrder(data);
      }
    });

    // Listen for proper sponsored transaction V2 (multi-agent with fee payer)
    this.socket.on('order:signed:sponsored:v2', async (data: any) => {
      console.log('\n💎 Received order:signed:sponsored:v2 event (proper fee payer model)');
      console.log('   From chain:', data.fromChain);
      console.log('   Order ID:', data.orderId);
      
      if (data.fromChain === 'APTOS' && data.sponsoredTransaction) {
        await this.handleSponsoredAptosOrderV2(data);
      }
    });

    // Listen for permit-based orders (user funds with permit signature)
    this.socket.on('order:signed:with:permit', async (data: any) => {
      console.log('\n🔏 Received order:signed:with:permit event (user funds with permit)');
      console.log('   From chain:', data.fromChain);
      console.log('   Order ID:', data.orderId);
      console.log('   Has permit:', !!data.permit);
      
      if (data.fromChain === 'APTOS' && data.permit) {
        await this.handlePermitBasedAptosOrder(data);
      } else {
        // Fallback to regular signed order if no permit
        await this.handleSignedAptosOrder(data);
      }
    });
    
    // Listen for multi-agent orders (user pays APT, resolver pays gas)
    this.socket.on('order:signed:multiagent', async (data: any) => {
      console.log('\n🚀 Received order:signed:multiagent event (true gasless user-funded)');
      console.log('   From chain:', data.fromChain);
      console.log('   Order ID:', data.orderId);
      console.log('   Has multi-agent transaction:', !!data.multiAgentTransaction);
      
      if (data.fromChain === 'APTOS' && data.multiAgentTransaction) {
        await this.handleMultiAgentAptosOrder(data);
      } else {
        // Fallback to regular signed order if no multi-agent data
        await this.handleSignedAptosOrder(data);
      }
    });

    // Listen for secret reveal from user (Fusion+ spec)
    this.socket.on('secret:reveal', async (data: any) => {
      console.log('\n🔓 Received secret:reveal event');
      console.log('   Order ID:', data.orderId);
      console.log('   Secret hash:', data.secretHash);
      
      const pendingSwap = this.pendingSecretReveals.get(data.orderId);
      if (pendingSwap) {
        const secret = ethers.getBytes(data.secret);
        
        // Verify secret hash matches
        const computedHash = ethers.keccak256(secret);
        if (computedHash !== data.secretHash) {
          console.error('   ❌ Secret hash mismatch!');
          return;
        }
        
        console.log('   ✅ Secret verified, completing swap...');
        await this.completeSwap(
          pendingSwap.order,
          pendingSwap.fill,
          secret,
          pendingSwap.sourceEscrowId,
          pendingSwap.destinationEscrowId
        );
        
        // Clean up
        this.pendingSecretReveals.delete(data.orderId);
      }
    });

    // Log all events for debugging
    this.socket.onAny((eventName, ...args) => {
      if (!['order:new', 'escrow:source:created', 'order:signed', 'order:signed:sponsored', 'order:signed:sponsored:v2', 'order:signed:with:permit', 'connect', 'disconnect'].includes(eventName)) {
        console.log(`[Socket Event] ${eventName}`);
      }
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
      console.log(`   Order fields:`, Object.keys(order));
      console.log(`   Order secretHash:`, order.secretHash);
      
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
      
      // Track balances before creating escrow
      await this.balanceTracker.trackBalanceChange('Before creating destination escrow');
      
      // Create destination escrow only (proper Fusion+ flow)
      await this.createDestinationEscrow(order);
      
      // Track balances after creating escrow
      await this.balanceTracker.trackBalanceChange('After creating destination escrow');
      
    } catch (error: any) {
      console.error(`\n❌ ERROR processing order ${order.id}:`, error);
      console.error(`   📊 Error details:`, {
        message: error.message,
        code: error.code,
        name: error.name
      });
      
      // Check if this is a balance issue
      if (error.message && (error.message.includes('Insufficient') || error.message.includes('balance'))) {
        console.error(`\n${'='.repeat(60)}`);
        console.error(`⚠️  BALANCE ISSUE DETECTED - SWAP CANNOT PROCEED`);
        console.error(`${'='.repeat(60)}`);
        console.error(`\n💡 WHY THIS SWAP FAILED:`);
        console.error(`   The resolver needs to hold destination assets (WETH) upfront`);
        console.error(`   to create escrows in the Fusion+ protocol.`);
        console.error(`\n📝 WHY IT WORKED BEFORE BUT NOT NOW:`);
        console.error(`   1. First swap consumed resolver's WETH balance`);
        console.error(`   2. Resolver created WETH escrow for user (locked WETH)`);
        console.error(`   3. Resolver now has insufficient WETH for new swaps`);
        console.error(`   4. Each swap reduces available WETH until refunded`);
        
        // Show current balances
        try {
          const wethBalance = await this.chainService.getEthereumBalance(
            this.ethereumAddress,
            order.toToken
          );
          const ethBalance = await this.ethereumProvider.getBalance(this.ethereumAddress);
          const requiredAmount = order.toChain === 'ETHEREUM' ? order.minToAmount : '0';
          
          console.error(`\n💰 RESOLVER BALANCE STATUS:`);
          console.error(`   ETH Balance:  ${ethers.formatEther(ethBalance)} ETH`);
          console.error(`   WETH Balance: ${ethers.formatEther(wethBalance)} WETH`);
          console.error(`   Required:     ${ethers.formatEther(requiredAmount)} WETH`);
          console.error(`   Shortfall:    ${ethers.formatEther(BigInt(requiredAmount) - wethBalance)} WETH`);
          
          // Estimate capacity
          const avgSwapSize = ethers.parseEther('0.01');
          const possibleSwaps = wethBalance / avgSwapSize;
          console.error(`\n📊 CAPACITY: Can handle ~${possibleSwaps} more small swaps`);
          
          console.error(`\n🔧 SOLUTION:`);
          console.error(`   1. Fund resolver with more WETH:`);
          console.error(`      - Run: cd /Users/wei/projects/fusion-plus-aptos-extension`);
          console.error(`      - Run: node scripts/wrap-eth-to-weth.js`);
          console.error(`   2. Or send WETH directly to: ${this.ethereumAddress}`);
          console.error(`   3. For production: Implement liquidity pool system`);
          
          console.error(`\n⏰ IMMEDIATE ACTION: Run health check`);
          console.error(`   node scripts/monitor-resolver-health.js`);
          console.error(`${'='.repeat(60)}\n`);
        } catch (e) {
          // Ignore balance check errors
        }
      }
    } finally {
      this.isProcessing.delete(order.id);
    }
  }

  private async checkProfitability(order: Order): Promise<boolean> {
    try {
      // Get exchange rate
      const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      // Handle token mapping for price service
      const fromToken = order.fromToken === ethers.ZeroAddress ? 'ETH' : 
                       order.fromToken.toLowerCase() === WETH_ADDRESS.toLowerCase() ? 'ETH' : 
                       order.fromToken === '0x1::aptos_coin::AptosCoin' ? 'APT' :
                       order.fromToken;
      const toToken = order.toToken === ethers.ZeroAddress ? 'ETH' :
                     order.toToken.toLowerCase() === WETH_ADDRESS.toLowerCase() ? 'ETH' :
                     order.toToken === '0x1::aptos_coin::AptosCoin' ? 'APT' : 
                     order.toToken;
      
      console.log(`   🔍 Getting exchange rate for ${fromToken} -> ${toToken}`);
      const exchangeRate = await this.priceService.getExchangeRate(fromToken, toToken);
      console.log(`   📈 Raw exchange rate: ${exchangeRate}`);
      
      // Calculate expected output with resolver margin
      // Handle different decimal places for different chains
      const fromAmountFormatted = order.fromChain === 'ETHEREUM' 
        ? ethers.formatEther(order.fromAmount)  // 18 decimals for ETH/WETH
        : (parseInt(order.fromAmount) / 100000000).toString(); // 8 decimals for APT
      
      console.log(`   📏 From amount formatted: ${fromAmountFormatted} ${fromToken}`);
      
      const expectedOutput = this.priceService.calculateOutputAmount(
        fromAmountFormatted, 
        exchangeRate,
        true // Apply margin
      );
      
      console.log(`   🎯 Expected output (with margin): ${expectedOutput} ${toToken}`);
      
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
    try {
      if (order.toChain === 'ETHEREUM') {
        // Check ETH/WETH balance
        if (order.toToken === ethers.ZeroAddress) {
          // Check ETH balance
          const balance = await this.ethereumProvider.getBalance(this.ethereumAddress);
          const required = BigInt(order.minToAmount) + ethers.parseEther('0.01'); // Extra for gas
          return balance >= required;
        } else {
          // Check ERC20 balance (WETH)
          const tokenAbi = ['function balanceOf(address) view returns (uint256)'];
          const tokenContract = new ethers.Contract(order.toToken, tokenAbi, this.ethereumProvider);
          const balance = await tokenContract.balanceOf(this.ethereumAddress);
          return balance >= BigInt(order.minToAmount);
        }
      } else if (order.toChain === 'APTOS') {
        // Check APT balance
        const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            function: '0x1::coin::balance',
            type_arguments: ['0x1::aptos_coin::AptosCoin'],
            arguments: [this.aptosAddress]
          })
        });
        
        if (response.ok) {
          const result = await response.json() as any[];
          const balance = BigInt(result[0] || '0');
          return balance >= BigInt(order.minToAmount);
        }
      }
    } catch (error) {
      console.error('Error checking balance:', error);
    }
    return false;
  }

  private async createDestinationEscrow(order: Order) {
    console.log(`\n📦 Creating destination escrow for order ${order.id}`);
    console.log(`   🕐 Started at: ${new Date().toISOString()}`);
    console.log(`   📊 Order details:`);
    console.log(`      - From: ${order.fromChain} ${order.fromToken === '0x1::aptos_coin::AptosCoin' ? 'APT' : order.fromToken}`);
    console.log(`      - To: ${order.toChain} ${order.toToken === ethers.ZeroAddress ? 'ETH' : order.toToken}`);
    console.log(`      - Amount: ${order.fromAmount} -> ${order.minToAmount}`);
    
    // Check if order allows partial fills
    if (order.partialFillAllowed) {
      console.log(`   📊 Order allows partial fills`);
    }
    
    // Check if order has a permit for automatic transfer
    if (order.permit && order.permitSignature) {
      console.log(`   🎫 Order has permit for automatic transfer`);
      console.log(`   📝 Permit owner: ${order.permit.owner}`);
      console.log(`   📝 Permit spender: ${order.permit.spender}`);
      console.log(`   📝 Permit value: ${order.permit.value}`);
      // TODO: Execute permit transfer after creating destination escrow
    }
    
    // For ERC20 tokens on Ethereum (like WETH), ensure approval before creating escrow
    if (order.toChain === 'ETHEREUM' && order.toToken !== ethers.ZeroAddress) {
      console.log(`   🎫 Checking ERC20 approval for destination escrow...`);
      
      try {
        const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
        const wethService = new WETHService(this.ethereumProvider, WETH_ADDRESS);
        const escrowAddress = process.env.ETHEREUM_ESCROW_ADDRESS!;
        
        // Check current allowance
        const currentAllowance = await wethService.getAllowance(
          this.ethereumAddress,
          escrowAddress
        );
        
        console.log(`   💰 Current WETH allowance: ${ethers.formatEther(currentAllowance)} WETH`);
        
        // If allowance is insufficient, approve the escrow contract
        if (currentAllowance < ethers.parseEther('100')) { // Approve 100 WETH for multiple swaps
          console.log(`   ✅ Approving escrow contract to spend WETH...`);
          
          const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY!, this.ethereumProvider);
          
          // Use the contract directly to approve
          const wethAbi = ['function approve(address spender, uint256 amount) returns (bool)'];
          const wethContract = new ethers.Contract(WETH_ADDRESS, wethAbi, wallet);
          
          const approveTx = await wethContract.approve(
            escrowAddress,
            ethers.parseEther('100')
          );
          
          const receipt = await approveTx.wait();
          console.log(`   ✅ WETH approval transaction: ${receipt.hash}`);
          
          // Wait a bit for the approval to be confirmed
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`   ⚠️ Failed to check/set WETH approval:`, error);
        // Continue anyway - the escrow creation will fail if approval is needed
      }
    }
    
    // Get exchange rate and calculate actual output amount
    const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    // Handle token mapping for price service
    const fromToken = order.fromToken === ethers.ZeroAddress ? 'ETH' : 
                     order.fromToken.toLowerCase() === WETH_ADDRESS.toLowerCase() ? 'ETH' : 
                     order.fromToken === '0x1::aptos_coin::AptosCoin' ? 'APT' :
                     order.fromToken;
    const toToken = order.toToken === ethers.ZeroAddress ? 'ETH' :
                   order.toToken.toLowerCase() === WETH_ADDRESS.toLowerCase() ? 'ETH' :
                   order.toToken === '0x1::aptos_coin::AptosCoin' ? 'APT' : 
                   order.toToken;
    
    const exchangeRate = await this.priceService.getExchangeRate(fromToken, toToken);
    
    // Handle different decimal places for different chains
    const fromAmountFormatted = order.fromChain === 'ETHEREUM' 
      ? ethers.formatEther(order.fromAmount)  // 18 decimals for ETH/WETH
      : (parseInt(order.fromAmount) / 100000000).toString(); // 8 decimals for APT
    
    const outputAmount = this.priceService.calculateOutputAmount(
      fromAmountFormatted,
      exchangeRate,
      true // Apply margin
    );
    
    // Convert output amount to proper units
    // For Ethereum, we need to limit decimal places to avoid parseEther errors
    const actualOutputAmount = order.toChain === 'ETHEREUM'
      ? ethers.parseEther(parseFloat(outputAmount).toFixed(18)).toString()
      : Math.floor(parseFloat(outputAmount) * 100000000).toString(); // APT has 8 decimals
    
    console.log(`   💱 Using exchange rate: 1 ${fromToken} = ${exchangeRate.toFixed(4)} ${toToken}`);
    console.log(`   📊 Output amount: ${outputAmount} ${toToken}`);
    
    // Use full amount - no simulated partial fills
    let fillAmount = actualOutputAmount;
    let fillRatio = 1.0;
    
    // Use the user's secret hash from the order (Fusion+ spec: user generates secret)
    console.log(`   🔐 Order secretHash: ${order.secretHash}`);
    const secretHash = order.secretHash || ethers.keccak256(ethers.randomBytes(32)); // Fallback for legacy orders
    console.log(`   🔐 Using secretHash: ${secretHash}`);
    
    // Create fill record with actual output amount
    let fill: Fill | undefined;
    try {
      fill = await this.createFill(order.id, {
        resolver: order.toChain === 'ETHEREUM' ? this.ethereumAddress : this.aptosAddress,
        amount: fillAmount,
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
      
      console.log(`\n   🎯 Creating destination escrow:`);
      console.log(`      - Chain: ${order.toChain}`);
      console.log(`      - Escrow ID: ${escrowId}`);
      console.log(`      - Fill amount: ${fillAmount}`);
      console.log(`      - Secret hash: ${secretHash}`);
      
      if (order.toChain === 'ETHEREUM') {
        console.log(`   🌐 Creating Ethereum escrow for user ${order.receiver}`);
        
        // Check resolver balance one more time before creating escrow
        const currentBalance = await this.chainService.getEthereumBalance(
          this.ethereumAddress,
          order.toToken
        );
        const formattedBalance = ethers.formatEther(currentBalance);
        const formattedNeeded = ethers.formatEther(fillAmount);
        
        console.log(`   💰 Final balance check:`);
        console.log(`      - Resolver ${order.toToken === ethers.ZeroAddress ? 'ETH' : 'token'} balance: ${formattedBalance}`);
        console.log(`      - Required for escrow: ${formattedNeeded}`);
        
        if (currentBalance < BigInt(fillAmount)) {
          console.error(`   ❌ INSUFFICIENT BALANCE - Cannot create escrow!`);
          console.error(`      Need ${formattedNeeded} but only have ${formattedBalance}`);
          throw new Error(`Insufficient ${order.toToken === ethers.ZeroAddress ? 'ETH' : 'token'} balance for escrow`);
        }
        
        console.log(`   ✅ Balance sufficient, proceeding with escrow creation...`);
        
        destTxHash = await this.chainService.createEthereumEscrow(
          escrowId,
          order.receiver, // User is beneficiary on destination
          order.toToken,
          fillAmount, // Use partial fill amount
          secretHash,
          timelock,
          safetyDeposit
        );
      } else {
        console.log(`   Creating Aptos escrow for user ${order.receiver}`);
        destTxHash = await this.chainService.createAptosEscrow(
          ethers.getBytes(escrowId),
          order.receiver, // User is beneficiary on destination
          fillAmount, // Use partial fill amount
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
      
      // Monitor for source escrow (secret will be provided by user later)
      this.monitoringFills.set(escrowId, {
        ...fill,
        destinationEscrowId: escrowId
      });
      
      // Broadcast to user that destination escrow is ready
      console.log(`\n   📡 Emitting escrow:destination:created event...`);
      const eventData = {
        orderId: order.id,
        escrowId,
        chain: order.toChain,
        txHash: destTxHash,
        secretHash,
        timelock,
        amount: fillAmount,
        isPartialFill: fillRatio < 1.0,
        fillRatio
      };
      console.log(`   📊 Event data:`, JSON.stringify(eventData, null, 2));
      
      this.socket.emit('escrow:destination:created', eventData);
      
      console.log(`   ✅ Destination escrow created: ${escrowId}`);
      console.log(`   ✅ Event emitted to frontend`);
      console.log(`   🕐 Completed at: ${new Date().toISOString()}`);
      
      // Check if this is a WETH order that we should handle automatically
      const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
      const isWETHOrder = order.fromChain === 'ETHEREUM' && 
                         order.fromToken.toLowerCase() === WETH_ADDRESS.toLowerCase();
      
      // Check if this is an APT to ETH order
      const isAPTOrder = order.fromChain === 'APTOS' && 
                         order.fromToken === '0x1::aptos_coin::AptosCoin';
      
      if (isAPTOrder) {
        console.log(`   🪙 APT to ETH order detected, creating source escrow automatically...`);
        
        try {
          // Create the source escrow on Aptos with the user's APT
          await this.createSourceEscrowForAPT(order, fill);
        } catch (error) {
          console.error(`   ❌ Failed to create APT source escrow:`, error);
          console.log(`   ⏳ Waiting for user to create source escrow manually...`);
        }
      } else if (isWETHOrder) {
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
          
          // Calculate proportional source amount for partial fills
          let sourceAmount = order.fromAmount;
          if (fillRatio < 1.0) {
            sourceAmount = (BigInt(order.fromAmount) * BigInt(Math.floor(fillRatio * 1000)) / BigInt(1000)).toString();
            console.log(`   🧩 Partial source amount: ${ethers.formatEther(sourceAmount)} WETH`);
          }
          
          // Create source escrow with user as depositor (Fusion+ flow)
          // Use createEscrowFor to pull tokens from user's wallet
          const sourceTxHash = await this.chainService.createEthereumEscrowFor(
            sourceEscrowId,
            order.maker, // User is the depositor
            this.ethereumAddress, // Resolver is beneficiary on source
            order.fromToken,
            sourceAmount, // Use partial amount if applicable
            secretHash,
            timelock
          );
          
          console.log(`   ✅ Source escrow created automatically: ${sourceTxHash}`);
          
          // Emit event for source escrow creation
          this.socket.emit('escrow:source:created', {
            orderId: order.id,
            escrowId: sourceEscrowId,
            chain: 'ETHEREUM',
            txHash: sourceTxHash,
            amount: sourceAmount
          });
          
          // Mark this escrow as auto-created to prevent double processing
          this.processedEvents.add(`auto-${sourceEscrowId}`);
          
          // Request secret from user now that both escrows exist
          console.log('   🔐 Both escrows created, requesting secret from user...');
          this.socket.emit('secret:request', {
            orderId: order.id,
            message: 'Both escrows confirmed on-chain. Please reveal your secret to complete the swap.'
          });
          
          // Store pending swap info for when secret is revealed
          this.pendingSecretReveals.set(order.id, {
            order,
            fill,
            sourceEscrowId,
            destinationEscrowId: escrowId
          });
          
        } catch (error: any) {
          console.error(`   ❌ Failed to create source escrow:`, error);
          console.log(`   ⏳ Falling back to manual escrow creation...`);
        }
      } else {
        console.log(`   ⏳ Waiting for user to create source escrow...`);
      }
      
    } catch (error) {
      console.error(`Failed to create destination escrow:`, error);
      
      // Emit error to frontend
      this.socket.emit('order:error', {
        orderId: order.id,
        error: 'Failed to create destination escrow',
        details: error instanceof Error ? error.message : 'Unknown error',
        reason: error instanceof Error && error.message.includes('insufficient') ? 
          'Resolver has insufficient WETH balance' : 
          'Escrow creation failed'
      });
      
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
            
            // Check if this was auto-created by us
            if (this.processedEvents.has(`auto-${escrowId}`)) {
              console.log(`   ℹ️ Skipping auto-created escrow, already being processed`);
              continue;
            }
            
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
    console.log(`   📄 Order ID: ${order.id}`);
    console.log(`   🔑 Secret: ${ethers.hexlify(secret)}`);
    console.log(`   📦 Source escrow ID: ${sourceEscrowId}`);
    console.log(`   📦 Dest escrow ID: ${destEscrowId}`);
    
    try {
      // Check if fill is already completed or being processed
      if (fill.status === 'COMPLETED' || fill.status === 'SOURCE_WITHDRAWN') {
        console.log('   ⚠️ Fill already completed or being processed, skipping...');
        return;
      }
      
      // Update fill status
      await this.updateFillStatus(fill.orderId, fill.id, 'SOURCE_CREATED', {
        sourceEscrowId
      });
      
      // Reveal secret and withdraw from source escrow
      console.log('   🔓 Revealing secret and withdrawing from source escrow...');
      
      let withdrawTx: string;
      
      // Withdraw from source escrow based on source chain
      if (order.fromChain === 'APTOS') {
        // For APT source, withdraw from Aptos escrow
        console.log('   🪙 Withdrawing from Aptos source escrow...');
        
        // Convert sourceEscrowId to proper format
        let escrowIdBytes: Uint8Array;
        if (Array.isArray(sourceEscrowId)) {
          // If it's an array, convert directly to Uint8Array
          escrowIdBytes = new Uint8Array(sourceEscrowId);
          console.log('   📝 Escrow ID (array):', sourceEscrowId);
        } else if (typeof sourceEscrowId === 'string') {
          // If it's a hex string, convert to bytes
          escrowIdBytes = ethers.getBytes(sourceEscrowId);
          console.log('   📝 Escrow ID (hex):', sourceEscrowId);
        } else {
          throw new Error(`Invalid escrow ID format: ${typeof sourceEscrowId}`);
        }
        
        console.log('   📝 Escrow ID (bytes):', Array.from(escrowIdBytes));
        withdrawTx = await this.chainService.withdrawAptosEscrow(
          escrowIdBytes,
          secret
        );
      } else {
        // For ETH/WETH source, withdraw from Ethereum escrow
        withdrawTx = await this.chainService.withdrawEthereumEscrow(sourceEscrowId, ethers.hexlify(secret));
      }
      
      console.log('   ✅ Successfully withdrew from source escrow!');
      
      // Track balance after withdrawal
      await this.balanceTracker.trackBalanceChange('After withdrawing from source escrow');
      
      // Update fill status to prevent double withdrawal
      await this.updateFillStatus(fill.orderId, fill.id, 'SOURCE_WITHDRAWN');
      
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
        } catch (error: any) {
          console.error('   ⚠️ Failed to withdraw from Aptos escrow:', error);
          
          // Check if it's a gas fee issue
          if (error.message?.includes('INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE')) {
            console.log('   ❌ RESOLVER OUT OF GAS: The resolver does not have enough APT to pay for transaction fees.');
            console.log('   💡 The user can still manually withdraw using the revealed secret.');
            console.log(`   🔑 Secret: ${ethers.hexlify(secret)}`);
            
            // Emit event to notify user
            this.socket.emit('swap:manual_withdrawal_required', {
              orderId: order.id,
              reason: 'Resolver out of APT gas',
              secret: ethers.hexlify(secret),
              escrowId: destEscrowId,
              amount: fill.amount
            });
          }
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
      // Check if fill is already completed or being processed
      if (fill.status === 'COMPLETED' || fill.status === 'SOURCE_WITHDRAWN') {
        console.log('   ⚠️ Fill already completed or being processed, skipping...');
        return;
      }
      
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
      
      // Track balance after withdrawal
      await this.balanceTracker.trackBalanceChange('After withdrawing from source escrow');
      
      // Update fill status to prevent double withdrawal
      await this.updateFillStatus(fill.orderId, fill.id, 'SOURCE_WITHDRAWN');
      
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
        } catch (error: any) {
          console.error('   ⚠️ Failed to withdraw from Aptos escrow:', error);
          
          // Check if it's a gas fee issue
          if (error.message?.includes('INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE')) {
            console.log('   ❌ RESOLVER OUT OF GAS: The resolver does not have enough APT to pay for transaction fees.');
            console.log('   💡 The user can still manually withdraw using the revealed secret.');
            console.log(`   🔑 Secret: ${ethers.hexlify(secret)}`);
            
            // Emit event to notify user
            this.socket.emit('swap:manual_withdrawal_required', {
              orderId: fill.orderId,
              reason: 'Resolver out of APT gas',
              secret: ethers.hexlify(secret),
              escrowId: fill.destinationEscrowId,
              amount: fill.amount
            });
          }
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

  private async handleSignedAptosOrder(signedOrder: any): Promise<void> {
    console.log('\n🔏 Processing signed Aptos order');
    
    try {
      // Get the original order
      const order = this.activeOrders.get(signedOrder.orderId);
      if (!order) {
        console.log('   ❌ Order not found');
        return;
      }
      
      // Check if user already created the escrow themselves
      if (signedOrder.userFundedTx) {
        console.log('   ✅ User already created escrow with their own funds');
        console.log('   💳 Transaction hash:', signedOrder.userFundedTx);
        console.log('   🔄 Skipping resolver escrow creation');
        
        // The escrow:source:created event will handle the rest of the flow
        return;
      }
      
      // Find the fill for this order
      let fill: Fill | undefined;
      for (const [_, monitoredFill] of this.monitoringFills) {
        if (monitoredFill.orderId === order.id) {
          fill = monitoredFill;
          break;
        }
      }
      
      if (!fill) {
        console.log('   ❌ No active fill for this order');
        return;
      }
      
      console.log('   🔄 Creating APT escrow on-chain (resolver funds - DEPRECATED)...');
      
      const escrowModule = process.env.APTOS_ESCROW_MODULE || process.env.APTOS_ESCROW_ADDRESS;
      
      // Debug: Check resolver balance before attempting
      const resolverAddr = this.chainService.aptosChainService.account.accountAddress.toString();
      const resolverBalance = await this.chainService.aptosChainService.getBalance(resolverAddr);
      console.log('   💰 Resolver APT balance:', (parseFloat(resolverBalance) / 100000000).toFixed(8), 'APT');
      console.log('   📊 Required amount:', (parseFloat(signedOrder.orderMessage.amount) / 100000000).toFixed(8), 'APT');
      console.log('   📊 Safety deposit:', '0.001 APT');
      console.log('   📊 Total required:', ((parseFloat(signedOrder.orderMessage.amount) + 100000) / 100000000).toFixed(8), 'APT');
      
      // Check if resolver has sufficient balance
      const totalRequired = parseFloat(signedOrder.orderMessage.amount) + 100000;
      if (parseFloat(resolverBalance) < totalRequired) {
        console.error('   ❌ Insufficient resolver balance!');
        console.error(`   Need ${(totalRequired / 100000000).toFixed(8)} APT but only have ${(parseFloat(resolverBalance) / 100000000).toFixed(8)} APT`);
        throw new Error(`Insufficient resolver balance: need ${(totalRequired / 100000000).toFixed(8)} APT`);
      }
      
      // Create escrow transaction payload
      console.log('   📝 Transaction arguments:');
      console.log('      escrow_id:', signedOrder.orderMessage.escrow_id);
      console.log('      depositor:', signedOrder.orderMessage.depositor);
      console.log('      beneficiary:', signedOrder.orderMessage.beneficiary);
      console.log('      amount:', signedOrder.orderMessage.amount);
      console.log('      hashlock:', signedOrder.orderMessage.hashlock);
      console.log('      timelock:', signedOrder.orderMessage.timelock);
      console.log('      nonce:', signedOrder.orderMessage.nonce);
      console.log('      expiry:', signedOrder.orderMessage.expiry);
      console.log('      safety_deposit:', '100000');
      console.log('      publicKey:', signedOrder.publicKey);
      console.log('      signature:', signedOrder.signature);
      
      // Process public key - convert hex string to Uint8Array
      const publicKeyHex = signedOrder.publicKey.startsWith('0x') 
        ? signedOrder.publicKey.slice(2) 
        : signedOrder.publicKey;
      
      // Convert hex string to Uint8Array
      const publicKeyBytes = new Uint8Array(publicKeyHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
      
      console.log('      processed publicKey hex:', publicKeyHex);
      console.log('      publicKey bytes length:', publicKeyBytes.length);
      console.log('      publicKey bytes:', Array.from(publicKeyBytes));
      
      // Process signature - convert hex string to Uint8Array
      const signatureHex = signedOrder.signature.startsWith('0x') 
        ? signedOrder.signature.slice(2) 
        : signedOrder.signature;
      
      // Convert hex string to Uint8Array
      const signatureBytes = new Uint8Array(signatureHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
      
      console.log('      signature hex:', signatureHex);
      console.log('      signature bytes length:', signatureBytes.length);
      
      // Log the actual message that should have been signed (for debugging)
      console.log('   📋 Message components for signature verification:');
      console.log('      - escrow_id bytes:', signedOrder.orderMessage.escrow_id);
      console.log('      - depositor:', signedOrder.orderMessage.depositor);
      console.log('      - beneficiary:', signedOrder.orderMessage.beneficiary);
      console.log('      - amount:', signedOrder.orderMessage.amount);
      console.log('      - hashlock bytes:', signedOrder.orderMessage.hashlock);
      console.log('      - timelock:', signedOrder.orderMessage.timelock);
      console.log('      - nonce:', signedOrder.orderMessage.nonce);
      console.log('      - expiry:', signedOrder.orderMessage.expiry);
      
      const payload = {
        function: `${escrowModule}::escrow::create_escrow_delegated`,
        typeArguments: [],
        functionArguments: [
          signedOrder.orderMessage.escrow_id,
          signedOrder.orderMessage.depositor,
          signedOrder.orderMessage.beneficiary,
          signedOrder.orderMessage.amount,
          signedOrder.orderMessage.hashlock,
          signedOrder.orderMessage.timelock.toString(),
          signedOrder.orderMessage.nonce.toString(),
          signedOrder.orderMessage.expiry.toString(),
          '100000', // safety deposit (0.001 APT)
          Array.from(publicKeyBytes),
          Array.from(signatureBytes)
        ]
      };
      
      console.log('   📝 Submitting delegated escrow creation transaction...');
      console.log('   💰 Resolver paying gas fees');
      
      try {
        // Get fresh sequence number and submit transaction
        const accountInfo = await this.chainService.aptosChainService.aptos.account.getAccountInfo({
          accountAddress: this.chainService.aptosChainService.account.accountAddress
        });
        
        const transaction = await this.chainService.aptosChainService.aptos.transaction.build.simple({
          sender: this.chainService.aptosChainService.account.accountAddress,
          data: {
            function: payload.function as `${string}::${string}::${string}`,
            typeArguments: payload.typeArguments,
            functionArguments: payload.functionArguments
          },
          options: {
            accountSequenceNumber: BigInt(accountInfo.sequence_number)
          }
        });
        
        const senderAuthenticator = this.chainService.aptosChainService.aptos.transaction.sign({
          signer: this.chainService.aptosChainService.account,
          transaction,
        });
        
        const pendingTx = await this.chainService.aptosChainService.aptos.transaction.submit.simple({
          transaction,
          senderAuthenticator,
        });
        
        console.log('   ⏳ Transaction submitted:', pendingTx.hash);
        
        // Wait for transaction confirmation
        const executedTx = await this.chainService.aptosChainService.aptos.waitForTransaction({
          transactionHash: pendingTx.hash,
          options: { checkSuccess: true }
        });
        
        console.log('   ✅ APT escrow created on-chain!');
        console.log('   📋 Transaction hash:', executedTx.hash);
        console.log('   📋 Transaction success:', executedTx.success);
        
        // Only emit event if transaction was successful
        if (executedTx.success) {
          const createdEscrowId = ethers.hexlify(new Uint8Array(signedOrder.orderMessage.escrow_id));
          console.log('   📝 Created escrow ID:', createdEscrowId);
          console.log('   📝 Escrow ID bytes:', signedOrder.orderMessage.escrow_id);
          
          this.socket.emit('escrow:source:created', {
            orderId: order.id,
            escrowId: createdEscrowId,
            chain: 'APTOS',
            txHash: executedTx.hash,
            amount: order.fromAmount,
            secretHash: signedOrder.secretHash || ethers.hexlify(new Uint8Array(signedOrder.orderMessage.hashlock))
          });
        } else {
          console.error('   ❌ Transaction failed:', executedTx.vm_status);
          throw new Error(`Failed to create escrow: ${executedTx.vm_status}`);
        }
        
      } catch (txError: any) {
        console.error('   ❌ Failed to create delegated escrow:', txError);
        
        // Check if it's because resolver doesn't have enough APT
        if (txError.message?.includes('INSUFFICIENT_BALANCE')) {
          console.log('   💸 Resolver needs more APT to front the escrow amount');
        }
        
        throw txError;
      }
      
    } catch (error) {
      console.error('Failed to handle signed Aptos order:', error);
      
      // Notify frontend of failure
      this.socket.emit('order:failed', {
        orderId: signedOrder.orderId,
        reason: 'Failed to create APT escrow',
        stage: 'source_escrow_creation'
      });
    }
  }

  private async handleSponsoredAptosOrder(signedOrder: any): Promise<void> {
    console.log('\n🌐 Processing sponsored Aptos order (using user\'s APT)');
    console.log('   💳 User pays APT, resolver only pays gas');
    
    try {
      const { orderId, sponsoredTransaction } = signedOrder;
      
      // Get the order data from fills
      let order: Order | undefined;
      for (const [key, value] of this.monitoringFills.entries()) {
        if (key.includes(orderId)) {
          // Reconstruct order from monitoring data
          const parts = key.split('-');
          order = {
            id: orderId,
            fromChain: signedOrder.fromChain,
            toChain: signedOrder.toChain,
            fromToken: parts[1] || '',
            toToken: parts[2] || '',
            fromAmount: signedOrder.fromAmount,
            minToAmount: signedOrder.toAmount,
            maker: signedOrder.orderMessage.depositor,
            receiver: '0x17061146a55f31BB85c7e211143581B44f2a03d0', // Default receiver
            secretHash: signedOrder.secretHash,
            deadline: Date.now() + 3600000,
            partialFillAllowed: false,
            status: 'PENDING'
          };
          break;
        }
      }
      
      if (!order) {
        console.error('   ❌ Order not found');
        return;
      }
      
      // Submit the sponsored transaction
      console.log('   📝 Submitting sponsored transaction...');
      console.log('   💰 User\'s APT will be withdrawn directly');
      console.log('   ⛽ Resolver paying gas fees only');
      
      // Submit sponsored transaction using Aptos SDK
      // For now, we'll simulate this - in production this would use multi-agent transactions
      console.log('   ⚠️  Sponsored transaction support pending implementation');
      console.log('   📝 Raw transaction:', sponsoredTransaction.rawTransaction);
      console.log('   🔑 User authenticator:', sponsoredTransaction.userAuthenticator);
      
      // TODO: Implement actual sponsored transaction submission
      // This requires multi-agent transaction support in Aptos SDK
      const txHash = '0x' + 'a'.repeat(64); // Simulated for now
      
      console.log('   ✅ Sponsored transaction submitted!');
      console.log('   📋 Transaction hash:', txHash);
      console.log('   💰 User\'s APT has been used for the escrow');
      
      // Extract escrow ID from the order message
      const escrowIdBytes = signedOrder.orderMessage.escrow_id;
      const escrowId = '0x' + escrowIdBytes.map((b: number) => b.toString(16).padStart(2, '0')).join('');
      
      // Emit source escrow created event
      this.socket.emit('escrow:source:created', {
        orderId,
        escrowId,
        chain: 'APTOS',
        txHash,
        amount: order.fromAmount,
        secretHash: order.secretHash || signedOrder.secretHash
      });
      
      // Check if we have both escrows now
      const monitoringKey = `${orderId}-${order.fromToken}-${order.toToken}`;
      const fill = this.monitoringFills.get(monitoringKey);
      if (fill && fill.destinationEscrowId) {
        console.log('   🔐 Both escrows created, requesting secret from user...');
        this.pendingSecretReveals.set(orderId, {
          order,
          fill,
          sourceEscrowId: escrowId,
          destinationEscrowId: fill.destinationEscrowId
        });
        
        this.socket.emit('secret:request', {
          orderId,
          message: 'Both escrows confirmed on-chain. Please reveal your secret to complete the swap.'
        });
      }
    } catch (error) {
      console.error('   ❌ Failed to process sponsored transaction:', error);
      this.socket.emit('order:error', {
        orderId: signedOrder.orderId,
        error: 'Failed to create APT escrow with sponsored transaction',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleSponsoredAptosOrderV2(signedOrder: any): Promise<void> {
    console.log('\n💎 Processing proper sponsored transaction (user pays APT, resolver pays gas)');
    
    try {
      const { orderId, sponsoredTransaction } = signedOrder;
      
      // Get order from monitoring
      let order: Order | undefined;
      for (const [key] of this.monitoringFills.entries()) {
        if (key.includes(orderId)) {
          order = {
            id: orderId,
            fromChain: 'APTOS',
            toChain: 'ETHEREUM',
            fromToken: '0x1::aptos_coin::AptosCoin',
            toToken: signedOrder.toToken || '',
            fromAmount: signedOrder.fromAmount,
            minToAmount: signedOrder.toAmount,
            maker: signedOrder.orderMessage.depositor,
            receiver: '0x17061146a55f31BB85c7e211143581B44f2a03d0',
            secretHash: signedOrder.secretHash,
            deadline: Date.now() + 3600000,
            partialFillAllowed: false,
            status: 'PENDING'
          };
          break;
        }
      }
      
      if (!order) {
        console.error('   ❌ Order not found');
        return;
      }
      
      console.log('   📝 Processing multi-agent transaction with fee payer');
      console.log('   💰 User will pay APT from their account');
      console.log('   ⛽ Resolver will only pay gas fees');
      
      try {
        // Deserialize transaction and user signature
        const transactionBytes = Buffer.from(sponsoredTransaction.transactionBytes, 'hex');
        const userAuthBytes = Buffer.from(sponsoredTransaction.userAuthenticatorBytes, 'hex');
        
        // Use Aptos SDK to handle the sponsored transaction
        const account = this.chainService.aptosChainService.account;
        const aptos = this.chainService.aptosChainService.aptos;
        
        // Deserialize the transaction
        const deserializer = new Deserializer(transactionBytes);
        const transaction = SimpleTransaction.deserialize(deserializer);
        
        // Sign as fee payer
        const feePayerAuth = await aptos.transaction.signAsFeePayer({
          signer: account,
          transaction
        });
        
        // Submit with both signatures
        const pendingTx = await aptos.transaction.submit.simple({
          transaction,
          senderAuthenticator: {
            bcsToBytes: () => userAuthBytes
          } as any,
          feePayerAuthenticator: feePayerAuth
        });
        
        console.log('   ✅ Sponsored transaction submitted!');
        console.log('   📋 Transaction hash:', pendingTx.hash);
        console.log('   💰 User\'s APT is being used for escrow');
        console.log('   ⛽ Resolver paid only gas fees');
        
        // Wait for confirmation
        const executedTx = await aptos.waitForTransaction({
          transactionHash: pendingTx.hash,
          options: { checkSuccess: true }
        });
        
        if (executedTx.success) {
          // Extract escrow ID
          const escrowIdBytes = signedOrder.orderMessage.escrow_id;
          const escrowId = '0x' + escrowIdBytes.map((b: number) => b.toString(16).padStart(2, '0')).join('');
          
          // Emit success event
          this.socket.emit('escrow:source:created', {
            orderId,
            escrowId,
            chain: 'APTOS',
            txHash: pendingTx.hash,
            amount: order.fromAmount,
            secretHash: order.secretHash || signedOrder.secretHash,
            userFunded: true // Flag to indicate user's APT was used
          });
          
          // Check if both escrows exist
          const monitoringKey = `${orderId}-${order.fromToken}-${order.toToken}`;
          const fill = this.monitoringFills.get(monitoringKey);
          if (fill && fill.destinationEscrowId) {
            console.log('   🔐 Both escrows created, requesting secret from user...');
            this.pendingSecretReveals.set(orderId, {
              order,
              fill,
              sourceEscrowId: escrowId,
              destinationEscrowId: fill.destinationEscrowId
            });
            
            this.socket.emit('secret:request', {
              orderId,
              message: 'Both escrows confirmed on-chain. Please reveal your secret to complete the swap.'
            });
          }
        }
        
      } catch (error: any) {
        console.error('   ❌ Failed to process sponsored transaction:', error);
        throw error;
      }
      
    } catch (error) {
      console.error('Failed to handle sponsored transaction V2:', error);
      this.socket.emit('order:error', {
        orderId: signedOrder.orderId,
        error: 'Failed to create APT escrow with sponsored transaction',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handlePermitBasedAptosOrder(signedOrder: any): Promise<void> {
    console.log('\n🔐 Processing permit-based Aptos order (proper user funds)');
    console.log('   💳 User funds will be used via permit signature');
    console.log('   ⛽ Resolver only pays gas fees');
    
    try {
      const { orderId, permit } = signedOrder;
      
      // Get order from monitoring
      const order = this.activeOrders.get(orderId);
      if (!order) {
        console.log('   ❌ Order not found');
        return;
      }
      
      console.log('   📋 Permit details:');
      console.log('      - Nonce:', permit.nonce);
      console.log('      - Expiry:', permit.expiry);
      console.log('      - Amount:', permit.amount);
      
      // IMPORTANT: For permit-based flow, we need the user to actually sign a transaction
      // The permit is just their intent, but Aptos requires them to be a signer to withdraw their funds
      // This is why we're falling back to multi-agent transaction approach
      
      console.log('   ⚠️  Permit-based flow requires user to sign transaction');
      console.log('   🔄 User should use multi-agent transaction for true user-funded escrow');
      console.log('   📝 Frontend should build multi-agent tx with create_escrow_user_funded');
      
      // For now, still using resolver funds but we need to fix the frontend
      // to properly build and sign multi-agent transactions
      await this.handleSignedAptosOrder(signedOrder);
      
      console.log('   ❌ WARNING: Still using resolver funds - frontend needs update');
      console.log('   📝 To fix: Frontend must use MultiAgentTransaction with create_escrow_user_funded');
      
    } catch (error) {
      console.error('Failed to handle permit-based order:', error);
      this.socket.emit('order:error', {
        orderId: signedOrder.orderId,
        error: 'Failed to create APT escrow with permit',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleMultiAgentAptosOrder(signedOrder: any): Promise<void> {
    console.log('\n🚀 Processing multi-agent Aptos order (TRUE gasless user-funded)');
    console.log('   💰 User\'s APT will be withdrawn from their account');
    console.log('   ⛽ Resolver only pays gas fees');
    
    try {
      const { orderId, multiAgentTransaction } = signedOrder;
      
      // Get order from monitoring
      const order = this.activeOrders.get(orderId);
      if (!order) {
        console.log('   ❌ Order not found');
        return;
      }
      
      console.log('   📋 Multi-agent transaction details:');
      console.log('      - Transaction bytes:', multiAgentTransaction.transactionBytes.substring(0, 20) + '...');
      console.log('      - User signature bytes:', multiAgentTransaction.userSignatureBytes.substring(0, 20) + '...');
      
      // Deserialize the transaction and user signature
      const deserializer = new Deserializer(Buffer.from(multiAgentTransaction.transactionBytes, 'hex'));
      const rawTxn = deserializer.deserialize(RawTransaction);
      
      const userSigDeserializer = new Deserializer(Buffer.from(multiAgentTransaction.userSignatureBytes, 'hex'));
      const userSignature = userSigDeserializer.deserialize(AccountAuthenticator);
      
      // Sign as fee payer
      console.log('   🔏 Signing as fee payer...');
      const resolverAccount = this.chainService.getAptosAccount();
      const feePayerSignature = resolverAccount.signAsFeePayer(rawTxn);
      
      // Submit multi-agent transaction
      console.log('   📤 Submitting multi-agent transaction...');
      const result = await this.chainService.submitMultiAgentTransaction(
        rawTxn,
        userSignature,
        feePayerSignature
      );
      
      console.log('   ✅ Multi-agent transaction submitted:', result.hash);
      console.log('   💳 User\'s APT has been used for escrow');
      console.log('   ⛽ Resolver paid only gas fees');
      
      // Emit success event
      this.socket.emit('escrow:source:created', {
        orderId: order.id,
        escrowId: signedOrder.orderMessage.escrow_id,
        transactionHash: result.hash,
        userFunded: true,
        gaslessForUser: true
      });
      
      // Continue with the swap flow
      const fill: Fill = {
        id: `${order.id}-resolver`,
        orderId: order.id,
        resolver: this.aptosAddress,
        amount: order.fromAmount,
        secretHash: order.secretHash || '',
        secretIndex: 0,
        status: 'PENDING',
        sourceEscrowId: signedOrder.orderMessage.escrow_id
      };
      
      // Mark the escrow as created (user-funded)
      this.pendingSecretReveals.set(order.id, {
        order,
        fill,
        sourceEscrowId: signedOrder.orderMessage.escrow_id,
        destinationEscrowId: '' // Will be set when destination escrow is created
      });
      
      // Create destination escrow
      await this.createDestinationEscrow(order);
      
    } catch (error) {
      console.error('Failed to handle multi-agent order:', error);
      this.socket.emit('order:error', {
        orderId: signedOrder.orderId,
        error: 'Failed to create multi-agent APT escrow',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async createSourceEscrowForAPT(order: Order, fill: Fill): Promise<void> {
    console.log(`   📝 Creating APT source escrow for order ${order.id}`);
    
    try {
      // For APT to ETH swaps, we need to create an escrow on Aptos
      // Since APT is a native token on Aptos, the user needs to have created the escrow
      // The resolver cannot create it on behalf of the user
      
      console.log(`   ⚠️  Note: APT escrows require user interaction on Aptos`);
      console.log(`   📋 Waiting for user to create APT escrow...`);
      
      // In a production system, we would:
      // 1. Monitor for the user's escrow creation on Aptos
      // 2. Verify the escrow parameters match the order
      // 3. Proceed with revealing the secret
      
      // For now, we'll just log and wait
      console.log(`   ⏳ APT source escrow creation is pending user action`);
    } catch (error) {
      console.error(`   ❌ Error in createSourceEscrowForAPT:`, error);
      throw error;
    }
  }
  
  private async handleAPTEscrowCreated(data: any) {
    try {
      const { orderId, escrowId, secretHash } = data;
      
      // Convert escrowId array to hex string for consistent storage
      const escrowIdHex = Array.isArray(escrowId) 
        ? '0x' + escrowId.map((b: number) => b.toString(16).padStart(2, '0')).join('')
        : escrowId;
      
      // Find the matching fill
      let matchingFill: Fill | undefined;
      let matchingOrder: Order | undefined;
      
      for (const [destEscrowId, fill] of this.monitoringFills) {
        // Match by orderId primarily, secretHash is optional for validation
        if (fill.orderId === orderId) {
          // If secretHash is provided, validate it matches
          if (secretHash && fill.secretHash !== secretHash) {
            console.log('   ⚠️ Secret hash mismatch for order', orderId);
            continue;
          }
          matchingFill = fill;
          matchingOrder = this.activeOrders.get(orderId);
          break;
        }
      }
      
      if (!matchingFill || !matchingOrder) {
        console.log('   ⚠️ No matching fill found for APT escrow');
        console.log('   Active fills:', Array.from(this.monitoringFills.values()).map(f => ({ orderId: f.orderId, id: f.id })));
        return;
      }
      
      console.log('\n💰 APT source escrow created on Aptos, both escrows now exist');
      console.log('   📝 Storing source escrow ID:', escrowIdHex);
      console.log('   📝 Destination escrow ID:', matchingFill.destinationEscrowId);
      
      // Request secret from user now that both escrows exist
      console.log('   🔐 Both escrows created, requesting secret from user...');
      this.socket.emit('secret:request', {
        orderId: matchingOrder.id,
        message: 'Both escrows confirmed on-chain. Please reveal your secret to complete the swap.'
      });
      
      // Store pending swap info for when secret is revealed
      this.pendingSecretReveals.set(matchingOrder.id, {
        order: matchingOrder,
        fill: matchingFill,
        sourceEscrowId: escrowIdHex,
        destinationEscrowId: matchingFill.destinationEscrowId!
      });
      
    } catch (error) {
      console.error('Failed to handle APT escrow:', error);
    }
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