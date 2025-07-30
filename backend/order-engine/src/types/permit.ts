import { z } from 'zod';

// EIP-712 Domain
export const EIP712_DOMAIN_NAME = 'Fusion+ Cross-Chain Swap';
export const EIP712_DOMAIN_VERSION = '1';

// Permit types for EIP-712
export const PermitSchema = z.object({
  owner: z.string(), // Address granting the permit
  spender: z.string(), // Address allowed to spend (resolver)
  value: z.string(), // Amount allowed
  nonce: z.string(), // Permit nonce for replay protection
  deadline: z.number(), // Expiry timestamp
});

export type Permit = z.infer<typeof PermitSchema>;

// Extended order with permit for automatic transfers
export const OrderWithPermitSchema = z.object({
  // Original order fields
  fromChain: z.string(),
  toChain: z.string(),
  fromToken: z.string(),
  toToken: z.string(),
  fromAmount: z.string(),
  minToAmount: z.string(),
  maker: z.string(),
  receiver: z.string(),
  deadline: z.number(),
  nonce: z.string(),
  partialFillAllowed: z.boolean().default(false),
  
  // Permit for automatic transfer
  permit: PermitSchema,
  permitSignature: z.string(), // EIP-712 signature of the permit
  
  // Order signature
  signature: z.string(), // Signature of the entire order including permit
});

export type OrderWithPermit = z.infer<typeof OrderWithPermitSchema>;

// EIP-712 type definitions
export const EIP712_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Order: [
    { name: 'fromChain', type: 'string' },
    { name: 'toChain', type: 'string' },
    { name: 'fromToken', type: 'address' },
    { name: 'toToken', type: 'string' },
    { name: 'fromAmount', type: 'uint256' },
    { name: 'minToAmount', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'string' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'partialFillAllowed', type: 'bool' },
    { name: 'permitHash', type: 'bytes32' }, // Hash of the permit
  ],
};