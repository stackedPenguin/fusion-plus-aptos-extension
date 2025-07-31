const { AptosClient, AptosAccount, HexString } = require('aptos');
require('dotenv').config({ path: '../../backend/resolver/.env' });

async function addResolver() {
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
  
  console.log('Adding resolver from admin address:', address);
  
  // The resolver address (same as admin for hackathon)
  const resolverAddress = process.env.APTOS_RESOLVER_ADDRESS || address;
  
  try {
    // Get the deployed contract address
    const contractAddress = process.env.APTOS_ESCROW_MODULE || process.env.APTOS_ESCROW_ADDRESS || '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
    
    // Create the transaction
    const payload = {
      type: 'entry_function_payload',
      function: `${contractAddress}::escrow::add_authorized_resolver`,
      type_arguments: [],
      arguments: [resolverAddress]
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
    console.log('Resolver added successfully!');
    console.log('Authorized resolver:', resolverAddress);
    
  } catch (error) {
    console.error('Failed to add resolver:', error);
    throw error;
  }
}

addResolver().catch(console.error);