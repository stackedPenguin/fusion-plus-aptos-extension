import { z } from 'zod';

export enum OrderStatus {
  PENDING = 'PENDING',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED'
}

export enum Chain {
  ETHEREUM = 'ETHEREUM',
  APTOS = 'APTOS'
}

export const CreateOrderSchema = z.object({
  fromChain: z.nativeEnum(Chain),
  toChain: z.nativeEnum(Chain),
  fromToken: z.string(),
  toToken: z.string(),
  fromAmount: z.string(),
  minToAmount: z.string(),
  maker: z.string(),
  receiver: z.string(),
  signature: z.string(),
  deadline: z.number(),
  nonce: z.string(),
  partialFillAllowed: z.boolean().default(false),
  secretHashes: z.array(z.string()).optional() // For partial fills using Merkle tree
});

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export interface Order extends CreateOrderDto {
  id: string;
  status: OrderStatus;
  filledAmount: string;
  createdAt: Date;
  updatedAt: Date;
  fills: Fill[];
}

export interface Fill {
  id: string;
  orderId: string;
  resolver: string;
  amount: string;
  secretHash: string;
  secretIndex: number;
  sourceChainTxHash?: string;
  destChainTxHash?: string;
  status: 'PENDING' | 'LOCKED' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderQuote {
  fromChain: Chain;
  toChain: Chain;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  estimatedToAmount: string;
  priceImpact: number;
  fee: string;
  estimatedTime: number; // seconds
}