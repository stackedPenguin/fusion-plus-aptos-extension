const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');

async function initializeEscrow() {
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  try {
    // Use the new account's private key
    let adminPrivateKey = 'ed25519-priv-0x6f96d196c83b19ed4d051edf71ebb4782443c429ef82ae73cb7a9eb08e339c59';
    
    // Remove prefixes if present
    if (adminPrivateKey.startsWith('ed25519-priv-')) {
      adminPrivateKey = adminPrivateKey.replace('ed25519-priv-', '');
    }
    if (adminPrivateKey.startsWith('0x')) {
      adminPrivateKey = adminPrivateKey.substring(2);
    }
    
    // Create admin account from private key
    const privateKeyObj = new Ed25519PrivateKey(adminPrivateKey);
    const adminAccount = Account.fromPrivateKey({ privateKey: privateKeyObj });
    
    console.log('Admin address:', adminAccount.accountAddress.toString());
    
    // Build transaction to initialize escrow store
    const escrowModule = process.env.APTOS_ESCROW_MODULE || process.env.APTOS_ESCROW_ADDRESS || '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8';
    
    console.log('Initializing escrow contract...');
    const initTx = await aptos.transaction.build.simple({
      sender: adminAccount.accountAddress,
      data: {
        function: `${escrowModule}::escrow::initialize`,
        typeArguments: [],
        functionArguments: []
      }
    });
    
    let senderAuth = aptos.transaction.sign({
      signer: adminAccount,
      transaction: initTx
    });
    
    let pendingTx = await aptos.transaction.submit.simple({
      transaction: initTx,
      senderAuthenticator: senderAuth
    });
    
    console.log('Initialize tx:', pendingTx.hash);
    
    let executedTx = await aptos.waitForTransaction({
      transactionHash: pendingTx.hash
    });
    
    console.log('Escrow contract initialized:', executedTx.success);
    if (!executedTx.success) {
      console.error('Failed to initialize:', executedTx.vm_status);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

initializeEscrow();