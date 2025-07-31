import { AptosClient, AptosAccount, Types } from 'aptos';
import { CONTRACTS } from '../config/contracts';

export class AptosService {
  private client: AptosClient;
  private escrowModule: string;

  constructor() {
    this.client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
    this.escrowModule = CONTRACTS.APTOS.ESCROW;
  }

  /**
   * Create an APT escrow on Aptos
   */
  async createAPTEscrow(
    escrowId: Uint8Array,
    depositor: string,
    beneficiary: string,
    amount: string,
    secretHash: Uint8Array,
    timelock: number,
    safetyDeposit: string = '100000' // 0.001 APT
  ): Promise<string> {
    const payload: Types.TransactionPayload = {
      type: 'entry_function_payload',
      function: `${this.escrowModule}::htlc::create_htlc`,
      type_arguments: ['0x1::aptos_coin::AptosCoin'],
      arguments: [
        Array.from(escrowId),
        beneficiary,
        amount,
        Array.from(secretHash),
        timelock.toString(),
        safetyDeposit
      ]
    };

    // This will be signed by the user's wallet
    return payload as any;
  }

  /**
   * Check if an escrow exists on Aptos
   */
  async checkEscrowExists(escrowId: Uint8Array): Promise<boolean> {
    try {
      const response = await this.client.view({
        function: `${this.escrowModule}::htlc::escrow_exists`,
        type_arguments: ['0x1::aptos_coin::AptosCoin'],
        arguments: [Array.from(escrowId)]
      });
      return response[0] as boolean;
    } catch (error) {
      return false;
    }
  }

  /**
   * Monitor for escrow creation events
   */
  async waitForEscrowCreation(
    escrowId: Uint8Array,
    timeout: number = 60000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const exists = await this.checkEscrowExists(escrowId);
      if (exists) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
    }
    
    return false;
  }
}