const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
require('dotenv').config({ path: '../../backend/resolver/.env' });

async function addResolver() {
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  try {
    // Use the new account's private key (admin)
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
    
    // Resolver address to authorize
    const resolverAddress = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
    console.log('Authorizing resolver:', resolverAddress);
    
    // Build transaction to add resolver
    const escrowModule = '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8';
    
    const transaction = await aptos.transaction.build.simple({
      sender: adminAccount.accountAddress,
      data: {
        function: `${escrowModule}::escrow::add_authorized_resolver`,
        typeArguments: [],
        functionArguments: [resolverAddress]
      }
    });
    
    const senderAuthenticator = aptos.transaction.sign({
      signer: adminAccount,
      transaction
    });
    
    const pendingTx = await aptos.transaction.submit.simple({
      transaction,
      senderAuthenticator
    });
    
    console.log('Transaction submitted:', pendingTx.hash);
    
    // Wait for confirmation
    const executedTx = await aptos.waitForTransaction({
      transactionHash: pendingTx.hash
    });
    
    console.log('Transaction confirmed!');
    console.log('Success:', executedTx.success);
    
    if (!executedTx.success) {
      console.error('Transaction failed:', executedTx.vm_status);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

addResolver();