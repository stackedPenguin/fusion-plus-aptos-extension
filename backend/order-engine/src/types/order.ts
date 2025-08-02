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

// Permit schema for EIP-712 automatic transfers
export const PermitSchema = z.object({
  owner: z.string(),
  spender: z.string(),
  value: z.string(),
  nonce: z.string(),
  deadline: z.number()
});

// Gasless data schema for meta-transactions
export const GaslessDataSchema = z.object({
  escrowId: z.string(),
  depositor: z.string(),
  beneficiary: z.string(),
  token: z.string(),
  amount: z.string(),
  hashlock: z.string(),
  timelock: z.string(),
  deadline: z.string(),
  metaTxV: z.number(),
  metaTxR: z.string(),
  metaTxS: z.string()
});

// Partial fill secrets schema using Merkle tree
export const PartialFillSecretsSchema = z.object({
  merkleRoot: z.string(),
  secrets: z.array(z.string()),
  merkleProofs: z.array(z.array(z.string())),
  fillThresholds: z.array(z.number())
});

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
  secretHash: z.string().optional(), // User-generated secret hash for Fusion+ protocol
  secretHashes: z.array(z.string()).optional(), // For partial fills using Merkle tree
  partialFillSecrets: PartialFillSecretsSchema.optional(), // Merkle tree secrets for partial fills
  maxParts: z.number().default(4).optional(), // Max parts to split order (default: 4 for 25% each)
  // Optional permit for automatic transfers
  permit: PermitSchema.optional(),
  permitSignature: z.string().optional(),
  // Optional gasless transaction data
  gasless: z.boolean().optional(),
  gaslessData: GaslessDataSchema.optional()
});

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
export type GaslessData = z.infer<typeof GaslessDataSchema>;
export type PartialFillSecrets = z.infer<typeof PartialFillSecretsSchema>;

export interface Order extends CreateOrderDto {
  id: string;
  status: OrderStatus;
  filledAmount: string;
  filledPercentage: number; // 0-100, tracks partial fill progress
  createdAt: Date;
  updatedAt: Date;
  fills: Fill[];
}

export interface Fill {
  id: string;
  orderId: string;
  resolver: string;
  amount: string;
  fillPercentage: number; // Percentage this fill represents (0-100)
  cumulativePercentage: number; // Total filled including this fill (0-100)
  secretHash: string;
  secretIndex: number; // Index in Merkle tree for partial fills
  merkleProof?: string[]; // Merkle proof for partial fill secret verification
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