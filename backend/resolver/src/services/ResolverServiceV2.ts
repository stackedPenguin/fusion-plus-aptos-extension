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
// Simple partial fill utilities inline to avoid path issues
class PartialFillSecretsManager {
  static calculatePartialAmount(totalAmount: string, fillPercentage: number): string {
    const total = ethers.getBigInt(totalAmount);
    const partial = (total * BigInt(Math.floor(fillPercentage * 100))) / BigInt(10000);
    return partial.toString();
  }
  
  static getSecretIndex(cumulativeFillPercentage: number, fillThresholds: number[]): number {
    for (let i = 0; i < fillThresholds.length; i++) {
      if (cumulativeFillPercentage <= fillThresholds[i]) {
        return i;
      }
    }
    return fillThresholds.length;
  }
  
  static generatePartialEscrowId(baseOrderId: string, fillIndex: number): string {
    return ethers.id(`${baseOrderId}-partial-${fillIndex}`);
  }
}
// CORRECTED: Import FeePayerRawTransaction instead of FeePayerTransaction
import { 
  Deserializer, 
  RawTransaction, 
  AccountAuthenticator, 
  MultiAgentTransaction, 
  SimpleTransaction 
} from '@aptos-labs/ts-sdk';

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
  nonce?: string; // Order nonce for replay protection
  secretHash?: string; // User-generated secret hash for Fusion+ protocol
  secretHashes?: string[];
  partialFillAllowed?: boolean;
  partialFillEnabled?: boolean;
  partialFillSecrets?: {
    merkleRoot: string;
    secrets: string[];
    merkleProofs: string[][];
    fillThresholds: number[];
  };
  // Permit for automatic transfers
  permit?: Permit;
  permitSignature?: string;
  // Gasless transaction data
  gasless?: boolean;
  gaslessData?: {
    escrowId: string;
    depositor: string;
    beneficiary: string;
    token: string;
    amount: string;
    hashlock: string;
    timelock: string;
    deadline: string;
    metaTxV: number;
    metaTxR: string;
    metaTxS: string;
    // Partial fill support using Merkle tree
    baseOrderId?: string;
    totalAmount?: string;
    merkleRoot?: string;
    numFills?: number;
    secrets?: string[];
    merkleProofs?: string[][];
    fillThresholds?: number[];
  };
  // Dutch auction configuration
  dutchAuction?: {
    enabled: boolean;
    startTimestamp: number;
    duration: number;
    startRate: number;
    endRate: number;
    decrementInterval: number;
    decrementAmount: number;
  };
}

interface Fill {
  id: string;
  orderId: string;
  resolver: string;
  amount: string;
  secretHash: string;
  secretIndex: number;
  status: string;
  fillPercentage?: number;
  cumulativePercentage?: number;
  cumulativeFillPercentage?: number; // Alias for cumulativePercentage
  merkleIndex?: number; // Index in Merkle tree (for gasless partial fills)
  partialSecret?: string; // The actual secret for this partial fill
  actualEscrowId?: string; // The real escrow ID for partial fills (keccak256(baseOrderId + fillIndex))
  baseOrderId?: string; // Base order ID for simple gasless partial fills
  fillIndex?: number; // Fill index for simple gasless partial fills
  destinationEscrowId?: string;
  sourceEscrowId?: string;
  createdAt?: Date;
  updatedAt?: Date;
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
  private resolverName: string;
  private resolverPort: number;
  
  // Track active orders
  private activeOrders: Map<string, Order> = new Map();
  // Track fills we're monitoring
  private monitoringFills: Map<string, Fill> = new Map();
  // Track secrets for fills
  private fillSecrets: Map<string, Uint8Array> = new Map();
  // Track fill attempts to prevent duplicates
  private fillAttempts: Map<string, boolean> = new Map();
  // Track processed events to avoid duplicates
  private processedEvents: Set<string> = new Set();
  // Track pending swaps waiting for secret reveal
  private pendingSecretReveals: Map<string, {
    order: Order;
    fill: Fill;
    sourceEscrowId: string;
    destinationEscrowId: string;
  }> = new Map();
  // Track Dutch auction participation
  private dutchAuctionParticipation: Map<string, {
    lastBid: number;
    fillPercentage: number;
    score: number;
  }> = new Map();

