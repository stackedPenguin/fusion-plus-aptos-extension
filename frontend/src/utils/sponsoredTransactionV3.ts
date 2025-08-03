import { 
  Aptos, 
  AptosConfig, 
  Network, 
  AccountAuthenticator,
  SimpleTransaction
} from '@aptos-labs/ts-sdk';

// Helper function to convert Uint8Array to hex string (browser-compatible)
function toHex(uint8array: Uint8Array): string {
  return Array.from(uint8array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface EscrowParams {
  escrowId: Uint8Array;
  depositor: string;
  beneficiary: string;
  amount: string;
  hashlock: Uint8Array;
  timelock: number;
  safetyDeposit: string;
  resolverAddress: string;
}

export class SponsoredTransactionV3 {
  private aptos: Aptos;

  constructor(network: Network = Network.TESTNET) {
    const config = new AptosConfig({ network });
    this.aptos = new Aptos(config);
  }

  /**
   * Build a regular transaction that will be sponsored by the resolver
   * This follows the Shinami pattern - NOT multi-agent
   */
  async buildSponsoredEscrowTransaction(
    userAddress: string,
    params: EscrowParams
  ): Promise<SimpleTransaction> {
    // Build transaction with fee payer flag
    // Use create_escrow_user_funded - user pays APT, resolver pays gas
    const transaction = await this.aptos.transaction.build.simple({
      sender: userAddress,
      withFeePayer: true, // Critical: Enable fee payer mode
      data: {
        // Use regular function with 0 safety deposit for gasless experience
        function: '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow_v2::create_escrow_user_funded',
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
      },
      options: {
        maxGasAmount: 100000, // Reduced from 200000
        gasUnitPrice: 100,
        expireTimestamp: Math.floor(Date.now() / 1000) + 30 // 30 seconds
      }
    });

    return transaction;
  }

  /**
   * Prepare transaction data for sending to resolver
   * The resolver will add fee payer signature and submit
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
 * Example flow (Shinami pattern):
 * 
 * 1. Frontend builds the sponsored transaction:
 *    const sponsoredTx = new SponsoredTransactionV3();
 *    const transaction = await sponsoredTx.buildSponsoredEscrowTransaction(userAddress, params);
 * 
 * 2. User signs as sender using wallet adapter:
 *    const userAuth = await walletAdapter.signTransaction(transaction);
 * 
 * 3. Send to resolver for fee payer signature:
 *    const data = sponsoredTx.serializeTransactionForResolver(transaction, userAuth);
 *    socket.emit('order:signed:sponsored:v3', { ...data });
 * 
 * 4. Resolver signs as fee payer and submits:
 *    - Deserialize transaction and user signature
 *    - Sign as fee payer using signAsFeePayer
 *    - Submit with both signatures
 *    - User's APT is used, resolver only pays gas
 */