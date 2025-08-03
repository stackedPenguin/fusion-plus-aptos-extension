import { 
  Aptos, 
  AptosConfig, 
  Network, 
  AccountAuthenticator,
  PendingTransactionResponse
} from '@aptos-labs/ts-sdk';

// Helper function to convert Uint8Array to hex string (browser-compatible)
function toHex(uint8array: Uint8Array): string {
  return Array.from(uint8array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface EscrowParams {
  escrowId: Uint8Array;
  beneficiary: string;
  amount: string;
  hashlock: Uint8Array;
  timelock: number;
  safetyDeposit: string;
  resolverAddress: string;
}

export class MultiAgentTransaction {
  private aptos: Aptos;
  private escrowModule = '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8::escrow_v2';

  constructor(network: Network = Network.TESTNET) {
    const config = new AptosConfig({ network });
    this.aptos = new Aptos(config);
  }

  /**
   * Build a multi-agent transaction for user-funded escrow with resolver paying gas
   */
  async buildMultiAgentEscrowTransaction(
    userAddress: string,
    params: EscrowParams
  ): Promise<any> {
    // Build transaction with fee payer flag
    const transaction = await this.aptos.transaction.build.simple({
      sender: userAddress,
      withFeePayer: true,
      data: {
        function: `${this.escrowModule.split('::')[0]}::${this.escrowModule.split('::')[1]}::create_escrow_user_funded`,
        typeArguments: [],
        functionArguments: [
          Array.from(params.escrowId),
          params.beneficiary,
          params.amount,
          Array.from(params.hashlock),
          params.timelock.toString(),
          params.safetyDeposit,
          params.resolverAddress
        ]
      }
    });

    console.log('[MultiAgent] Built transaction:', {
      hasRawTransaction: !!transaction.rawTransaction,
      hasFeePayerAddress: !!transaction.feePayerAddress,
      transactionType: typeof transaction
    });
    
    return transaction;
  }

  /**
   * Prepare transaction for wallet signing
   */
  async prepareForWalletSigning(transaction: any): Promise<any> {
    // Convert transaction to a serializable format for Martian wallet
    try {
      // Extract the essential transaction data
      const payload = {
        function: `${this.escrowModule.split('::')[0]}::${this.escrowModule.split('::')[1]}::create_escrow_user_funded`,
        type_arguments: [],
        arguments: transaction.rawTransaction?.payload?.value?.args || [],
        type: 'entry_function_payload'
      };
      
      // Return a clean object that Martian can serialize
      return {
        sender: transaction.rawTransaction?.sender,
        sequence_number: transaction.rawTransaction?.sequence_number?.toString(),
        max_gas_amount: transaction.rawTransaction?.max_gas_amount?.toString() || '100000',
        gas_unit_price: transaction.rawTransaction?.gas_unit_price?.toString() || '100',
        expiration_timestamp_secs: transaction.rawTransaction?.expiration_timestamp_secs?.toString() || Math.floor(Date.now() / 1000 + 3600).toString(),
        payload: payload,
        fee_payer_address: transaction.rawTransaction?.fee_payer_address || transaction.feePayerAddress
      };
    } catch (error) {
      console.error('[MultiAgent] Error preparing transaction:', error);
      // Fallback to returning the original transaction
      return transaction;
    }
  }

  /**
   * Submit multi-agent transaction with user and resolver signatures
   */
  async submitMultiAgentTransaction(
    transaction: any,
    userSignature: AccountAuthenticator,
    resolverSignature: AccountAuthenticator
  ): Promise<PendingTransactionResponse> {
    // The Aptos SDK expects a specific format for multi-agent transactions
    const result = await this.aptos.transaction.submit.multiAgent({
      transaction: transaction,
      senderAuthenticator: userSignature,
      additionalSignersAuthenticators: [],
      feePayerAuthenticator: resolverSignature
    });

    return result;
  }

  /**
   * Serialize transaction for sending to backend
   */
  serializeForBackend(
    transaction: any,
    userSignature: AccountAuthenticator
  ): {
    transactionBytes: string;
    userSignatureBytes: string;
  } {
    return {
      transactionBytes: toHex(new Uint8Array(transaction.bcsToBytes())),
      userSignatureBytes: toHex(new Uint8Array(userSignature.bcsToBytes()))
    };
  }
}

/**
 * Multi-Agent Flow:
 * 
 * 1. Build multi-agent transaction:
 *    const multiAgent = new MultiAgentTransaction();
 *    const transaction = await multiAgent.buildMultiAgentEscrowTransaction(userAddress, params);
 * 
 * 2. User signs as primary signer (via Martian wallet):
 *    const userSignature = await wallet.signTransaction(transaction);
 * 
 * 3. Send to backend for resolver fee payer signature:
 *    const data = multiAgent.serializeForBackend(transaction, userSignature);
 *    socket.emit('order:signed:multiagent', { ...data });
 * 
 * 4. Backend resolver signs as fee payer and submits:
 *    - Deserialize transaction and user signature
 *    - Sign as fee payer
 *    - Submit multi-agent transaction
 *    - User's APT is withdrawn, resolver only pays gas
 */