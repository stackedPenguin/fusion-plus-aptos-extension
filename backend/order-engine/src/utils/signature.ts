import { ethers } from 'ethers';
import { CreateOrderDto, Chain } from '../types/order';

const EIP712_DOMAIN = {
  name: 'FusionPlusAptos',
  version: '1',
  chainId: 1, // Will be dynamic based on network
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

export async function validateOrderSignature(order: CreateOrderDto): Promise<boolean> {
  // In development mode, accept test signatures
  if (process.env.NODE_ENV === 'development' && order.signature === '0x00') {
    console.log('Development mode: Accepting test signature');
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
    
    const types = {
      Order: ORDER_TYPE.Order,
    };

    const value = {
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
  // TODO: Implement Aptos signature validation
  // For now, we'll accept all Aptos signatures in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // In production, this would verify the Ed25519 signature
  // using Aptos SDK
  return false;
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