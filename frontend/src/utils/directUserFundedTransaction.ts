import { 
  Aptos, 
  AptosConfig, 
  Network
} from '@aptos-labs/ts-sdk';

interface EscrowParams {
  escrowId: Uint8Array;
  beneficiary: string;
  amount: string;
  hashlock: Uint8Array;
  timelock: number;
  safetyDeposit: string;
  resolverAddress: string;
}

/**
 * Direct user-funded transaction builder for wallets that don't support multi-agent
 * This creates a transaction where the user pays both APT and gas
 */
export class DirectUserFundedTransaction {
  private aptos: Aptos;
  private escrowModule = '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow_v2';

  constructor(network: Network = Network.TESTNET) {
    const config = new AptosConfig({ network });
    this.aptos = new Aptos(config);
  }

  /**
   * Build a direct user-funded transaction
   * User signs and pays both APT and gas
   */
  async buildUserFundedTransaction(
    userAddress: string,
    params: EscrowParams
  ): Promise<any> {
    // Build standard transaction (user pays everything)
    const transaction = await this.aptos.transaction.build.simple({
      sender: userAddress,
      data: {
        function: `${this.escrowModule}::create_escrow_user_funded`,
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

    return transaction;
  }

  /**
   * Convert to wallet-compatible format
   */
  prepareForWallet(params: EscrowParams): any {
    // Convert Uint8Arrays to hex strings for wallet compatibility
    const toHex = (uint8array: Uint8Array): string => {
      return '0x' + Array.from(uint8array)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    };

    return {
      type: 'entry_function_payload',
      function: `${this.escrowModule}::create_escrow_user_funded`,
      type_arguments: [],
      arguments: [
        toHex(params.escrowId),
        params.beneficiary,
        params.amount,
        toHex(params.hashlock),
        params.timelock.toString(),
        params.safetyDeposit,
        params.resolverAddress
      ]
    };
  }
}