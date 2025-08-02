import { ethers } from 'ethers';

// Helper function to convert Uint8Array to hex string
function toHex(uint8array: Uint8Array): string {
  return '0x' + Array.from(uint8array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface GaslessEscrowParams {
  escrowId: Uint8Array;
  depositor: string;
  beneficiary: string;
  token: string; // WETH address
  amount: string;
  hashlock: Uint8Array;
  timelock: number;
  gaslessEscrowAddress: string;
}

interface MetaTxSignature {
  v: number;
  r: string;
  s: string;
}

export class GaslessWETHTransaction {
  private provider: ethers.Provider;
  private gaslessEscrowAddress: string;

  // EIP-712 domain
  private domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };

  // EIP-712 types
  private types = {
    CreateEscrow: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'depositor', type: 'address' },
      { name: 'beneficiary', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'hashlock', type: 'bytes32' },
      { name: 'timelock', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  constructor(provider: ethers.Provider, gaslessEscrowAddress: string, chainId: number) {
    this.provider = provider;
    this.gaslessEscrowAddress = gaslessEscrowAddress;
    
    this.domain = {
      name: 'FusionPlusGaslessEscrow',
      version: '1',
      chainId: chainId,
      verifyingContract: gaslessEscrowAddress
    };
  }

  /**
   * Get current nonce for the user
   */
  async getNonce(userAddress: string): Promise<number> {
    const escrowContract = new ethers.Contract(
      this.gaslessEscrowAddress,
      ['function getNonce(address user) view returns (uint256)'],
      this.provider
    );
    
    const nonce = await escrowContract.getNonce(userAddress);
    return Number(nonce);
  }

  /**
   * Build the meta-transaction message for creating escrow
   */
  async buildMetaTxMessage(params: GaslessEscrowParams): Promise<{
    message: any;
    deadline: number;
  }> {
    const nonce = await this.getNonce(params.depositor);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const message = {
      escrowId: toHex(params.escrowId),
      depositor: params.depositor,
      beneficiary: params.beneficiary,
      token: params.token,
      amount: params.amount,
      hashlock: toHex(params.hashlock),
      timelock: params.timelock,
      nonce: nonce,
      deadline: deadline
    };

    return { message, deadline };
  }

  /**
   * Sign the meta-transaction using EIP-712
   */
  async signMetaTx(
    signer: ethers.Signer,
    params: GaslessEscrowParams
  ): Promise<{
    signature: MetaTxSignature;
    message: any;
    deadline: number;
  }> {
    const { message, deadline } = await this.buildMetaTxMessage(params);

    // Sign using EIP-712
    // For browser wallets, we need to use the provider's send method
    let signature: string;
    
    try {
      // Try the standard ethers v6 method first
      if (typeof (signer as any)._signTypedData === 'function') {
        signature = await (signer as any)._signTypedData(
          this.domain,
          this.types,
          message
        );
      } else if (typeof (signer as any).signTypedData === 'function') {
        // Try ethers v5 method
        signature = await (signer as any).signTypedData(
          this.domain,
          this.types,
          message
        );
      } else {
        // Fallback to using the provider directly
        const provider = signer.provider;
        if (!provider) {
          throw new Error('No provider available for signing');
        }
        
        const address = await signer.getAddress();
        const typedData = {
          domain: this.domain,
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' }
            ],
            ...this.types
          },
          primaryType: 'CreateEscrow',
          message: message
        };
        
        // Use eth_signTypedData_v4
        signature = await (provider as any).send('eth_signTypedData_v4', [
          address.toLowerCase(),
          JSON.stringify(typedData)
        ]);
      }
    } catch (error: any) {
      console.error('Failed to sign typed data:', error);
      throw new Error('Failed to sign gasless transaction: ' + error.message);
    }

    // Split signature
    const sig = ethers.Signature.from(signature);

    return {
      signature: {
        v: sig.v,
        r: sig.r,
        s: sig.s
      },
      message,
      deadline
    };
  }

  /**
   * Check if user needs to provide one-time WETH approval
   * (For fallback if pure gasless doesn't work)
   */
  async checkWETHApproval(
    userAddress: string,
    wethAddress: string
  ): Promise<{
    hasApproval: boolean;
    currentAllowance: bigint;
  }> {
    const wethContract = new ethers.Contract(
      wethAddress,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      this.provider
    );

    const allowance = await wethContract.allowance(userAddress, this.gaslessEscrowAddress);
    const hasApproval = allowance > ethers.parseEther('1'); // At least 1 WETH approved

    return {
      hasApproval,
      currentAllowance: allowance
    };
  }

  /**
   * Prepare data for resolver to execute gasless escrow creation
   */
  prepareGaslessEscrowData(
    params: GaslessEscrowParams,
    metaTxSignature: MetaTxSignature,
    deadline: number
  ): {
    escrowId: string;
    depositor: string;
    beneficiary: string;
    token: string;
    amount: string;
    hashlock: string;
    timelock: string;
    deadline: string;
    metaTxV: number;
    metaTxR: string;
    metaTxS: string;
  } {
    return {
      escrowId: toHex(params.escrowId),
      depositor: params.depositor,
      beneficiary: params.beneficiary,
      token: params.token,
      amount: params.amount,
      hashlock: toHex(params.hashlock),
      timelock: params.timelock.toString(),
      deadline: deadline.toString(),
      metaTxV: metaTxSignature.v,
      metaTxR: metaTxSignature.r,
      metaTxS: metaTxSignature.s
    };
  }

  /**
   * For tokens that support EIP-2612 permit (not WETH)
   */
  async signPermit(
    signer: ethers.Signer,
    token: string,
    spender: string,
    value: string,
    deadline: number
  ): Promise<MetaTxSignature> {
    // Implementation depends on the specific permit interface
    // This is a placeholder for tokens that support permit
    throw new Error('Permit signing not implemented for this token');
  }
}

/**
 * Usage example:
 * 
 * 1. User initiates WETH to APT swap
 * 2. Frontend creates gasless transaction helper:
 *    const gaslessTx = new GaslessWETHTransaction(provider, escrowAddress, chainId);
 * 
 * 3. User signs meta-transaction (no gas):
 *    const { signature, deadline } = await gaslessTx.signMetaTx(signer, escrowParams);
 * 
 * 4. Send to resolver:
 *    const data = gaslessTx.prepareGaslessEscrowData(escrowParams, signature, deadline);
 *    socket.emit('order:gasless:weth', data);
 * 
 * 5. Resolver executes on-chain:
 *    - Calls createEscrowWithMetaTx on the gasless escrow contract
 *    - Pays all gas fees
 *    - User's WETH is locked in escrow without them paying any gas
 */