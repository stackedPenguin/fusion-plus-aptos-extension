// Permit signing utilities for Aptos escrow

// Helper function to convert Uint8Array to hex string (browser-compatible)
function toHex(uint8array: Uint8Array): string {
  return Array.from(uint8array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface EscrowPermitParams {
  escrowId: Uint8Array;
  amount: string;
  beneficiary: string;
  hashlock: Uint8Array;
  timelock: string;
  nonce: string;
  expiry: string;
}

export class PermitSigner {
  /**
   * Generate the permit message that the user needs to sign
   */
  static generatePermitMessage(params: EscrowPermitParams): string {
    // Format: "APTOS_ESCROW_PERMIT:<escrow_id>:<amount>:<beneficiary>:<hashlock>:<timelock>:<nonce>:<expiry>"
    const parts = [
      'APTOS_ESCROW_PERMIT',
      toHex(params.escrowId),
      params.amount,
      params.beneficiary,
      toHex(params.hashlock),
      params.timelock,
      params.nonce,
      params.expiry
    ];
    
    return parts.join(':');
  }

  /**
   * Generate bytes for signing (simple string encoding)
   */
  static generatePermitBytesForSigning(params: EscrowPermitParams): Uint8Array {
    const message = this.generatePermitMessage(params);
    return new TextEncoder().encode(message);
  }

  /**
   * Request user to sign a permit using their wallet
   */
  static async signPermitWithWallet(
    permitMessage: string,
    wallet: any
  ): Promise<{signature: string, publicKey: string}> {
    try {
      // Try to sign the message
      if (wallet.signMessage) {
        const response = await wallet.signMessage({
          message: permitMessage,
          nonce: Math.floor(Math.random() * 1000000).toString()
        });
        
        return {
          signature: response.signature,
          publicKey: response.publicKey || (await wallet.account()).publicKey
        };
      } else {
        throw new Error('Wallet does not support message signing');
      }
    } catch (error) {
      console.error('Failed to sign permit:', error);
      throw error;
    }
  }

  /**
   * Create the full permit object for backend submission
   */
  static createPermitObject(
    params: EscrowPermitParams,
    signature: string,
    publicKey: string
  ) {
    return {
      escrowId: Array.from(params.escrowId),
      amount: params.amount,
      beneficiary: params.beneficiary,
      hashlock: Array.from(params.hashlock),
      timelock: params.timelock,
      nonce: params.nonce,
      expiry: params.expiry,
      signature,
      publicKey
    };
  }
}

/**
 * Alternative: Pre-approval flow
 */
export class EscrowApproval {
  /**
   * Build transaction for user to approve escrow spending
   */
  static async buildApprovalTransaction(
    userAddress: string,
    resolverAddress: string,
    maxAmount: string,
    durationSeconds: number,
    contractAddress: string
  ) {
    // This would build the actual transaction
    // For now, returning a placeholder
    return {
      function: `${contractAddress}::escrow_permit::approve_escrow_spending`,
      type_arguments: [],
      arguments: [
        resolverAddress,
        maxAmount,
        durationSeconds.toString()
      ]
    };
  }
}