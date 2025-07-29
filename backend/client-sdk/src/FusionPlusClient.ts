import { ethers } from 'ethers';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

interface SwapIntent {
  fromChain: 'ETHEREUM' | 'APTOS';
  toChain: 'ETHEREUM' | 'APTOS';
  fromToken: string;
  toToken: string;
  fromAmount: string;
  minToAmount: string;
  maker: string;
  receiver: string;
  deadline: number;
  nonce: string;
}

interface EscrowInfo {
  escrowId: string;
  chain: string;
  secretHash: string;
  timelock: number;
  amount: string;
  beneficiary: string;
}

export class FusionPlusClient {
  private orderEngineUrl: string;
  private relayerUrl: string;
  private socket: Socket;
  private signer?: ethers.Signer;
  
  constructor(
    orderEngineUrl: string = 'http://localhost:3001',
    relayerUrl: string = 'http://localhost:3003'
  ) {
    this.orderEngineUrl = orderEngineUrl;
    this.relayerUrl = relayerUrl;
    this.socket = io(orderEngineUrl);
    
    this.setupSocketListeners();
  }

  setSigner(signer: ethers.Signer) {
    this.signer = signer;
  }

  private setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to Fusion+ order engine');
    });

    this.socket.on('escrow:destination:created', (data: any) => {
      console.log('Destination escrow created:', data);
      // Emit event that UI can listen to
      this.onDestinationEscrowCreated(data);
    });
  }

  // Override this method to handle destination escrow creation
  onDestinationEscrowCreated(data: any) {
    // To be overridden by UI
  }

  async createSwapIntent(params: {
    fromChain: 'ETHEREUM' | 'APTOS';
    toChain: 'ETHEREUM' | 'APTOS';
    fromAmount: string;
    minToAmount: string;
    receiver?: string;
  }): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not set');
    }

    const maker = await this.signer.getAddress();
    const intent: SwapIntent = {
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromChain === 'ETHEREUM' 
        ? ethers.ZeroAddress 
        : '0x1::aptos_coin::AptosCoin',
      toToken: params.toChain === 'ETHEREUM'
        ? ethers.ZeroAddress
        : '0x1::aptos_coin::AptosCoin',
      fromAmount: params.fromAmount,
      minToAmount: params.minToAmount,
      maker,
      receiver: params.receiver || maker,
      deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      nonce: Date.now().toString()
    };

    // Sign the intent
    const signature = await this.signIntent(intent);

    // Submit to order engine
    const response = await axios.post(`${this.orderEngineUrl}/api/orders`, {
      ...intent,
      signature,
      partialFillAllowed: false
    });

    return response.data.data.id;
  }

  private async signIntent(intent: SwapIntent): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not set');
    }

    // For production, implement proper EIP-712 signing
    // For now, return dev signature
    if (process.env.NODE_ENV === 'development') {
      return '0x00';
    }

    // EIP-712 domain
    const domain = {
      name: 'Fusion+ Extension',
      version: '1',
      chainId: intent.fromChain === 'ETHEREUM' ? 11155111 : 1, // Sepolia or Aptos
      verifyingContract: ethers.ZeroAddress // Update with actual contract
    };

    const types = {
      SwapIntent: [
        { name: 'fromChain', type: 'string' },
        { name: 'toChain', type: 'string' },
        { name: 'fromToken', type: 'address' },
        { name: 'toToken', type: 'address' },
        { name: 'fromAmount', type: 'uint256' },
        { name: 'minToAmount', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'receiver', type: 'address' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'string' }
      ]
    };

    return await this.signer.signTypedData(domain, types, intent);
  }

  async createSourceEscrow(
    destinationEscrowInfo: EscrowInfo,
    amount: string
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not set');
    }

    const escrowId = ethers.id(
      destinationEscrowInfo.escrowId + '-source'
    );

    // Prepare relay request
    const relayRequest = {
      chain: 'ETHEREUM' as const,
      type: 'CREATE_ESCROW' as const,
      params: {
        escrowId,
        beneficiary: process.env.REACT_APP_RESOLVER_ETH_ADDRESS, // Resolver is beneficiary
        token: ethers.ZeroAddress, // ETH
        amount,
        hashlock: destinationEscrowInfo.secretHash,
        timelock: destinationEscrowInfo.timelock + 3600, // 1 hour longer
        safetyDeposit: ethers.parseEther('0.001').toString()
      },
      signature: '0x00', // Dev mode
      nonce: Date.now().toString()
    };

    // Submit to relayer for gasless execution
    const response = await axios.post(
      `${this.relayerUrl}/relay`,
      relayRequest
    );

    return response.data.txHash;
  }

  async withdrawFromEscrow(
    escrowId: string,
    secret: string,
    chain: 'ETHEREUM' | 'APTOS'
  ): Promise<string> {
    const relayRequest = {
      chain,
      type: 'WITHDRAW_ESCROW' as const,
      params: {
        escrowId,
        secret
      },
      signature: '0x00', // Dev mode
      nonce: Date.now().toString()
    };

    const response = await axios.post(
      `${this.relayerUrl}/relay`,
      relayRequest
    );

    return response.data.txHash;
  }

  async getOrder(orderId: string) {
    const response = await axios.get(`${this.orderEngineUrl}/api/orders/${orderId}`);
    return response.data.data;
  }

  async getRelayerInfo() {
    const response = await axios.get(`${this.relayerUrl}/info`);
    return response.data;
  }

  disconnect() {
    this.socket.disconnect();
  }
}