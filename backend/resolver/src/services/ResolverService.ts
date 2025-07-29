import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { ethers } from 'ethers';
import { ChainService } from './ChainService';
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
  orderId: string;
  resolver: string;
  amount: string;
  secretHash: string;
  secretIndex: number;
  status: string;
}

export class ResolverService {
  private socket: Socket;
  private chainService: ChainService;
  private orderEngineUrl: string;
  private isProcessing: Set<string> = new Set();

  constructor() {
    this.orderEngineUrl = process.env.ORDER_ENGINE_URL || 'http://localhost:3001';
    this.chainService = new ChainService();
    
    // Connect to order engine WebSocket
    this.socket = io(this.orderEngineUrl);
    this.setupSocketListeners();
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
      
      // Check if order is profitable
      const isProfitable = await this.checkProfitability(order);
      if (!isProfitable) {
        console.log(`Order ${order.id} not profitable, skipping`);
        return;
      }

      // Check if we have sufficient balance
      const hasSufficientBalance = await this.checkBalance(order);
      if (!hasSufficientBalance) {
        console.log(`Insufficient balance for order ${order.id}`);
        return;
      }

      // Execute the swap
      await this.executeSwap(order);
      
    } catch (error) {
      console.error(`Error processing order ${order.id}:`, error);
    } finally {
      this.isProcessing.delete(order.id);
    }
  }

  private async checkProfitability(order: Order): Promise<boolean> {
    // TODO: Implement real profitability check
    // For now, accept all orders in testnet
    return true;
  }

  private async checkBalance(order: Order): Promise<boolean> {
    // TODO: Check resolver's balance on destination chain
    return true;
  }

  private async executeSwap(order: Order) {
    console.log(`Executing swap for order ${order.id}`);
    
    // Generate secret for this fill
    const secret = ethers.randomBytes(32);
    const secretHash = ethers.keccak256(secret);
    
    // Create fill record
    const fill = await this.createFill(order.id, {
      resolver: process.env.RESOLVER_ADDRESS_ETH!,
      amount: order.fromAmount, // Full fill for now
      secretHash,
      secretIndex: 0,
      status: 'PENDING'
    });

    try {
      // Step 1: Lock funds on source chain
      const sourceTxHash = await this.lockFundsOnSourceChain(order, secretHash);
      await this.updateFillStatus(order.id, fill.id, 'LOCKED', { sourceTxHash });

      // Step 2: Lock funds on destination chain
      const destTxHash = await this.lockFundsOnDestinationChain(order, secretHash);
      
      // Step 3: Wait for confirmation
      await this.waitForConfirmations(order);
      
      // Step 4: Reveal secret and withdraw on source chain
      await this.withdrawFromSourceChain(order, secret);
      
      // Step 5: Withdraw on destination chain
      await this.withdrawFromDestinationChain(order, secret);
      
      await this.updateFillStatus(order.id, fill.id, 'COMPLETED', { destTxHash });
      
      console.log(`Successfully completed swap for order ${order.id}`);
    } catch (error) {
      console.error(`Failed to execute swap for order ${order.id}:`, error);
      await this.updateFillStatus(order.id, fill.id, 'FAILED');
      throw error;
    }
  }

  private async createFill(orderId: string, fillData: any): Promise<any> {
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
    txHashes?: { sourceTxHash?: string; destTxHash?: string }
  ) {
    await axios.patch(
      `${this.orderEngineUrl}/api/orders/${orderId}/fills/${fillId}`,
      { status, ...txHashes }
    );
  }

  private async lockFundsOnSourceChain(order: Order, secretHash: string): Promise<string> {
    const escrowId = ethers.id(order.id + '-' + secretHash);
    const timelock = Math.floor(Date.now() / 1000) + 7200; // 2 hours
    const safetyDeposit = ethers.parseEther('0.01');
    
    if (order.fromChain === 'ETHEREUM') {
      return await this.chainService.createEthereumEscrow(
        escrowId,
        order.receiver,
        order.fromToken,
        order.fromAmount,
        secretHash,
        timelock,
        safetyDeposit.toString()
      );
    } else {
      // Aptos source chain
      return await this.chainService.createAptosEscrow(
        ethers.getBytes(escrowId),
        order.receiver,
        order.fromAmount,
        ethers.getBytes(secretHash),
        timelock,
        safetyDeposit.toString()
      );
    }
  }

  private async lockFundsOnDestinationChain(order: Order, secretHash: string): Promise<string> {
    const escrowId = ethers.id(order.id + '-' + secretHash + '-dest');
    const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour (shorter than source)
    const safetyDeposit = ethers.parseEther('0.01');
    
    if (order.toChain === 'ETHEREUM') {
      return await this.chainService.createEthereumEscrow(
        escrowId,
        order.maker,
        order.toToken,
        order.minToAmount,
        secretHash,
        timelock,
        safetyDeposit.toString()
      );
    } else {
      // Aptos destination chain
      return await this.chainService.createAptosEscrow(
        ethers.getBytes(escrowId),
        order.maker,
        order.minToAmount,
        ethers.getBytes(secretHash),
        timelock,
        safetyDeposit.toString()
      );
    }
  }

  private async waitForConfirmations(order: Order) {
    // Wait for block confirmations
    console.log('Waiting for confirmations...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds for testnet
  }

  private async withdrawFromSourceChain(order: Order, secret: Uint8Array) {
    const escrowId = ethers.id(order.id + '-' + ethers.keccak256(secret));
    
    if (order.fromChain === 'ETHEREUM') {
      await this.chainService.withdrawEthereumEscrow(escrowId, ethers.hexlify(secret));
    } else {
      await this.chainService.withdrawAptosEscrow(ethers.getBytes(escrowId), secret);
    }
  }

  private async withdrawFromDestinationChain(order: Order, secret: Uint8Array) {
    const escrowId = ethers.id(order.id + '-' + ethers.keccak256(secret) + '-dest');
    
    if (order.toChain === 'ETHEREUM') {
      await this.chainService.withdrawEthereumEscrow(escrowId, ethers.hexlify(secret));
    } else {
      await this.chainService.withdrawAptosEscrow(ethers.getBytes(escrowId), secret);
    }
  }

  start() {
    console.log('Resolver service started');
    console.log('Watching for profitable orders...');
  }

  stop() {
    this.socket.disconnect();
    console.log('Resolver service stopped');
  }
}