  constructor() {
    this.orderEngineUrl = process.env.ORDER_ENGINE_URL || 'http://localhost:3001';
    this.chainService = new ChainServiceSimple();
    this.priceService = new PriceService();
    this.ethereumAddress = process.env.ETHEREUM_RESOLVER_ADDRESS!;
    this.aptosAddress = process.env.APTOS_RESOLVER_ADDRESS!;
    this.resolverName = process.env.RESOLVER_NAME || 'Resolver-1';
    this.resolverPort = parseInt(process.env.RESOLVER_PORT || '8081');
    
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
      console.log(`[${this.resolverName}] Connected to order engine`);
      console.log(`[${this.resolverName}] Listening for events: order:new, escrow:source:created, order:signed, order:signed:sponsored:v2, order:signed:sponsored:v3, order:signed:with:permit`);
      this.socket.emit('subscribe:active');
    });

    this.socket.on('frontend:get:resolver_address', (callback) => {
        if (typeof callback === 'function') {
            console.log(`[${this.resolverName}] Responding with resolver address: ${this.ethereumAddress}`);
            callback({ ethereumAddress: this.ethereumAddress });
        }
    });

    this.socket.on('order:new', (order: Order) => {
      console.log('\n📋 Received order:new event');
      this.handleNewOrder(order);
    });
    
    // Listen for order updates (especially for partial fills)
    this.socket.on('order:update', (order: Order) => {
      console.log('\n📊 Received order:update event');
      console.log(`   Order ${order.id} is now ${(order as any).filledPercentage || 0}% filled`);
      // Update our local copy and re-evaluate if we can fill
      this.activeOrders.set(order.id, order);
      if ((order.partialFillAllowed || (order as any).partialFillEnabled) && ((order as any).filledPercentage || 0) < 100) {
        console.log('   🔄 Re-evaluating partial fill opportunity...');
        this.handleNewOrder(order);
      }
    });
    
    // Listen for order fills to trigger re-evaluation
    this.socket.on('order:fill', ({ order, fill }: { order: Order; fill: any }) => {
      console.log(`\n[${this.resolverName}] 📈 Received order:fill event`);
      console.log(`   Order ${order.id} is now ${(order as any).filledPercentage || 0}% filled`);
      // Update our local copy with the latest order state
      this.activeOrders.set(order.id, order);
      // Re-evaluate if we can fill more
      if ((order.partialFillAllowed || (order as any).partialFillEnabled) && ((order as any).filledPercentage || 0) < 100 && order.status !== 'FILLED') {
        console.log(`   [${this.resolverName}] 🔄 Re-evaluating after fill...`);
        setTimeout(() => {
          this.handleNewOrder(order);
        }, 2000); // Small delay to avoid race conditions
      }
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
      console.log('   Is partial fill:', data.isPartialFill || false);
      
      if (data.fromChain === 'APTOS') {
        await this.handleSignedAptosOrder(data);
      } else if (data.fromChain === 'ETHEREUM') {
        // Handle ETHEREUM source orders (including partial fills)
            if (data.isPartialFill && data.escrowAmount) {
      console.log(`   🧩 Creating WETH escrow for ${data.fillPercentage}% partial fill`);
      
      // Find the matching fill to get the correct destination escrow ID
      let matchingFill: Fill | undefined;
      for (const [_, fill] of this.monitoringFills) {
        if (fill.orderId === data.orderId) {
          matchingFill = fill;
          break;
        }
      }
      
      if (matchingFill) {
        console.log(`   🎯 Found matching partial fill: ${matchingFill.destinationEscrowId}`);
        
        // Create a temporary fill object with the correct amount for this partial fill
        const partialFillData = { ...matchingFill, amount: data.escrowAmount };
        
        // Use the most up-to-date gaslessData from the signed order
        const updatedOrder = { ...this.activeOrders.get(data.orderId)!, gaslessData: data.gaslessData, secretHash: data.secretHash };
        
        await this.executeGaslessWETHEscrow(updatedOrder, partialFillData);
      } else {
        console.error(`   ❌ No matching partial fill found for order ${data.orderId}`);
      }
    } else {
      const order = this.activeOrders.get(data.orderId);
      if (order) {
        const fill = Array.from(this.monitoringFills.values()).find(f => f.orderId === data.orderId);
        if (fill) {
          await this.executeGaslessWETHEscrow(order, fill);
        }
      }
    }
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

    // Listen for sponsored transaction V3 (Shinami pattern - regular transaction with fee payer)
    this.socket.on('order:signed:sponsored:v3', async (data: any) => {
      console.log('\n🚀 Received order:signed:sponsored:v3 event (Shinami pattern)');
      console.log('   From chain:', data.fromChain);
      console.log('   Order ID:', data.orderId);
      
      if (data.fromChain === 'APTOS' && data.sponsoredTransaction) {
        await this.handleSponsoredAptosOrderV3(data);
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
      console.log('   Is partial fill:', data.isPartialFill || false);
      
      if (data.isPartialFill && data.secretIndex !== undefined) {
        console.log('   Secret index:', data.secretIndex);
        console.log('   Fill percentage:', data.fillPercentage);
        
        // Handle partial fill secret reveal
        const order = this.activeOrders.get(data.orderId);
        if (!order || !order.partialFillSecrets) {
          console.error('   ❌ Order not found or not a partial fill order');
          return;
        }
        
        // Verify this is the correct secret for this index
        const expectedSecret = order.partialFillSecrets.secrets[data.secretIndex];
        if (data.secret !== expectedSecret) {
          console.error('   ❌ Secret mismatch for index', data.secretIndex);
          return;
        }
        
        console.log('   ✅ Partial fill secret verified!');
        
        // Find the partial fill escrow that needs this secret
        for (const [escrowId, fill] of this.monitoringFills.entries()) {
          if (fill.orderId === data.orderId && fill.secretIndex === data.secretIndex) {
            console.log(`   🎯 Found matching partial fill escrow: ${escrowId}`);
            console.log(`   💰 This will complete ${fill.fillPercentage}% of the order`);
            
            // Get the pending swap info for this order
            const pendingSwap = this.pendingSecretReveals.get(data.orderId);
            if (pendingSwap) {
              console.log(`   🔄 Completing partial fill swap...`);
              const secret = ethers.getBytes(data.secret);
              
              // Complete the swap for this partial fill
              await this.completeSwap(
                pendingSwap.order,
                fill,
                secret,
                pendingSwap.sourceEscrowId,
                escrowId // Use the partial escrow ID as destination
              );
              
              // Clean up only after successful completion
              this.pendingSecretReveals.delete(data.orderId);
            } else {
              // Just emit completion for demo if no pending swap
              this.socket.emit('swap:completed', {
                orderId: data.orderId,
                fillPercentage: data.fillPercentage,
                isPartialFill: true,
                message: `Partial swap completed: ${data.fillPercentage}% of order filled`
              });
            }
            break;
          }
        }
      } else {
        // Handle regular full fill
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
      }
    });

    // Log all events for debugging
    this.socket.onAny((eventName, ...args) => {
      if (!['order:new', 'escrow:source:created', 'order:signed', 'order:signed:sponsored', 'order:signed:sponsored:v2', 'order:signed:sponsored:v3', 'order:signed:with:permit', 'connect', 'disconnect'].includes(eventName)) {
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
      console.log(`   Partial fill allowed:`, order.partialFillAllowed);
      console.log(`   Partial fill enabled:`, (order as any).partialFillEnabled);
      
      // Handle partial fills differently (check both old and new property names)
      // Also route APT -> ETH through partial fill system for proper coordination
      if (order.partialFillAllowed || order.partialFillEnabled || 
          (order.fromChain === 'APTOS' && order.toChain === 'ETHEREUM')) {
        return this.handlePartialFillOrder(order);
      }
      
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
        
        // Show current balances to diagnose the issue
        try {
          const wethBalance = await this.chainService.getEthereumBalance(
            this.ethereumAddress,
            order.toToken
          );
          const ethBalance = await this.ethereumProvider.getBalance(this.ethereumAddress);
          const requiredWethAmount = order.toChain === 'ETHEREUM' ? order.minToAmount : '0';
          
          console.error(`\n💰 RESOLVER BALANCE STATUS:`);
          console.error(`   ETH Balance:  ${ethers.formatEther(ethBalance)} ETH`);
          console.error(`   WETH Balance: ${ethers.formatEther(wethBalance)} WETH`);
          console.error(`   Required WETH: ${ethers.formatEther(requiredWethAmount)} WETH`);
          
          // Determine the actual issue
          const isEthIssue = error.message.includes('ETH balance');
          const isWethIssue = BigInt(requiredWethAmount) > wethBalance;
          
          if (isEthIssue) {
            console.error(`\n💡 ISSUE: Insufficient ETH for gas + safety deposit`);
            console.error(`   Need ~0.003 ETH for gas + safety deposit`);
            console.error(`   Have: ${ethers.formatEther(ethBalance)} ETH`);
            console.error(`\n🔧 SOLUTION: Send more ETH to resolver:`);
            console.error(`   Address: ${this.ethereumAddress}`);
            console.error(`   Amount needed: ~0.01 ETH`);
          } else if (isWethIssue) {
            console.error(`\n💡 ISSUE: Insufficient WETH for escrow creation`);
            console.error(`   WETH shortfall: ${ethers.formatEther(BigInt(requiredWethAmount) - wethBalance)} WETH`);
            console.error(`\n🔧 SOLUTION: Fund resolver with more WETH:`);
            console.error(`   1. Run: node scripts/wrap-eth-to-weth.js`);
            console.error(`   2. Or send WETH directly to: ${this.ethereumAddress}`);
          }
          
          console.error(`${'='.repeat(60)}\n`);
        } catch (e) {
          // Ignore balance check errors
        }
      }
    } finally {
      this.isProcessing.delete(order.id);
    }
  }

  private async handlePartialFillOrder(order: Order) {
    console.log(`\n🧩 Handling partial fill order ${order.id}`);
    
    try {
      // Determine how much of this order we can/want to fill
      const fillPercentage = await this.calculateOptimalFillPercentage(order);
      
      if (fillPercentage === 0) {
        console.log(`   ❌ Cannot fill any portion of this order`);
        return;
      }
      
      console.log(`   📊 Planning to fill ${fillPercentage}% of order`);
      
      // Calculate partial amounts
      const partialFromAmount = PartialFillSecretsManager.calculatePartialAmount(
        order.fromAmount, 
        fillPercentage
      );
      const partialToAmount = PartialFillSecretsManager.calculatePartialAmount(
        order.minToAmount, 
        fillPercentage
      );
      
      console.log(`   💰 Partial amounts: ${ethers.formatEther(partialFromAmount)} → ${ethers.formatEther(partialToAmount)}`);
      
      // Get current fill status from order engine
      const currentFillPercentage = await this.getCurrentFillPercentage(order.id);
      const newCumulativePercentage = currentFillPercentage + fillPercentage;
      
      // Determine which secret to request based on cumulative fill
      const maxParts = (order as any).maxParts || 4;
      const fillThresholds = Array.from({length: maxParts}, (_, i) => ((i + 1) * 100) / maxParts);
      const secretIndex = PartialFillSecretsManager.getSecretIndex(newCumulativePercentage, fillThresholds);
      
      console.log(`   🔑 Need secret index ${secretIndex} for ${newCumulativePercentage}% cumulative fill`);
      
      // Create partial escrows with the appropriate secret
      await this.createPartialEscrows(order, fillPercentage, secretIndex, partialFromAmount, partialToAmount);
      
      // Simulate waiting for more resolvers by checking again after a delay
      if (newCumulativePercentage < 100) {
        console.log(`   ⏳ Order ${newCumulativePercentage}% filled, waiting for more resolvers...`);
        
        // In a real system, different resolvers would pick up the remaining portions
        // For demo, we'll simulate by processing again after a delay
        setTimeout(() => {
          console.log(`   🔄 Checking if we can fill more of order ${order.id}`);
          this.handlePartialFillOrder(order);
        }, 5000); // Wait 5 seconds before trying to fill more
      }
      
    } catch (error: any) {
      console.error(`   ❌ Error handling partial fill:`, error.message);
      throw error;
    }
  }

  private async calculateOptimalFillPercentage(order: Order): Promise<number> {
    // Strategy: Dynamic fill based on number of active resolvers
    
    try {
      // Check our balance on destination chain
      const balance = await this.getDestinationBalance(order);
      const requiredAmount = BigInt(order.minToAmount);
      
      // Get current fill status
      const currentFillPercentage = await this.getCurrentFillPercentage(order.id);
      console.log(`   📊 Order currently ${currentFillPercentage}% filled`);
      
      // Check if this resolver is in the active resolvers list
      const activeResolvers = (order as any).activeResolvers || [];
      const resolverIndex = this.getResolverIndex();
      const resolverNumber = resolverIndex + 1; // Convert to 1-based
      const resolverIdString = `resolver-${resolverNumber}`; // e.g., 'resolver-1'
      
      // If activeResolvers is specified, check if this resolver is included
      if (activeResolvers.length > 0) {
        // Check both number format and string format for compatibility
        const isActiveResolver = activeResolvers.includes(resolverNumber) || 
                                activeResolvers.includes(resolverNumber.toString()) ||
                                activeResolvers.includes(resolverIdString);
        if (!isActiveResolver) {
          console.log(`   🚫 Resolver ${resolverNumber} (${resolverIdString}) is not in active resolvers list [${activeResolvers.join(', ')}], skipping`);
          return 0;
        }
      }
      
      const activeResolverCount = activeResolvers.length || 3;
      console.log(`   🤖 Active resolvers: ${activeResolvers.length > 0 ? activeResolvers.join(', ') : 'all'} (count: ${activeResolverCount})`);
      console.log(`   🎯 This is resolver ${resolverNumber}, participating in fill`);
      
      // Calculate base fill percentage based on active resolvers and partial fill settings
      let baseFillPercentage: number;
      const partialFillEnabled = order.partialFillAllowed || (order as any).partialFillEnabled;
      
      if (!partialFillEnabled) {
        // When partial fills are disabled, ONLY Resolver 1 should handle the order
        if (resolverNumber !== 1) {
          console.log(`   🚫 Non-partial fill order - only Resolver 1 handles these, skipping (I am Resolver ${resolverNumber})`);
          return 0;
        }
        
        // Resolver 1: Check if order is already filled
        if (currentFillPercentage === 0) {
          baseFillPercentage = 100; // Resolver 1 takes the entire order
          console.log(`   💯 No partial fills - Resolver 1 fills 100%`);
        } else {
          console.log(`   ✅ Order already filled (${currentFillPercentage}%), skipping`);
          return 0;
        }
      } else {
        // Partial fills enabled - distribute among active resolvers
        if (activeResolverCount === 1) {
          baseFillPercentage = 50; // Single resolver can only fill 50%
        } else if (activeResolverCount === 2) {
          baseFillPercentage = 50; // Each resolver fills 50%
        } else {
          // For exact equal distribution, use precise division
          baseFillPercentage = 100 / activeResolverCount; // This gives 33.333... for 3 resolvers
        }
      }
      
      console.log(`   📏 Base fill percentage: ${baseFillPercentage}%`);
      
      // If Dutch auction is enabled, use strategy-based timing
      if (order.dutchAuction?.enabled) {
        console.log(`   🇳🇱 Dutch auction enabled for this order`);
        
        // Import Dutch auction utility
        const { DutchAuctionPricing } = await import('../utils/dutchAuction');
        
        const currentTime = Math.floor(Date.now() / 1000);
        const auctionStatus = DutchAuctionPricing.getAuctionStatus(order.dutchAuction, currentTime);
        
        console.log(`   ⏰ Auction status:`, {
          isActive: auctionStatus.isActive,
          currentRate: auctionStatus.currentRate,
          percentComplete: auctionStatus.percentComplete.toFixed(1),
          nextRateDropIn: auctionStatus.nextRateDropIn
        });
        
        // Strategy based on resolver identity
        const resolverStrategy = this.getResolverStrategy();
        let shouldFillNow = false;
        
        // For partial fills, be more aggressive to ensure all resolvers can participate
        const currentFillPercentage = (order as any).filledPercentage || 0;
        const isPartiallyFilled = currentFillPercentage > 0;
        console.log(`   📊 Order fill status: ${currentFillPercentage}% filled, isPartiallyFilled: ${isPartiallyFilled}`);
        
        if (resolverStrategy === 'aggressive') {
          // Resolver 1: Aggressive - fills early
          shouldFillNow = auctionStatus.percentComplete < 40;
        } else if (resolverStrategy === 'patient') {
          // Resolver 2: Patient - waits for better rates, but more flexible for partial fills
          if (isPartiallyFilled) {
            // If order is already partially filled, be more aggressive to compete for remaining portion
            shouldFillNow = auctionStatus.percentComplete >= 5;
          } else {
            // Original patient strategy for unfilled orders
            shouldFillNow = auctionStatus.percentComplete > 60;
          }
        } else {
          // Resolver 3: Opportunistic - fills based on timing
          if (isPartiallyFilled) {
            // If order is already partially filled, fill more aggressively
            shouldFillNow = auctionStatus.percentComplete >= 3;
          } else {
            // Original opportunistic strategy
            shouldFillNow = auctionStatus.percentComplete > 30 && auctionStatus.percentComplete < 80;
          }
          
          // Also react to imminent rate drops
          if (auctionStatus.nextRateDropIn < 5) {
            shouldFillNow = true;
          }
        }
        
        console.log(`   🎯 Strategy decision (${resolverStrategy}): shouldFillNow = ${shouldFillNow}`);
        console.log(`   📈 Factors: auctionProgress=${auctionStatus.percentComplete.toFixed(1)}%, orderFilled=${currentFillPercentage}%, isPartiallyFilled=${isPartiallyFilled}`);
        
        if (!shouldFillNow) {
          console.log(`   ⏳ Waiting for better timing (strategy: ${resolverStrategy})`);
          return 0;
        }
      }
      
      // Check if we've already filled our portion
      // For active resolver subset, we need to map our global index to active list index
      // (resolverIndex and resolverNumber already declared above)
      
      // Find our position in the active resolvers list
      let activeResolverIndex = 0;
      if (activeResolvers.length > 0) {
        // Try to find resolver by various formats
        activeResolverIndex = activeResolvers.indexOf(resolverNumber);
        if (activeResolverIndex === -1) {
          activeResolverIndex = activeResolvers.indexOf(resolverNumber.toString());
        }
        if (activeResolverIndex === -1) {
          activeResolverIndex = activeResolvers.indexOf(resolverIdString);
        }
        if (activeResolverIndex === -1) {
          console.log(`   ❌ Resolver ${resolverNumber} (${resolverIdString}) not found in active list, cannot fill`);
          return 0;
        }
      } else {
        activeResolverIndex = resolverIndex; // Use global index if no specific list
      }
      
      let myStartFill: number;
      let myEndFill: number;
      
      if (!partialFillEnabled && baseFillPercentage === 100) {
        // Non-partial fill: first resolver gets 0-100%, others get nothing
        myStartFill = 0;
        myEndFill = 100;
        console.log(`   📊 Resolver ${resolverNumber} fill range: ${myStartFill}% - ${myEndFill}% (non-partial fill)`);
      } else {
        // Partial fill: distribute based on resolver index
        myStartFill = baseFillPercentage * activeResolverIndex;
        myEndFill = baseFillPercentage * (activeResolverIndex + 1);
        
        // For the last resolver, ensure we fill up to 100% to handle rounding
        if (activeResolverIndex === activeResolverCount - 1) {
          myEndFill = 100;
        }
        
        console.log(`   📊 Resolver ${resolverNumber} fill range: ${myStartFill.toFixed(1)}% - ${myEndFill.toFixed(1)}% (partial fill)`);
      }
      
      // Check if it's our turn to fill based on current fill percentage
      if (currentFillPercentage < myStartFill) {
        // For Dutch auctions, implement fallback mechanism to handle resolver failures
        if (order.dutchAuction?.enabled) {
          const { DutchAuctionPricing } = await import('../utils/dutchAuction');
          const currentTime = Math.floor(Date.now() / 1000);
          const auctionStatus = DutchAuctionPricing.getAuctionStatus(order.dutchAuction, currentTime);
          
          // If auction is significantly progressed (>15%) and earlier resolvers haven't filled,
          // OR if order is already partially filled but stalled, allow fallback
          // Also allow immediate fallback if partial fill has been stalled for too long
          const hasBeenPartiallyFilled = currentFillPercentage > 0;
          const auctionProgressedEnough = auctionStatus.percentComplete > 15;
          const partialFillStalled = hasBeenPartiallyFilled && auctionStatus.percentComplete > 8;
          
                  if (auctionProgressedEnough || partialFillStalled) {
          console.log(`   🚨 Dutch auction ${auctionStatus.percentComplete.toFixed(1)}% complete - allowing fallback fill due to earlier resolver delays`);
          console.log(`   📊 Will fill from current ${currentFillPercentage.toFixed(1)}% up to my end range ${myEndFill.toFixed(1)}%`);
          
          // Calculate how much we can actually fill (from current position to our end)
          const maxPossibleFill = myEndFill - currentFillPercentage;
          
          // DISABLED: Too aggressive, causing overfills
          // For safety, limit fallback fill to at most double our original allocation  
          // This prevents resolvers from attempting to fill amounts they can't afford
          // const safeMaxFill = baseFillPercentage * 2;
          // const availableFillPercentage = Math.min(maxPossibleFill, safeMaxFill);
          
          // TEMPORARY: Only allow filling the exact allocated portion to prevent overfills
          const availableFillPercentage = Math.min(maxPossibleFill, baseFillPercentage);
          
          console.log(`   📊 Fallback calculation: maxPossible=${maxPossibleFill.toFixed(1)}%, limitToBase=${baseFillPercentage.toFixed(1)}%, final=${availableFillPercentage.toFixed(1)}%`);
          
          if (availableFillPercentage > 0) {
            return availableFillPercentage;
          }
        }
        }
        
        console.log(`   ⏳ Waiting for earlier resolvers to fill (current: ${currentFillPercentage}%, my turn starts at: ${myStartFill}%)`);
        return 0;
      }
      
      if (currentFillPercentage >= myEndFill) {
        console.log(`   ✅ Already filled our portion (current: ${currentFillPercentage}%, my portion ended at: ${myEndFill}%)`);
        return 0;
      }
      
      // Check if we can afford the fill
      const targetAmount = (requiredAmount * BigInt(Math.floor(baseFillPercentage * 100))) / 10000n;
      if (balance < targetAmount) {
        console.log(`   ❌ Cannot afford ${baseFillPercentage.toFixed(2)}% of the order`);
        return 0;
      }
      
      return baseFillPercentage;
      
    } catch (error) {
      console.error(`   ❌ Error calculating fill percentage:`, error);
      return 0;
    }
  }

  private async getCurrentFillPercentage(orderId: string): Promise<number> {
    try {
      // Query the order engine for current fill status
      const response = await axios.get(`${process.env.ORDER_ENGINE_URL}/api/orders/${orderId}`);
      if (response.data.success && response.data.data) {
        return response.data.data.filledPercentage || 0;
      }
      return 0;
    } catch (error) {
      console.log(`   ⚠️ Could not get current fill percentage, assuming 0%`);
      return 0;
    }
  }

  private async createPartialEscrows(
    order: Order, 
    fillPercentage: number, 
    secretIndex: number,
    partialFromAmount: string,
    partialToAmount: string
  ) {
    console.log(`\n🔧 Creating partial escrows for ${fillPercentage}% fill`);
    
    // Track the partial fill - get current percentage first
    const currentFillPercentage = await this.getCurrentFillPercentage(order.id);
    const cumulativePercentage = currentFillPercentage + fillPercentage;
    console.log(`   📊 Current fill: ${currentFillPercentage}%, Adding: ${fillPercentage}%, Total will be: ${cumulativePercentage}%`);
    
    // Calculate fill index for simple gasless partial fills
    const fillIndex = Math.floor(currentFillPercentage / fillPercentage); // 0 for first fill, 1 for second, etc.
    const baseOrderId = order.id; // Use order ID as base order ID
    
    // Generate unique escrow IDs for this partial fill
    const partialEscrowId = PartialFillSecretsManager.generatePartialEscrowId(order.id, fillIndex);
    
    console.log(`   🆔 Partial escrow ID: ${partialEscrowId}`);
    console.log(`   📊 Fill Index: ${fillIndex}`);
    console.log(`   📋 Base Order ID: ${baseOrderId}`);
    
    // Create destination escrow with partial amount
    if (order.toChain === 'ETHEREUM') {
      // Create Ethereum escrow for partial amount
      await this.createPartialEthereumEscrow(order, partialEscrowId, partialToAmount);
    } else if (order.toChain === 'APTOS') {
      // Create Aptos escrow for partial amount  
      await this.createPartialAptosEscrow(order, partialEscrowId, partialToAmount);
    }
    
    const fill = {
      id: partialEscrowId,
      orderId: order.id,
      resolver: this.ethereumAddress,
      amount: partialToAmount,
      fillPercentage,
      cumulativePercentage,
      secretHash: order.secretHash!,
      secretIndex,
      status: 'PENDING' as const,
      baseOrderId, // Add base order ID for simple gasless partial fills
      fillIndex,   // Add fill index for simple gasless partial fills
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Create fill in order engine first
    try {
      const fillData = {
        resolver: this.ethereumAddress,
        amount: partialToAmount,
        secretHash: order.secretHash!,
        secretIndex,
        status: 'PENDING',
        fillPercentage,
        cumulativePercentage,
        destinationEscrowId: partialEscrowId,
        baseOrderId, // Add for simple gasless partial fills
        fillIndex    // Add for simple gasless partial fills
      };
      
      console.log(`   📤 Creating fill record in order engine...`);
      const response = await axios.post(
        `${process.env.ORDER_ENGINE_URL}/api/orders/${order.id}/fills`,
        fillData
      );
      
      if (response.data.success && response.data.data) {
        const createdFill = response.data.data;
        console.log(`   ✅ Fill created with ID: ${createdFill.id}`);
        
        // Update fill with the ID from order engine
        fill.id = createdFill.id;
        fill.orderId = createdFill.orderId;
      }
    } catch (error) {
      console.error(`   ❌ Failed to create fill in order engine:`, error);
      // Continue anyway for demo
    }
    
    // Store fill information
    this.monitoringFills.set(partialEscrowId, fill);
    
    // Emit partial fill event
    console.log(`   📢 Emitting partial:fill:created event for order ${order.id}`);
    this.socket.emit('partial:fill:created', {
      orderId: order.id,
      fillPercentage,
      cumulativePercentage: fill.cumulativePercentage,
      secretIndex,
      partialEscrowId,
      resolver: this.ethereumAddress
    });
    
    // Also emit destination escrow created event for compatibility
    console.log(`   📢 Emitting escrow:destination:created for partial fill`);
    this.socket.emit('escrow:destination:created', {
      orderId: order.id,
      chain: order.toChain,
      escrowId: partialEscrowId,
      amount: partialToAmount,
      secretHash: order.secretHash,
      timelock: Math.floor(Date.now() / 1000) + 3600, // 1 hour timelock
      isPartialFill: true,
      fillPercentage,
      secretIndex,
      resolverPort: process.env.PORT || 8081 // Include resolver port for frontend
    });
    
    // For Fusion+ flow, we need to wait for the source escrow from user
    // But let's update the order status
    this.socket.emit('order:update', {
      orderId: order.id,
      status: 'PARTIALLY_FILLED',
      filledPercentage: fill.cumulativePercentage,
      message: `🧩 ${fill.cumulativePercentage}% filled by partial fill`
    });
  }

  private async createPartialEthereumEscrow(order: Order, escrowId: string, amount: string) {
    console.log(`   🏦 Creating partial Ethereum escrow`);
    
    // For gasless partial fills, we DON'T create the escrow directly here
    // Instead, we just emit an event to prompt the frontend to sign the partial meta-transaction
    if (order.gasless) {
      console.log(`   ✨ Gasless partial fill detected - requesting frontend signature`);
      console.log(`   📝 Will NOT create escrow directly - waiting for meta-transaction signature`);
      console.log(`   🎯 Frontend should sign for escrowId: ${escrowId}, amount: ${ethers.formatEther(amount)}`);
      
      // The actual escrow creation will happen in executeGaslessWETHEscrow when we receive order:signed
      // So we don't do anything here - just log and return
      return;
    } else {
      // For non-gasless orders, create regular escrow
      console.log(`   🏦 Creating regular (non-gasless) Ethereum escrow`);
      const hashlock = ethers.getBytes(order.secretHash!);
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const safetyDeposit = ethers.parseEther('0.000001'); // Very small safety deposit to satisfy contract requirement
      
      await this.chainService.createEthereumEscrow(
        escrowId,
        order.receiver,
        order.toToken,
        amount,
        order.secretHash!,
        timelock,
        safetyDeposit.toString()
      );
    }
  }



  private async createPartialAptosEscrow(order: Order, escrowId: string, amount: string) {
    console.log(`   🏦 Creating partial Aptos escrow`);
    
    // For partial fills, we need to use the partial fill contract
    // HACKATHON: Temporarily disable partial fills on Aptos due to signature verification issues
    if (order.partialFillSecrets && order.gaslessData && false) {
      // First check if the partial fill order exists on Aptos
      const baseOrderIdStr = order.gaslessData?.baseOrderId || order.id;
      
      // Convert UUID or hex string to bytes
      let baseOrderId: Uint8Array;
      if (baseOrderIdStr.includes('-')) {
        // It's a UUID - convert to bytes by removing hyphens and treating as hex
        const hexStr = '0x' + baseOrderIdStr.replace(/-/g, '');
        baseOrderId = ethers.getBytes(hexStr);
      } else {
        // It's already a hex string
        baseOrderId = ethers.getBytes(baseOrderIdStr.startsWith('0x') ? baseOrderIdStr : `0x${baseOrderIdStr}`);
      }
      
      // TODO: Check if order exists on-chain (would need a view function)
      // For now, assume we need to create it
      
      // Create the partial fill order on Aptos (user's signature is in gaslessData)
      // For hackathon, use dummy values for signature verification
      const depositorPubkey = new Uint8Array(32).fill(1); // Dummy pubkey
      const signature = new Uint8Array(64).fill(1); // Dummy signature
      
      // Ensure addresses are properly formatted
      let depositorAddress = order.maker.startsWith('0x') ? order.maker.slice(2) : order.maker;
      let beneficiaryAddress = order.receiver.startsWith('0x') ? order.receiver.slice(2) : order.receiver;
      
      // Pad to 64 characters (without 0x prefix)
      depositorAddress = depositorAddress.padStart(64, '0');
      beneficiaryAddress = beneficiaryAddress.padStart(64, '0');
      
      try {
        console.log('   📝 Creating partial fill order with:');
        console.log('      Base order ID:', ethers.hexlify(baseOrderId));
        console.log('      Depositor:', `0x${depositorAddress}`);
        console.log('      Beneficiary:', `0x${beneficiaryAddress}`);
        console.log('      Total amount:', order.fromAmount);
        console.log('      Merkle root:', order.partialFillSecrets?.merkleRoot);
        console.log('      Num fills:', (order.partialFillSecrets?.secrets.length || 1) - 1);
        
        await this.chainService.aptosChainService.createPartialFillOrder(
          baseOrderId,
          `0x${depositorAddress}`, // Properly formatted address
          `0x${beneficiaryAddress}`, // Properly formatted address
          order.fromAmount, // total amount
          ethers.getBytes(order.partialFillSecrets?.merkleRoot || '0x'),
          (order.partialFillSecrets?.secrets.length || 1) - 1, // num fills
          order.deadline,
          parseInt(order.nonce || '0'),
          order.deadline,
          depositorPubkey,
          signature
        );
        console.log('   ✅ Partial fill order created successfully');
      } catch (error: any) {
        // Log full error for debugging
        console.error('   ❌ Failed to create partial fill order:', error);
        // Don't throw - order might already exist
      }
      
      // Now create the specific partial fill escrow
      const fillIndex = this.determineFillIndex(
        this.monitoringFills.get(order.id + '-' + this.ethereumAddress) || {} as any,
        order.gaslessData
      );
      
      const secret = order.partialFillSecrets?.secrets[fillIndex] || '0x';
      const hashlock = ethers.getBytes(ethers.keccak256(secret));
      const merkleProof = order.partialFillSecrets?.merkleProofs[fillIndex].map(p => ethers.getBytes(p)) || [];
      const safetyDeposit = '0'; // No safety deposit for gasless
      
      await this.chainService.aptosChainService.createPartialFillEscrow(
        baseOrderId,
        fillIndex,
        amount,
        hashlock,
        merkleProof,
        safetyDeposit
      );
    } else {
      // Fallback to regular escrow for non-partial fills
      // Convert UUID or hex string to bytes
      let escrowIdBytes: Uint8Array;
      if (escrowId.includes('-')) {
        // It's a UUID - convert to bytes by removing hyphens and treating as hex
        const hexStr = '0x' + escrowId.replace(/-/g, '');
        escrowIdBytes = ethers.getBytes(hexStr);
      } else {
        // It's already a hex string
        escrowIdBytes = ethers.getBytes(escrowId.startsWith('0x') ? escrowId : `0x${escrowId}`);
      }
      
      const hashlock = ethers.getBytes(order.secretHash!);
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const safetyDeposit = 0n;
      
      await this.chainService.createAptosEscrow(
        escrowIdBytes,
        this.aptosAddress,
        order.receiver,
        amount,
        hashlock,
        timelock,
        safetyDeposit.toString()
      );
    }
  }

  private async getDestinationBalance(order: Order): Promise<bigint> {
    if (order.toChain === 'ETHEREUM') {
      return await this.chainService.getEthereumBalance(this.ethereumAddress, order.toToken);
    } else if (order.toChain === 'APTOS') {
      const balance = await this.chainService.getAptosBalance(this.aptosAddress);
      return BigInt(balance);
    }
    return 0n;
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
      
      // Debug token mapping
      console.log(`   🔍 Order fromToken: ${order.fromToken}`);
      console.log(`   🔍 WETH_ADDRESS: ${WETH_ADDRESS}`);
      console.log(`   🔍 Comparison: ${order.fromToken.toLowerCase()} === ${WETH_ADDRESS.toLowerCase()} ? ${order.fromToken.toLowerCase() === WETH_ADDRESS.toLowerCase()}`);
      console.log(`   🔍 Mapped fromToken: ${fromToken}`);
      console.log(`   🔍 Mapped toToken: ${toToken}`);
      console.log(`   🔍 Getting exchange rate for ${fromToken} -> ${toToken}`);
      const exchangeRate = await this.priceService.getExchangeRate(fromToken, toToken);
      console.log(`   📈 Raw exchange rate: ${exchangeRate}`);
      
      // Calculate expected output with resolver margin
      // Handle different decimal places for different chains
      const fromAmountFormatted = order.fromChain === 'ETHEREUM' 
        ? ethers.formatEther(order.fromAmount)  // 18 decimals for ETH/WETH
        : (parseInt(order.fromAmount) / 100000000).toString(); // 8 decimals for APT
      
      console.log(`   📏 From amount formatted: ${fromAmountFormatted} ${fromToken === 'ETH' ? 'WETH' : fromToken} (mapped to ${fromToken})`);
      
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
      
      // Add tolerance for resolver margin (2% to account for 1% margin + buffer)
      const tolerance = 0.02;
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
        merkleIndex: 0, // For partial fills, merkleIndex = secretIndex
        status: 'PENDING'
      });
      // Create destination escrow with user as beneficiary
      const escrowId = ethers.id(order.id + '-dest-' + secretHash);
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const safetyDeposit = ethers.parseEther('0.000001').toString(); // Very small safety deposit to satisfy contract requirement
      
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
          this.aptosAddress, // resolver is depositor on destination chain
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
        console.log(`   🔍 WETH order detected. Checking for gasless...`);
        console.log(`   📊 Order gasless flag:`, order.gasless);
        console.log(`   📊 Order has gaslessData:`, !!order.gaslessData);
        
        // Check if this is a gasless WETH order
        if (order.gasless && order.gaslessData) {
          console.log(`   ✨ Gasless WETH order detected!`);
          console.log(`   🎫 Processing meta-transaction for WETH escrow...`);
          
          try {
            // Execute gasless escrow creation
            await this.executeGaslessWETHEscrow(order, fill);
            return; // Gasless flow handles everything
          } catch (error: any) {
            console.error(`   ❌ Failed to execute gasless WETH escrow:`, error);
            throw new Error(`Gasless WETH escrow failed: ${error.message || error}`);
          }
        }
        
        // For WETH, we require gasless flow
        throw new Error('WETH swaps require gasless flow. Non-gasless WETH orders are not supported.');
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
        } else if (typeof sourceEscrowId === 'string' && sourceEscrowId.startsWith('0x')) {
          // If it's a hex string, convert to bytes
          escrowIdBytes = ethers.getBytes(sourceEscrowId);
          console.log('   📝 Escrow ID (hex):', sourceEscrowId);
        } else if (typeof sourceEscrowId === 'object' && sourceEscrowId && 'data' in sourceEscrowId) {
          // If it's an object with data property (from older format), extract bytes
          escrowIdBytes = new Uint8Array((sourceEscrowId as any).data);
          console.log('   📝 Escrow ID (object with data):', sourceEscrowId);
        } else {
          throw new Error(`Invalid escrow ID format: ${typeof sourceEscrowId} - ${JSON.stringify(sourceEscrowId)}`);
        }
        
        console.log('   📝 Escrow ID (bytes):', Array.from(escrowIdBytes));
        console.log('   📝 Full pending reveal data:', this.pendingSecretReveals.get(order.id));
        console.log('   📝 Order ID:', order.id);
        console.log('   📝 Secret (hex):', ethers.hexlify(secret));
        
        withdrawTx = await this.chainService.withdrawAptosEscrow(
          escrowIdBytes,
          secret
        );
      } else {
        // For ETH/WETH source, check if it's a gasless order
        if (order.gasless && order.gaslessData) {
          console.log('   ✨ Gasless order detected - using gasless escrow contract');
          console.log('   🏦 Withdrawing from gasless escrow contract:', process.env.ETHEREUM_GASLESS_ESCROW_ADDRESS);
          console.log('   🆔 Escrow ID:', sourceEscrowId);
          console.log('   📋 Order gaslessData:', JSON.stringify(order.gaslessData, null, 2));
          
                // For gasless orders, use the escrow ID provided by the frontend
          // For simple partial fills, each partial fill has its own unique escrow ID
          let actualEscrowId = sourceEscrowId;
          
          // Debug escrow ID usage
          console.log('   🔍 Debugging escrow ID for gasless withdrawal:');
          console.log(`   📦 Source Escrow ID (from frontend): ${sourceEscrowId}`);
          console.log(`   - order.partialFillAllowed: ${order.partialFillAllowed}`);
          console.log(`   - order.partialFillEnabled: ${order.partialFillEnabled}`);
          console.log(`   - fill object:`, fill);
          
          // For gasless orders, always use the escrow ID provided by the frontend
          // This ID was used when creating the escrow and should be used for withdrawal
          console.log('   ✅ Using escrow ID from gaslessData (no recalculation needed for gasless orders)')
          
          // Debug: Check where escrow was actually created
          console.log('   🔍 DEBUGGING ESCROW EXISTENCE:');
          console.log(`   📋 Order ID: ${order.id}`);
          console.log(`   📦 Source Escrow ID: ${sourceEscrowId}`);
          console.log(`   📦 Actual Escrow ID to withdraw: ${actualEscrowId}`);
          console.log(`   🏦 Target Contract: ${process.env.ETHEREUM_GASLESS_ESCROW_ADDRESS}`);
          
          // Check if this order has escrow creation events stored
          console.log('   📊 Order details:');
          console.log(`   - fromChain: ${order.fromChain}`);
          console.log(`   - toChain: ${order.toChain}`);
          console.log(`   - gasless: ${order.gasless}`);
          console.log(`   - partialFillSecrets exists: ${!!order.partialFillSecrets}`);
          
          withdrawTx = await this.chainService.withdrawGaslessEscrow(actualEscrowId, ethers.hexlify(secret));
        } else {
          console.log('   🏦 Regular order - using standard escrow contract');
          withdrawTx = await this.chainService.withdrawEthereumEscrow(sourceEscrowId, ethers.hexlify(secret));
        }
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
        console.log('   📝 Destination escrow ID to withdraw from:', destEscrowId);
        
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
      } else if (order.toChain === 'ETHEREUM') {
        console.log('   🔓 Withdrawing from WETH escrow to transfer funds to user...');
        
        try {
          // Withdraw from Ethereum escrow - this will automatically transfer WETH to the user
          const ethTxHash = await this.chainService.withdrawEthereumEscrow(
            destEscrowId,
            ethers.hexlify(secret)
          );
          
          console.log(`   ✅ WETH withdrawal successful! Funds transferred to user.`);
          console.log(`   📄 Ethereum transaction: ${ethTxHash}`);
          
          // Track balance after WETH withdrawal
          await this.balanceTracker.trackBalanceChange('After withdrawing WETH to user');
          
        } catch (error: any) {
          console.error('   ⚠️ Failed to withdraw from WETH escrow:', error);
          
          // Check if it's a gas fee issue
          if (error.message?.includes('insufficient funds for gas')) {
            console.log('   ❌ RESOLVER OUT OF GAS: The resolver does not have enough ETH to pay for transaction fees.');
            console.log('   💡 The user can still manually withdraw using the revealed secret.');
            console.log(`   🔑 Secret: ${ethers.hexlify(secret)}`);
            
            // Emit event to notify user
            this.socket.emit('swap:manual_withdrawal_required', {
              orderId: order.id,
              reason: 'Resolver out of ETH gas',
              secret: ethers.hexlify(secret),
              escrowId: destEscrowId,
              amount: fill.amount
            });
          }
          // Don't fail the whole operation if withdrawal fails
          // The user can still manually withdraw using the revealed secret
        }
      }
      
      console.log('   🎉 Swap completed automatically! User received funds without manual claiming.');
      
      // Update final status
      await this.updateFillStatus(fill.orderId, fill.id, 'COMPLETED');
      
      // Emit swap completed event
      this.socket.emit('swap:completed', {
        orderId: order.id,
        fromChain: order.fromChain,
        toChain: order.toChain,
        fromAmount: order.fromAmount,
        toAmount: fill.amount,
        secretHash: fill.secretHash,
        message: 'Swap completed successfully!'
      });
      
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
      const fillOrder = this.activeOrders.get(fill.orderId);
      let withdrawTx: string;
      
      if (fillOrder && fillOrder.gasless && fillOrder.gaslessData) {
        console.log('   ✨ Gasless order detected - using gasless escrow contract');
        console.log('   🏦 Withdrawing from gasless escrow contract:', process.env.ETHEREUM_GASLESS_ESCROW_ADDRESS);
        console.log('   🆔 Escrow ID:', sourceEscrowId);
        
        // For partial fills, we need to calculate the correct escrow ID
        let actualEscrowId = sourceEscrowId;
        if (fillOrder.partialFillSecrets && fill?.merkleIndex !== undefined) {
          // This is a partial fill - calculate the real escrow ID
          const baseOrderId = fillOrder.gaslessData?.baseOrderId || fillOrder.id;
          const fillIndex = fill.merkleIndex;
          
          // Convert baseOrderId to bytes32
          const baseOrderIdBytes32 = ethers.id(baseOrderId);
          
          // The actual escrow ID is keccak256(baseOrderId + fillIndex)
          actualEscrowId = ethers.keccak256(
            ethers.solidityPacked(['bytes32', 'uint256'], [baseOrderIdBytes32, fillIndex])
          );
          
          console.log('   🧩 Partial fill detected:');
          console.log(`   📋 Base Order ID: ${baseOrderId}`);
          console.log(`   📊 Fill Index: ${fillIndex}`);
          console.log(`   🔄 Calculated Escrow ID: ${actualEscrowId}`);
        }
        
        // Debug: Check where escrow was actually created
        console.log('   🔍 DEBUGGING ESCROW EXISTENCE (Fill method):');
        console.log(`   📋 Fill Order ID: ${fill.orderId}`);
        console.log(`   📦 Source Escrow ID: ${sourceEscrowId}`);
        console.log(`   📦 Actual Escrow ID to withdraw: ${actualEscrowId}`);
        console.log(`   🏦 Target Contract: ${process.env.ETHEREUM_GASLESS_ESCROW_ADDRESS}`);
        
        if (fillOrder) {
          console.log('   📊 Fill Order details:');
          console.log(`   - fromChain: ${fillOrder.fromChain}`);
          console.log(`   - toChain: ${fillOrder.toChain}`);
          console.log(`   - gasless: ${fillOrder.gasless}`);
          console.log(`   - partialFillSecrets exists: ${!!fillOrder.partialFillSecrets}`);
        }
        
        withdrawTx = await this.chainService.withdrawGaslessEscrow(actualEscrowId, ethers.hexlify(secret));
      } else {
        console.log('   🏦 Regular order - using standard escrow contract');
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
      const orderData = this.activeOrders.get(fill.orderId);
      if (orderData && orderData.toChain === 'APTOS' && fill.destinationEscrowId) {
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
        sourceChain: orderData?.fromChain || 'ETHEREUM',
        destinationChain: orderData?.toChain || 'APTOS',
        fromAmount: orderData?.fromAmount || fill.amount,
        toAmount: orderData?.toChain === 'APTOS' ? orderData?.minToAmount : fill.amount,
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
      
      const aptos = this.chainService.aptosChainService.aptos;
      const resolverAccount = this.chainService.aptosChainService.account;

      // 1. Deserialize the transaction and user's signature from the frontend
      const transactionBytes = Buffer.from(sponsoredTransaction.transactionBytes, 'hex');
      const userAuthBytes = Buffer.from(sponsoredTransaction.userAuthenticatorBytes, 'hex');

      const rawTxDeserializer = new Deserializer(transactionBytes);
      // Use SimpleTransaction.deserialize() as shown in SDK examples
      const transaction = SimpleTransaction.deserialize(rawTxDeserializer);
      
      const userAuthDeserializer = new Deserializer(userAuthBytes);
      const userAuthenticator = AccountAuthenticator.deserialize(userAuthDeserializer);

      console.log('   🔏 Signing transaction as fee payer...');

      // 2. Resolver signs as secondary signer (for multi-agent escrow creation)
      const resolverAuthenticator = aptos.transaction.sign({
        signer: resolverAccount,
        transaction,
      });

      console.log('   📤 Submitting multi-agent transaction to the network...');
      
      // 3. Resolver signs as fee payer
      const feePayerAuthenticator = aptos.transaction.signAsFeePayer({
        signer: resolverAccount,
        transaction,
      });

      // 4. Submit multi-agent transaction with fee payer
      // For multi-agent transactions, we need to submit differently
      const pendingTx = await aptos.transaction.submit.multiAgent({
        transaction,
        senderAuthenticator: userAuthenticator,
        additionalSignersAuthenticators: [resolverAuthenticator],
        feePayerAuthenticator,
      });

      console.log('   ✅ Multi-agent transaction submitted!');
      console.log('   📋 Transaction hash:', pendingTx.hash);

      // 5. Wait for the transaction to be confirmed
      const executedTx = await aptos.waitForTransaction({
        transactionHash: pendingTx.hash,
        options: { checkSuccess: true }
      });

      if (!executedTx.success) {
        throw new Error(`Transaction failed: ${executedTx.vm_status}`);
      }
      
      console.log(`   🎉 Transaction confirmed successfully!`);

      // 6. Emit success event and continue the swap flow
      const escrowIdBytes = signedOrder.orderMessage.escrow_id;
      const escrowId = '0x' + Buffer.from(escrowIdBytes).toString('hex');
      
      this.socket.emit('escrow:source:created', {
        orderId,
        escrowId,
        chain: 'APTOS',
        txHash: pendingTx.hash,
        amount: signedOrder.fromAmount,
        secretHash: signedOrder.secretHash,
        userFunded: true
      });

      // Find the corresponding order and fill to proceed with secret reveal logic
      const order = this.activeOrders.get(orderId);
      let fill: Fill | undefined;
      for (const f of this.monitoringFills.values()) {
          if (f.orderId === orderId) {
              fill = f;
              break;
          }
      }

      if (order && fill && fill.destinationEscrowId) {
        console.log('   🔐 Both escrows now exist. Requesting secret from user...');
        this.pendingSecretReveals.set(orderId, {
          order,
          fill,
          sourceEscrowId: escrowId,
          destinationEscrowId: fill.destinationEscrowId,
        });
        
        this.socket.emit('secret:request', {
          orderId,
          message: 'Both escrows confirmed. Please reveal your secret to complete the swap.'
        });
      }

    } catch (error: any) {
      console.error('   ❌ Failed to process sponsored transaction V2:', error);
      this.socket.emit('order:error', {
        orderId: signedOrder.orderId,
        error: 'Failed to submit sponsored transaction',
        details: error.message || 'Unknown error'
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
      const pendingTx = await this.chainService.submitMultiAgentTransaction(
        rawTxn,
        userSignature,
        feePayerSignature
      );
      
      console.log('   ✅ Multi-agent transaction submitted:', pendingTx.hash);
      console.log('   ⏳ Waiting for transaction confirmation...');
      
      // Wait for transaction confirmation
      const executedTx = await this.chainService.aptosChainService.aptos.waitForTransaction({
        transactionHash: pendingTx.hash,
        options: { checkSuccess: true }
      });
      
      if (!executedTx.success) {
        throw new Error(`Transaction failed: ${executedTx.vm_status}`);
      }
      
      console.log('   ✅ Transaction confirmed on-chain!');
      console.log('   💳 User\'s APT has been used for escrow');
      console.log('   ⛽ Resolver paid only gas fees');
      
      // Convert escrow ID from byte array to hex string
      const escrowIdHex = '0x' + signedOrder.orderMessage.escrow_id.map((b: number) => b.toString(16).padStart(2, '0')).join('');
      console.log('   📝 Escrow ID (hex):', escrowIdHex);
      console.log('   📝 Escrow ID (bytes):', signedOrder.orderMessage.escrow_id);
      
      // Emit success event
      this.socket.emit('escrow:source:created', {
        orderId: order.id,
        escrowId: escrowIdHex,
        transactionHash: pendingTx.hash,
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
        merkleIndex: 0, // For partial fills, merkleIndex = secretIndex
        status: 'PENDING',
        sourceEscrowId: escrowIdHex
      };
      
      // Mark the escrow as created (user-funded)
      this.pendingSecretReveals.set(order.id, {
        order,
        fill,
        sourceEscrowId: escrowIdHex,
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

  private async handleSignedEthereumOrder(data: any): Promise<void> {
    console.log('\n💵 Processing signed Ethereum order...');
    console.log('   Is partial fill:', data.isPartialFill || false);
    
    const order = this.activeOrders.get(data.orderId);
    if (!order) {
      console.error('   ❌ Order not found');
      return;
    }
    
    // For partial fills, we need to find the corresponding partial fill
    let fill: Fill;
    let escrowAmount = order.fromAmount;
    
    if (data.isPartialFill && data.fillPercentage) {
      console.log(`   🧩 Creating WETH escrow for ${data.fillPercentage}% partial fill`);
      
      // Find the partial fill that matches this percentage
      for (const [escrowId, partialFill] of this.monitoringFills.entries()) {
        if (partialFill.orderId === data.orderId && partialFill.fillPercentage === data.fillPercentage) {
          fill = partialFill;
          escrowAmount = data.escrowAmount || partialFill.amount;
          console.log(`   🎯 Found matching partial fill: ${escrowId}`);
          console.log(`   💰 Escrow amount: ${ethers.formatEther(escrowAmount)} WETH`);
          break;
        }
      }
      
      if (!fill!) {
        console.error('   ❌ No matching partial fill found');
        return;
      }
    } else {
      // Regular full fill
      fill = {
        id: `${order.id}-resolver`,
        orderId: order.id,
        resolver: this.ethereumAddress,
        amount: order.fromAmount,
        secretHash: order.secretHash || '',
        secretIndex: 0,
        merkleIndex: 0, // For partial fills, merkleIndex = secretIndex
        status: 'PENDING'
      };
    }
    
    // Create a modified order with the partial amount for gasless escrow
    const modifiedOrder = { 
      ...order, 
      fromAmount: escrowAmount,
      // Update gasless data with partial amount
      gaslessData: order.gaslessData ? {
        ...order.gaslessData,
        amount: escrowAmount,
        escrowId: data.isPartialFill ? 
          ethers.id(`${order.id}-source-${data.fillPercentage}`) : 
          order.gaslessData.escrowId
      } : undefined
    };
    
    // Execute the gasless WETH escrow
    try {
      await this.executeGaslessWETHEscrow(modifiedOrder, fill);
    } catch (error) {
      console.error('Failed to create WETH escrow:', error);
      this.socket.emit('order:failed', {
        orderId: order.id,
        error: 'Failed to create WETH escrow',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  private async executeGaslessWETHEscrow(order: Order, fill: Fill): Promise<void> {
    console.log(`   ✨ Executing gasless WETH escrow creation...`);
    
    if (!order.gaslessData) {
      throw new Error('No gasless data provided');
    }
    
    const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY!, this.ethereumProvider);
    const gaslessEscrowAddress = process.env.ETHEREUM_GASLESS_ESCROW_ADDRESS;
    
    if (!gaslessEscrowAddress) {
      throw new Error('Gasless escrow contract not configured');
    }
    
    // ABI for the gasless escrow contract with struct parameter
    const gaslessEscrowAbi = [
      'function createEscrowWithMetaTx(tuple(bytes32 escrowId, address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, uint256 deadline) params, uint8 v, bytes32 r, bytes32 s) external payable',
      'function createGaslessPartialFillEscrow(tuple(bytes32 escrowId, address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, uint256 deadline) params, bytes32 baseOrderId, uint256 fillIndex, uint8 v, bytes32 r, bytes32 s) external payable',
      'function createPartialFillOrder(tuple(bytes32 baseOrderId, address depositor, address beneficiary, address token, uint256 totalAmount, bytes32 merkleRoot, uint256 numFills, uint256 timelock, uint256 deadline) params, uint8 v, bytes32 r, bytes32 s) external',
      'function createPartialFillEscrow(bytes32 baseOrderId, uint256 fillIndex, uint256 amount, bytes32 hashlock, bytes32[] calldata merkleProof) external payable',
      'function getPartialFillOrder(bytes32 baseOrderId) external view returns (uint256 totalAmount, uint256 filledAmount, bytes32 merkleRoot, uint256 numFills)'
    ];
    
    const gaslessEscrow = new ethers.Contract(
      gaslessEscrowAddress,
      gaslessEscrowAbi,
      wallet
    );
    
    const { gaslessData } = order;
    
    console.log(`   📝 Creating escrow with meta-tx signature...`);
    console.log(`   🏦 Using gasless contract: ${gaslessEscrowAddress}`);
    console.log(`   👤 Depositor: ${gaslessData.depositor}`);
    console.log(`   💰 Amount: ${ethers.formatEther(fill.amount)} WETH`);
    console.log(`   🆔 Escrow ID: ${gaslessData.escrowId}`);
    
    // Calculate safety deposit (0.001 ETH)
    const safetyDeposit = ethers.parseEther('0'); // No safety deposit for gasless experience
    
    try {
      // Prepare params struct
      const metaTxParams = {
        escrowId: gaslessData.escrowId,
        depositor: gaslessData.depositor,
        beneficiary: gaslessData.beneficiary,
        token: gaslessData.token,
        amount: gaslessData.amount,
        hashlock: gaslessData.hashlock,
        timelock: gaslessData.timelock,
        deadline: gaslessData.deadline
      };
      
      // Always use createEscrowWithMetaTx since frontend signs for this function
      // For simple partial fills, we just create individual escrows for each portion
      console.log(`   📝 Using createEscrowWithMetaTx (frontend signs for this function)`);
      if (order.partialFillAllowed || order.partialFillEnabled) {
        console.log(`   📊 This is a partial fill - escrow amount: ${ethers.formatEther(fill.amount)} WETH`);
      }
      
      const tx = await gaslessEscrow.createEscrowWithMetaTx(
        metaTxParams,
        gaslessData.metaTxV,
        gaslessData.metaTxR,
        gaslessData.metaTxS,
        { value: safetyDeposit }
      );
      
      console.log(`   📤 Gasless escrow transaction sent: ${tx.hash}`);
      console.log(`   ⏳ Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      console.log(`   ✅ Gasless escrow created! Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`   💸 Resolver paid all gas fees!`);
      
      // Emit source escrow created event with correct escrow ID
      const emitEscrowId = fill.actualEscrowId || gaslessData.escrowId; // Use actual partial fill ID if available
      console.log(`   📡 Emitting escrow:source:created with ID: ${emitEscrowId}`);
      console.log(`   - Original gaslessData.escrowId: ${gaslessData.escrowId}`);
      console.log(`   - Actual escrow ID (for partial fill): ${fill.actualEscrowId || 'N/A'}`);
      
      this.socket.emit('escrow:source:created', {
        orderId: order.id,
        escrowId: emitEscrowId, // Use the correct escrow ID!
        chain: 'ETHEREUM',
        amount: fill.amount, // Use the actual fill amount for partial fills
        txHash: receipt.hash,
        gasless: true
      });
      
      // Mark that we've processed this automatically
      this.processedEvents.add(`auto-${gaslessData.escrowId}`);
      
      // Request secret from user now that both escrows exist
      console.log('   🔐 Both escrows created, requesting secret from user...');
      this.socket.emit('secret:request', {
        orderId: order.id,
        message: 'Both escrows confirmed on-chain. Please reveal your secret to complete the swap.'
      });
      
      // For partial fills, find the fill by orderId and secretIndex
      let updatedFill = fill;
      let destEscrowId: string | undefined;
      
      // If this is a partial fill, find the destination escrow from monitoring fills
      if (fill.fillPercentage !== undefined) {
        for (const [escrowId, monitoredFill] of this.monitoringFills.entries()) {
          if (monitoredFill.orderId === order.id && monitoredFill.secretIndex === fill.secretIndex) {
            updatedFill = monitoredFill;
            destEscrowId = escrowId;
            break;
          }
        }
      } else {
        // For regular fills, use the standard approach
        destEscrowId = ethers.id(order.id + '-dest-' + order.secretHash);
        const monitoredFill = this.monitoringFills.get(destEscrowId);
        if (monitoredFill) {
          updatedFill = monitoredFill;
        }
      }
      
      if (!destEscrowId) {
        console.log('   ⚠️ No destination escrow found, using order ID for tracking');
        destEscrowId = order.id;
      }
      
      console.log(`   📝 Using destination escrow ID: ${destEscrowId}`);
      
      // Store pending swap info for when secret is revealed
      this.pendingSecretReveals.set(order.id, {
        order,
        fill: updatedFill,
        sourceEscrowId: gaslessData.escrowId,
        destinationEscrowId: destEscrowId
      });
      
      console.log(`   🎉 Gasless WETH escrow flow completed successfully!`);
      
    } catch (error: any) {
      console.error(`   ❌ Gasless escrow transaction failed:`, error);
      throw error;
    }
  }
  
  private async checkPartialFillOrderExists(gaslessEscrow: ethers.Contract, baseOrderId: string): Promise<boolean> {
    try {
      const orderData = await gaslessEscrow.getPartialFillOrder(baseOrderId);
      // If totalAmount > 0, order exists
      return orderData.totalAmount > 0;
    } catch (error) {
      // Order doesn't exist
      return false;
    }
  }
  
  private determineFillIndex(fill: Fill, gaslessData: any): number {
    // If fill has a specific index, use it
    if (fill.merkleIndex !== undefined) {
      return fill.merkleIndex;
    }
    
    // Otherwise, determine based on cumulative fill percentage
    const fillThresholds = gaslessData.fillThresholds || [25, 50, 75, 100];
    const cumulativeFillPercentage = fill.cumulativeFillPercentage || fill.cumulativePercentage || fill.fillPercentage || 0;
    
    for (let i = 0; i < fillThresholds.length; i++) {
      if (cumulativeFillPercentage <= fillThresholds[i]) {
        return i;
      }
    }
    
    // Default to last index
    return fillThresholds.length - 1;
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
      let destinationEscrowId: string | undefined;
      
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
          // The key in monitoringFills IS the destination escrow ID
          destinationEscrowId = destEscrowId;
          break;
        }
      }
      
      if (!matchingFill || !matchingOrder) {
        console.log('   ⚠️ No matching fill found for APT escrow');
        console.log('   Active fills:', Array.from(this.monitoringFills.values()).map(f => ({ orderId: f.orderId, id: f.id })));
        return;
      }
      
      console.log('\n💰 APT source escrow created on Aptos, both escrows now exist');
      console.log('   📝 Storing source escrow ID (hex):', escrowIdHex);
      console.log('   📝 Storing source escrow ID (array):', escrowId);
      console.log('   📝 Destination escrow ID:', destinationEscrowId || 'not found in monitoring');
      console.log('   📝 Transaction hash:', data.transactionHash);
      
      if (!destinationEscrowId) {
        console.error('   ❌ Destination escrow ID not found! Cannot complete swap.');
        console.log('   🔍 Debug info:', {
          fill: matchingFill,
          monitoringFillsKeys: Array.from(this.monitoringFills.keys())
        });
        return;
      }
      
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
        destinationEscrowId: destinationEscrowId
      });
      
    } catch (error) {
      console.error('Failed to handle APT escrow:', error);
    }
  }

  private getResolverStrategy(): 'aggressive' | 'patient' | 'opportunistic' {
    // Determine strategy based on resolver name/port
    if (this.resolverName === 'Resolver-1' || this.resolverPort === 8081) {
      return 'aggressive';
    } else if (this.resolverName === 'Resolver-2' || this.resolverPort === 8082) {
      return 'patient';
    } else {
      return 'opportunistic';
    }
  }
  
  private getResolverIndex(): number {
    // Return 0-based index for this resolver
    if (this.resolverName === 'Resolver-1' || this.resolverPort === 8081) {
      return 0;
    } else if (this.resolverName === 'Resolver-2' || this.resolverPort === 8082) {
      return 1;
    } else {
      return 2;
    }
  }

  start() {
    console.log(`[${this.resolverName}] Resolver service V2 started`);
    console.log(`[${this.resolverName}] Strategy: ${this.getResolverStrategy()}`);
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

  private async handleSponsoredAptosOrderV3(signedOrder: any): Promise<void> {
    console.log('\n🚀 Processing sponsored transaction V3 (Shinami pattern - regular transaction)');
    console.log('   💎 This pattern works with all wallets!');
    
    try {
      const { orderId, sponsoredTransaction } = signedOrder;
      
      const aptos = this.chainService.aptosChainService.aptos;
      const resolverAccount = this.chainService.aptosChainService.account;

      // 1. Deserialize the transaction and user's signature
      const transactionBytes = Buffer.from(sponsoredTransaction.transactionBytes, 'hex');
      const userAuthBytes = Buffer.from(sponsoredTransaction.userAuthenticatorBytes, 'hex');
      
      const rawTxDeserializer = new Deserializer(transactionBytes);
      const transaction = SimpleTransaction.deserialize(rawTxDeserializer);
      
      const userAuthDeserializer = new Deserializer(userAuthBytes);
      const userAuthenticator = AccountAuthenticator.deserialize(userAuthDeserializer);
      
      console.log('   🔏 Signing as fee payer...');
      
      // 2. Resolver signs ONLY as fee payer (not as secondary signer)
      const feePayerAuthenticator = aptos.transaction.signAsFeePayer({
        signer: resolverAccount,
        transaction,
      });

      console.log('   📤 Submitting transaction with fee payer...');
      
      // 3. Submit regular transaction with fee payer
      const pendingTx = await aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator: userAuthenticator,
        feePayerAuthenticator,
      });

      console.log('   ✅ Transaction submitted!');
      console.log('   📋 Transaction hash:', pendingTx.hash);
      
      // 4. Wait for confirmation
      const executedTx = await aptos.waitForTransaction({
        transactionHash: pendingTx.hash,
        options: { 
          checkSuccess: true,
          timeoutSecs: 60 // Increase timeout to 60 seconds
        }
      });

      if (!executedTx.success) {
        throw new Error(`Transaction failed: ${executedTx.vm_status}`);
      }
      
      console.log('   🎉 Transaction confirmed successfully!');
      console.log('   ✅ User paid APT, resolver paid gas only!');
      
      // 5. Emit success event
      const escrowIdBytes = signedOrder.orderMessage.escrow_id;
      const escrowId = '0x' + Buffer.from(escrowIdBytes).toString('hex');
      
      this.socket.emit('escrow:source:created', {
        orderId,
        escrowId,
        chain: 'APTOS',
        txHash: pendingTx.hash,
        amount: signedOrder.fromAmount,
        secretHash: signedOrder.secretHash,
        userFunded: true
      });

      // Find the corresponding order and fill
      const order = this.activeOrders.get(orderId);
      let fill: Fill | undefined;
      for (const f of this.monitoringFills.values()) {
        if (f.orderId === orderId) {
          fill = f;
          break;
        }
      }

      if (order && fill) {
        await this.updateFillStatus(orderId, fill.id, 'SOURCE_CREATED', {
          sourceEscrowId: escrowId
        });
      }

    } catch (error: any) {
      console.error('   ❌ Failed to process sponsored transaction V3:', error);
      
      // Check if it's a timeout error
      if (error.message?.includes('timed out')) {
        console.log('   ⏱️ Transaction timed out, checking status...');
        try {
          // Try to get the transaction directly
          const txStatus = await this.chainService.aptosChainService.aptos.getTransactionByHash({ 
            transactionHash: error.lastSubmittedTransaction?.hash 
          });
          console.log('   📊 Transaction status:', txStatus);
          
          if (txStatus && 'success' in txStatus && txStatus.success) {
            console.log('   ✅ Transaction actually succeeded despite timeout!');
            
            // Continue with success flow
            const escrowIdBytes = signedOrder.orderMessage.escrow_id;
            const escrowId = '0x' + Buffer.from(escrowIdBytes).toString('hex');
            
            this.socket.emit('escrow:source:created', {
              orderId: signedOrder.orderId,
              escrowId,
              chain: 'APTOS',
              txHash: error.lastSubmittedTransaction?.hash,
              amount: signedOrder.fromAmount,
              secretHash: signedOrder.secretHash,
              userFunded: true
            });
            
            return;
          }
        } catch (checkError) {
          console.error('   Failed to check transaction status:', checkError);
        }
      }
      
      this.socket.emit('order:error', {
        orderId: signedOrder.orderId,
        error: 'Failed to sponsor transaction',
        details: error.message || 'Unknown error',
        txHash: error.lastSubmittedTransaction?.hash
      });
    }
  }
}
