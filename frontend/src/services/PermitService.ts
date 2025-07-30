import { ethers } from 'ethers';

export class PermitService {
  /**
   * Create EIP-712 typed data for a permit
   */
  static createPermitTypedData(
    chainId: number,
    verifyingContract: string,
    owner: string,
    spender: string,
    value: string,
    nonce: string,
    deadline: number
  ) {
    return {
      domain: {
        name: 'Fusion+ Cross-Chain Swap',
        version: '1',
        chainId: chainId,
        verifyingContract: verifyingContract
      },
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      value: {
        owner,
        spender,
        value,
        nonce,
        deadline
      }
    };
  }

  /**
   * Sign a permit using EIP-712
   */
  static async signPermit(
    signer: ethers.Signer,
    permitData: {
      chainId: number;
      verifyingContract: string;
      owner: string;
      spender: string;
      value: string;
      nonce: string;
      deadline: number;
    }
  ): Promise<string> {
    const typedData = this.createPermitTypedData(
      permitData.chainId,
      permitData.verifyingContract,
      permitData.owner,
      permitData.spender,
      permitData.value,
      permitData.nonce,
      permitData.deadline
    );

    // Sign using EIP-712
    const signature = await signer.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.value
    );

    return signature;
  }

  /**
   * Get permit nonce from contract
   */
  static async getPermitNonce(
    provider: ethers.Provider,
    permitContract: string,
    owner: string
  ): Promise<string> {
    const NONCE_ABI = [
      {
        "inputs": [{"name": "owner", "type": "address"}],
        "name": "getNonce",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      }
    ];

    const contract = new ethers.Contract(permitContract, NONCE_ABI, provider);
    const nonce = await contract.getNonce(owner);
    return nonce.toString();
  }

  /**
   * Create a complete order with permit
   */
  static async createOrderWithPermit(
    orderData: any,
    signer: ethers.Signer,
    permitContract: string,
    resolverAddress: string
  ) {
    const provider = signer.provider;
    if (!provider) throw new Error('No provider');

    const chainId = (await provider.getNetwork()).chainId;
    const owner = await signer.getAddress();
    
    // Get current permit nonce
    const permitNonce = await this.getPermitNonce(provider, permitContract, owner);
    
    // Create permit data
    const permit = {
      owner,
      spender: resolverAddress,
      value: orderData.fromAmount,
      nonce: permitNonce,
      deadline: orderData.deadline
    };

    // Sign permit
    const permitSignature = await this.signPermit(signer, {
      chainId: Number(chainId),
      verifyingContract: permitContract,
      ...permit
    });

    // Create order with permit
    const orderWithPermit = {
      ...orderData,
      permit,
      permitSignature
    };

    // Sign the complete order
    const orderSignature = await this.signOrder(signer, orderWithPermit);

    return {
      ...orderWithPermit,
      signature: orderSignature
    };
  }

  /**
   * Sign the complete order including permit
   */
  static async signOrder(signer: ethers.Signer, orderData: any): Promise<string> {
    const provider = signer.provider;
    if (!provider) throw new Error('No provider');

    const chainId = (await provider.getNetwork()).chainId;

    // Create order typed data
    const typedData = {
      domain: {
        name: 'FusionPlusAptos',
        version: '1',
        chainId: Number(chainId)
      },
      types: {
        Order: [
          { name: 'fromChain', type: 'string' },
          { name: 'toChain', type: 'string' },
          { name: 'fromToken', type: 'string' }, // Changed to string to support cross-chain tokens
          { name: 'toToken', type: 'string' },
          { name: 'fromAmount', type: 'uint256' },
          { name: 'minToAmount', type: 'uint256' },
          { name: 'maker', type: 'string' }, // Changed to string to support cross-chain addresses
          { name: 'receiver', type: 'string' },
          { name: 'deadline', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'partialFillAllowed', type: 'bool' },
          { name: 'permitHash', type: 'bytes32' }
        ]
      },
      value: {
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
        permitHash: ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'address', 'uint256', 'uint256', 'uint256'],
            [
              orderData.permit.owner,
              orderData.permit.spender,
              orderData.permit.value,
              orderData.permit.nonce,
              orderData.permit.deadline
            ]
          )
        )
      }
    };

    return await signer.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.value
    );
  }
}