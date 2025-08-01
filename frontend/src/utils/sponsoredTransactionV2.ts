import { 
  Aptos, 
  AptosConfig, 
  Network, 
  AccountAuthenticator,
  SimpleTransaction,
  Account
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
}

export class SponsoredTransactionV2 {
  private aptos: Aptos;

  constructor(network: Network = Network.TESTNET) {
    const config = new AptosConfig({ network });
    this.aptos = new Aptos(config);
  }

  /**
   * Build a transaction that will be sponsored by the resolver
   * The user signs as sender, resolver signs as fee payer
   */
  async buildSponsoredEscrowTransaction(
    userAddress: string,
    params: EscrowParams
  ): Promise<SimpleTransaction> {
    // Build transaction with fee payer flag
    const transaction = await this.aptos.transaction.build.simple({
      sender: userAddress,
      withFeePayer: true, // Critical: Enable fee payer mode
      data: {
        // Use the standard create_escrow function - user pays APT, resolver pays gas
        function: '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow::create_escrow',
        typeArguments: [],
        functionArguments: [
          params.escrowId,
          params.beneficiary,
          params.amount,
          params.hashlock,
          params.timelock.toString(),
          params.safetyDeposit
        ]
      }
    });

    return transaction;
  }

  /**
   * Get the user to sign the transaction as sender
   */
  async getUserSignature(
    transaction: SimpleTransaction
  ): Promise<AccountAuthenticator> {
    // This will be called by the wallet
    // In practice, we'll pass the transaction to the wallet
    // and it will return the signature
    throw new Error('This should be signed by the user wallet');
  }

  /**
   * Prepare transaction data for sending to resolver
   */
  serializeTransactionForResolver(
    transaction: SimpleTransaction,
    userAuthenticator: AccountAuthenticator
  ): {
    transactionBytes: string;
    userAuthenticatorBytes: string;
  } {
    return {
      transactionBytes: toHex(new Uint8Array(transaction.bcsToBytes())),
      userAuthenticatorBytes: toHex(new Uint8Array(userAuthenticator.bcsToBytes()))
    };
  }
}

/**
 * Example flow:
 * 
 * 1. Frontend builds the sponsored transaction:
 *    const sponsoredTx = new SponsoredTransactionV2();
 *    const transaction = await sponsoredTx.buildSponsoredEscrowTransaction(userAddress, params);
 * 
 * 2. User signs as sender (via wallet):
 *    const userAuth = await wallet.signTransaction(transaction);
 * 
 * 3. Send to resolver for fee payer signature:
 *    const data = sponsoredTx.serializeTransactionForResolver(transaction, userAuth);
 *    socket.emit('order:signed:sponsored:v2', { ...data });
 * 
 * 4. Resolver signs as fee payer and submits:
 *    - Deserialize transaction and user signature
 *    - Sign as fee payer using signAsFeePayer
 *    - Submit with both signatures
 *    - User's APT is used, resolver only pays gas
 */