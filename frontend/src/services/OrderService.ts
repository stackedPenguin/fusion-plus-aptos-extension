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
    { name: 'fromToken', type: 'address' },
    { name: 'toToken', type: 'address' },
    { name: 'fromAmount', type: 'uint256' },
    { name: 'minToAmount', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
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
    const domain = { ...EIP712_DOMAIN };
    
    const types = {
      Order: ORDER_TYPE.Order,
    };

    // For cross-chain orders, we need to handle non-Ethereum addresses differently
    // Convert Aptos addresses to a deterministic Ethereum address format for signing
    const aptosToEthAddress = (aptosAddr: string): string => {
      // Use a deterministic conversion: take first 20 bytes of the Aptos address
      if (aptosAddr.startsWith('0x') && aptosAddr.length > 42) {
        return '0x' + aptosAddr.slice(2, 42);
      }
      return aptosAddr;
    };

    const value = {
      fromChain: orderData.fromChain,
      toChain: orderData.toChain,
      fromToken: orderData.fromChain === Chain.APTOS ? aptosToEthAddress(orderData.fromToken) : orderData.fromToken,
      toToken: orderData.toChain === Chain.APTOS ? aptosToEthAddress(orderData.toToken) : orderData.toToken,
      fromAmount: orderData.fromAmount,
      minToAmount: orderData.minToAmount,
      maker: orderData.fromChain === Chain.APTOS ? aptosToEthAddress(orderData.maker) : orderData.maker,
      receiver: orderData.toChain === Chain.APTOS ? aptosToEthAddress(orderData.receiver) : orderData.receiver,
      deadline: orderData.deadline,
      nonce: orderData.nonce,
      partialFillAllowed: orderData.partialFillAllowed,
    };

    // Use _signTypedData to avoid ENS resolution
    return await (signer as any)._signTypedData(domain, types, value);
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