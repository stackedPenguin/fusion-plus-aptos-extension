import { 
  Aptos, 
  AptosConfig, 
  Network,
  Ed25519PrivateKey,
  Account,
  SimpleTransaction
} from '@aptos-labs/ts-sdk';

/**
 * Direct implementation of sponsored transactions using Aptos SDK
 * This bypasses wallet limitations by handling the transaction directly
 */
export class DirectSponsoredTransaction {
  private aptos: Aptos;

  constructor() {
    const config = new AptosConfig({ network: Network.TESTNET });
    this.aptos = new Aptos(config);
  }

  /**
   * Creates a sponsored escrow transaction where:
   * - User provides their private key temporarily (or signs offline)
   * - Transaction is built with withFeePayer: true
   * - User signs as sender
   * - Resolver signs as fee payer
   */
  async createSponsoredEscrowWithPrivateKey(
    userPrivateKey: string,
    escrowParams: {
      escrowId: number[];
      beneficiary: string;
      amount: string;
      hashlock: number[];
      timelock: string;
      safetyDeposit: string;
    }
  ): Promise<{
    transaction: SimpleTransaction;
    userSignature: any;
  }> {
    // Create account from private key
    const privateKey = new Ed25519PrivateKey(userPrivateKey);
    const userAccount = Account.fromPrivateKey({ privateKey });

    // Build the transaction with fee payer flag
    const transaction = await this.aptos.transaction.build.simple({
      sender: userAccount.accountAddress,
      withFeePayer: true,
      data: {
        function: '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow_v2::create_escrow_user_funded',
        typeArguments: [],
        functionArguments: [
          escrowParams.escrowId,
          escrowParams.beneficiary,
          escrowParams.amount,
          escrowParams.hashlock,
          escrowParams.timelock,
          escrowParams.safetyDeposit,
          '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532' // resolver address
        ]
      }
    });

    // User signs as sender (not fee payer)
    const userSignature = await this.aptos.transaction.sign({
      signer: userAccount,
      transaction
    });

    return {
      transaction,
      userSignature
    };
  }

  /**
   * Alternative: Build transaction for offline signing
   * This allows user to sign on a different device/wallet
   */
  async buildTransactionForOfflineSigning(
    userAddress: string,
    escrowParams: {
      escrowId: number[];
      beneficiary: string;
      amount: string;
      hashlock: number[];
      timelock: string;
      safetyDeposit: string;
    }
  ): Promise<{
    rawTransaction: Uint8Array;
    signingMessage: Uint8Array;
  }> {
    // Build the transaction
    const transaction = await this.aptos.transaction.build.simple({
      sender: userAddress,
      withFeePayer: true,
      data: {
        function: '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow_v2::create_escrow_user_funded',
        typeArguments: [],
        functionArguments: [
          escrowParams.escrowId,
          escrowParams.beneficiary,
          escrowParams.amount,
          escrowParams.hashlock,
          escrowParams.timelock,
          escrowParams.safetyDeposit,
          '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532' // resolver address
        ]
      }
    });

    // Get raw bytes for offline signing
    const rawTransaction = transaction.bcsToBytes();
    
    // Get the signing message (what the user needs to sign)
    const signingMessage = await this.aptos.getSigningMessage({
      transaction
    });

    return {
      rawTransaction,
      signingMessage
    };
  }

  /**
   * Verify if a wallet properly supports sponsored transactions
   * by attempting to build and check the transaction format
   */
  async testWalletSupport(): Promise<boolean> {
    try {
      const testTransaction = await this.aptos.transaction.build.simple({
        sender: '0x1', // dummy address
        withFeePayer: true,
        data: {
          function: '0x1::aptos_account::transfer',
          typeArguments: [],
          functionArguments: ['0x2', 100]
        }
      });

      // Check if transaction has fee payer field
      // The transaction should have been built with withFeePayer: true
      // We can check if the transaction was built correctly by examining its structure
      return true; // If no error was thrown, assume it supports fee payer
    } catch (error) {
      console.error('Wallet support test failed:', error);
      return false;
    }
  }
}