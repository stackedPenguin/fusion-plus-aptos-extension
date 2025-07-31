import { ethers } from 'ethers';
import { CreateOrderDto, Chain } from '../types/order';

const EIP712_DOMAIN = {
  name: 'FusionPlusAptos',
  version: '1',
  chainId: 11155111, // Sepolia testnet
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

const ORDER_TYPE_WITH_PERMIT = {
  Order: [
    { name: 'fromChain', type: 'string' },
    { name: 'toChain', type: 'string' },
    { name: 'fromToken', type: 'string' },
    { name: 'toToken', type: 'string' },
    { name: 'fromAmount', type: 'uint256' },
    { name: 'minToAmount', type: 'uint256' },
    { name: 'maker', type: 'string' },
    { name: 'receiver', type: 'string' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'partialFillAllowed', type: 'bool' },
    { name: 'permitHash', type: 'bytes32' }
  ],
};

export async function validateOrderSignature(order: CreateOrderDto): Promise<boolean> {
  // For Aptos orders, signature validation happens on-chain during escrow creation
  if ((order.fromChain === Chain.APTOS || order.toChain === Chain.APTOS) && order.signature === '0x00') {
    console.log('Aptos order - signature validation deferred to on-chain');
    return true;
  }
  
  try {
    if (order.fromChain === Chain.ETHEREUM) {
      return validateEthereumSignature(order);
    } else if (order.fromChain === Chain.APTOS) {
      return validateAptosSignature(order);
    }
    return false;
  } catch (error) {
    console.error('Signature validation error:', error);
    return false;
  }
}

function validateEthereumSignature(order: CreateOrderDto): boolean {
  try {
    const domain = { ...EIP712_DOMAIN };
    
    // Use different types based on whether order has a permit
    const hasPermit = !!order.permit;
    const types = {
      Order: hasPermit ? ORDER_TYPE_WITH_PERMIT.Order : ORDER_TYPE.Order,
    };

    const value: any = {
      fromChain: order.fromChain,
      toChain: order.toChain,
      fromToken: order.fromToken,
      toToken: order.toToken,
      fromAmount: order.fromAmount,
      minToAmount: order.minToAmount,
      maker: order.maker,
      receiver: order.receiver,
      deadline: order.deadline,
      nonce: order.nonce,
      partialFillAllowed: order.partialFillAllowed,
    };

    // Add permitHash if order has a permit
    if (hasPermit && order.permit) {
      value.permitHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'address', 'uint256', 'uint256', 'uint256'],
          [
            order.permit.owner,
            order.permit.spender,
            order.permit.value,
            order.permit.nonce,
            order.permit.deadline
          ]
        )
      );
    }

    const recoveredAddress = ethers.verifyTypedData(
      domain,
      types,
      value,
      order.signature
    );

    return recoveredAddress.toLowerCase() === order.maker.toLowerCase();
  } catch (error) {
    console.error('Ethereum signature validation error:', error);
    return false;
  }
}

function validateAptosSignature(order: CreateOrderDto): boolean {
  // Aptos signature validation is handled on-chain during escrow creation
  // The actual Ed25519 signature is verified by the smart contract
  // when the resolver creates the escrow on behalf of the user
  return order.signature === '0x00';
}

export function generateOrderHash(order: CreateOrderDto): string {
  const orderData = {
    fromChain: order.fromChain,
    toChain: order.toChain,
    fromToken: order.fromToken,
    toToken: order.toToken,
    fromAmount: order.fromAmount,
    minToAmount: order.minToAmount,
    maker: order.maker,
    receiver: order.receiver,
    deadline: order.deadline,
    nonce: order.nonce,
    partialFillAllowed: order.partialFillAllowed,
  };

  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(string,string,address,address,uint256,uint256,address,address,uint256,uint256,bool)'],
      [Object.values(orderData)]
    )
  );
}