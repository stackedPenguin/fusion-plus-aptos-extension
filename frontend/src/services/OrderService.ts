import axios from 'axios';
import { ethers } from 'ethers';
import io, { Socket } from 'socket.io-client';

export enum Chain {
  ETHEREUM = 'ETHEREUM',
  APTOS = 'APTOS'
}

export interface CreateOrderDto {
  fromChain: Chain;
  toChain: Chain;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  minToAmount: string;
  maker: string;
  receiver: string;
  deadline: number;
  nonce: string;
  partialFillAllowed: boolean;
  signature?: string;
}

const EIP712_DOMAIN = {
  name: 'FusionPlusAptos',
  version: '1',
  chainId: 11155111, // Sepolia
};

const ORDER_TYPE = {
  Order: [
    { name: 'fromChain', type: 'string' },
    { name: 'toChain', type: 'string' },
    { name: 'fromToken', type: 'string' }, // Changed to string to support cross-chain tokens
    { name: 'toToken', type: 'string' }, // Changed to string to support cross-chain tokens
    { name: 'fromAmount', type: 'uint256' },
    { name: 'minToAmount', type: 'uint256' },
    { name: 'maker', type: 'string' }, // Changed to string to support cross-chain addresses
    { name: 'receiver', type: 'string' }, // Changed to string to support cross-chain addresses
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'partialFillAllowed', type: 'bool' },
  ],
};

export class OrderService {
  private apiUrl: string;
  private socket: Socket;

  constructor() {
    this.apiUrl = process.env.REACT_APP_ORDER_ENGINE_URL || 'http://localhost:3001';
    this.socket = io(this.apiUrl);
  }

  async signOrder(orderData: CreateOrderDto, signer: ethers.Signer): Promise<string> {
    // For cross-chain orders involving Aptos, use development mode signature
    // This is temporary until we implement proper cross-chain signature validation
    if (orderData.fromChain === Chain.APTOS || orderData.toChain === Chain.APTOS) {
      console.log('Using development mode signature for cross-chain order');
      return '0x00';
    }

    // For Ethereum-only orders, use proper EIP-712 signing
    const domain = { ...EIP712_DOMAIN };
    
    const types = {
      Order: ORDER_TYPE.Order,
    };

    const value = {
      fromChain: orderData.fromChain,
      toChain: orderData.toChain,
      fromToken: orderData.fromToken,
      toToken: orderData.toToken,
      fromAmount: orderData.fromAmount,
      minToAmount: orderData.minToAmount,
      maker: orderData.maker,
      receiver: orderData.receiver,
      deadline: orderData.deadline,
      nonce: orderData.nonce,
      partialFillAllowed: orderData.partialFillAllowed,
    };
    
    return await signer.signTypedData(domain, types, value);
  }

  async createOrder(orderData: CreateOrderDto & { signature: string }) {
    const response = await axios.post(`${this.apiUrl}/api/orders`, orderData);
    return response.data.data;
  }

  async getOrder(orderId: string) {
    const response = await axios.get(`${this.apiUrl}/api/orders/${orderId}`);
    return response.data.data;
  }

  async getOrdersByMaker(maker: string) {
    const response = await axios.get(`${this.apiUrl}/api/orders/maker/${maker}`);
    return response.data.data;
  }

  async getActiveOrders() {
    const response = await axios.get(`${this.apiUrl}/api/orders`);
    return response.data.data;
  }

  subscribeToOrderUpdates(orderId: string, callback: (order: any) => void) {
    this.socket.emit('subscribe:order', orderId);
    this.socket.on(`order:${orderId}`, callback);
  }

  unsubscribeFromOrderUpdates(orderId: string) {
    this.socket.emit('unsubscribe:order', orderId);
    this.socket.off(`order:${orderId}`);
  }

  disconnect() {
    this.socket.disconnect();
  }
}