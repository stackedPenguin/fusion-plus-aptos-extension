import { Aptos, AptosConfig, Network, AccountAuthenticator, RawTransaction, SimpleTransaction } from '@aptos-labs/ts-sdk';
import { ethers } from 'ethers';

interface SponsoredTransactionParams {
  escrowId: Uint8Array;
  beneficiary: string;
  amount: string;
  hashlock: Uint8Array;
  timelock: number;
  safetyDeposit: string;
  resolverAddress: string;
}

export class SponsoredTransactionService {
  private aptos: Aptos;

  constructor(network: Network = Network.TESTNET) {
    const config = new AptosConfig({ network });
    this.aptos = new Aptos(config);
  }

  /**
   * Create a raw transaction for user to sign that will be sponsored by resolver
   */
  async createUserFundedEscrowTransaction(
    userAddress: string,
    params: SponsoredTransactionParams
  ): Promise<SimpleTransaction> {
    // Build the transaction
    const transaction = await this.aptos.transaction.build.simple({
      sender: userAddress,
      data: {
        function: '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow_v2::create_escrow_user_funded',
        typeArguments: [],
        functionArguments: [
          params.escrowId,
          params.beneficiary,
          params.amount,
          params.hashlock,
          params.timelock.toString(),
          params.safetyDeposit,
          params.resolverAddress
        ]
      },
      options: {
        // This is key - we set a gas unit price of 0 to indicate sponsorship
        gasUnitPrice: 0,
        maxGasAmount: 200000
      }
    });

    return transaction;
  }

  /**
   * Create the sponsorship proof that resolver needs
   */
  createSponsorshipData(
    userSignedTransaction: Uint8Array,
    userAuthenticator: AccountAuthenticator
  ): {
    rawTransaction: string;
    userAuthenticator: string;
  } {
    return {
      rawTransaction: ethers.hexlify(userSignedTransaction),
      userAuthenticator: ethers.hexlify(userAuthenticator.bcsToBytes())
    };
  }

  /**
   * Helper to convert transaction for signing
   */
  async prepareTransactionForSigning(transaction: SimpleTransaction): Promise<Uint8Array> {
    // Get the raw transaction bytes that need to be signed
    const rawTxn = await this.aptos.transaction.sign({
      signer: {
        publicKey: {
          toUint8Array: () => new Uint8Array(32), // Dummy key, will be replaced
        },
        signMessage: async () => {
          throw new Error('Should not be called');
        }
      } as any,
      transaction
    });
    
    return rawTxn.bcsToBytes();
  }
}

/**
 * Example flow:
 * 
 * 1. Frontend creates transaction:
 *    const service = new SponsoredTransactionService();
 *    const transaction = await service.createUserFundedEscrowTransaction(userAddress, params);
 * 
 * 2. User signs transaction (via wallet):
 *    const signedTxn = await wallet.signTransaction(transaction);
 * 
 * 3. Send to resolver for sponsorship:
 *    const sponsorshipData = service.createSponsorshipData(
 *      signedTxn.rawTransaction,
 *      signedTxn.authenticator
 *    );
 *    
 * 4. Resolver sponsors and submits:
 *    - Resolver adds their signature as fee payer
 *    - Submits the multi-agent transaction
 *    - Pays gas fees
 *    - User's APT is withdrawn directly from their account
 */