const { AptosClient, AptosAccount, HexString } = require('aptos');
require('dotenv').config({ path: '../../backend/resolver/.env' });

async function initializeEscrow() {
  const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
  
  // Get the private key from environment
  let privateKey = process.env.APTOS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('APTOS_PRIVATE_KEY not found in environment');
  }
  
  // Remove the "ed25519-priv-" prefix if present
  if (privateKey.startsWith('ed25519-priv-')) {
    privateKey = privateKey.replace('ed25519-priv-', '');
  }
  
  // Remove 0x prefix if present
  if (privateKey.startsWith('0x')) {
    privateKey = privateKey.substring(2);
  }

  // Create account from private key
  const account = new AptosAccount(new HexString(privateKey).toUint8Array());
  const address = account.address().hex();
  
  console.log('Initializing escrow store for address:', address);
  
  try {
    // Create the transaction
    const payload = {
      type: 'entry_function_payload',
      function: `${address}::escrow::initialize`,
      type_arguments: [],
      arguments: []
    };
    
    // Generate transaction
    const txnRequest = await client.generateTransaction(account.address(), payload);
    
    // Sign transaction
    const signedTxn = await client.signTransaction(account, txnRequest);
    
    // Submit transaction
    const transactionRes = await client.submitTransaction(signedTxn);
    console.log('Transaction submitted:', transactionRes.hash);
    
    // Wait for transaction
    await client.waitForTransaction(transactionRes.hash);
    console.log('Escrow store initialized successfully!');
    
  } catch (error) {
    console.error('Failed to initialize escrow store:', error);
    throw error;
  }
}

initializeEscrow().catch(console.error);