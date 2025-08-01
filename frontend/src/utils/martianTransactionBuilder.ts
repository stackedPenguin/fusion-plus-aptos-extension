/**
 * Martian wallet specific transaction builder
 */

export class MartianTransactionBuilder {
  /**
   * Build a transaction in the format expected by Martian wallet
   */
  static buildForMartian(params: {
    sender: string;
    function: string;
    type_arguments: any[];
    arguments: any[];
    gas_unit_price?: string;
    max_gas_amount?: string;
  }): any {
    // Martian expects a specific format for transactions
    return {
      type: 'entry_function_payload',
      function: params.function,
      type_arguments: params.type_arguments,
      arguments: params.arguments
    };
  }

  /**
   * Build multi-agent transaction for Martian
   */
  static buildMultiAgentTransaction(params: {
    sender: string;
    escrowModule: string;
    escrowId: Uint8Array;
    beneficiary: string;
    amount: string;
    hashlock: Uint8Array;
    timelock: number;
    safetyDeposit: string;
    resolverAddress: string;
  }): any {
    // Use the correct module path: address::module::function
    // The module is "escrow" under the "fusion_plus" package
    const functionName = `0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow::create_escrow`;
    
    // For vector<u8> arguments in Move, Martian expects hex strings with 0x prefix
    const toHex = (uint8array: Uint8Array): string => {
      return '0x' + Array.from(uint8array)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    };
    
    const escrowIdHex = toHex(params.escrowId);
    const hashlockHex = toHex(params.hashlock);
    
    return {
      type: 'entry_function_payload',
      function: functionName,
      type_arguments: [],
      arguments: [
        escrowIdHex,  // hex string for vector<u8>
        params.beneficiary,  // address as string
        params.amount,  // amount as string
        hashlockHex,  // hex string for vector<u8>
        params.timelock.toString(),  // timelock as string
        params.safetyDeposit  // safety deposit as string
      ]
    };
  }
}