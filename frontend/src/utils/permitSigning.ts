import { BCS, TxnBuilderTypes } from '@aptos-labs/ts-sdk';

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
      Buffer.from(params.escrowId).toString('hex'),
      params.amount,
      params.beneficiary,
      Buffer.from(params.hashlock).toString('hex'),
      params.timelock,
      params.nonce,
      params.expiry
    ];
    
    return parts.join(':');
  }

  /**
   * Generate BCS-encoded permit message for signing
   */
  static generatePermitBytesForSigning(params: EscrowPermitParams): Uint8Array {
    const encoder = new BCS.Serializer();
    
    // Start with the prefix
    const prefix = new TextEncoder().encode("APTOS_ESCROW_PERMIT:");
    encoder.serializeBytes(prefix);
    
    // Add escrow ID
    encoder.serializeBytes(params.escrowId);
    encoder.serializeStr(":");
    
    // Add amount (as bytes)
    const amountBytes = BCS.bcsSerializeUint64(BigInt(params.amount));
    encoder.serializeBytes(amountBytes);
    encoder.serializeStr(":");
    
    // Add beneficiary (as bytes)
    const beneficiaryBytes = BCS.bcsSerializeStr(params.beneficiary);
    encoder.serializeBytes(beneficiaryBytes);
    encoder.serializeStr(":");
    
    // Add hashlock
    encoder.serializeBytes(params.hashlock);
    encoder.serializeStr(":");
    
    // Add timelock (as bytes)
    const timelockBytes = BCS.bcsSerializeUint64(BigInt(params.timelock));
    encoder.serializeBytes(timelockBytes);
    encoder.serializeStr(":");
    
    // Add nonce (as bytes)
    const nonceBytes = BCS.bcsSerializeUint64(BigInt(params.nonce));
    encoder.serializeBytes(nonceBytes);
    encoder.serializeStr(":");
    
    // Add expiry (as bytes)
    const expiryBytes = BCS.bcsSerializeUint64(BigInt(params.expiry));
    encoder.serializeBytes(expiryBytes);
    
    return encoder.getBytes();
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