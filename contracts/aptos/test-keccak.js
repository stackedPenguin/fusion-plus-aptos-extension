const { AptosClient, AptosAccount, HexString } = require('aptos');
require('dotenv').config({ path: '../../backend/resolver/.env' });

async function testKeccak256() {
  const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
  
  // Get the private key from environment
  let privateKey = process.env.APTOS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('APTOS_PRIVATE_KEY not found in environment');
  }
  
  if (privateKey.startsWith('ed25519-priv-')) {
    privateKey = privateKey.replace('ed25519-priv-', '');
  }
  if (privateKey.startsWith('0x')) {
    privateKey = privateKey.substring(2);
  }
  
  const account = new AptosAccount(new HexString(privateKey).toUint8Array());
  console.log('Testing from address:', account.address().hex());
  
  try {
    // Test if we can call test_keccak256
    const payload = {
      type: 'entry_function_payload',
      function: `${account.address().hex()}::test_keccak::test_keccak256`,
      type_arguments: [],
      arguments: []
    };
    
    const txnRequest = await client.generateTransaction(account.address(), payload);
    const signedTxn = await client.signTransaction(account, txnRequest);
    const transactionRes = await client.submitTransaction(signedTxn);
    
    console.log('Transaction submitted:', transactionRes.hash);
    
    // Wait for transaction
    const txn = await client.waitForTransaction(transactionRes.hash);
    console.log('Transaction status:', txn.success ? 'Success' : 'Failed');
    
    if (!txn.success) {
      console.log('VM Status:', txn.vm_status);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
    
    // Try using view function to test keccak256
    console.log('\nTrying view function test...');
    try {
      const viewPayload = {
        function: "0x1::aptos_hash::keccak256",
        type_arguments: [],
        arguments: ["0x" + Buffer.from('test').toString('hex')]
      };
      
      const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(viewPayload)
      });
      
      const result = await response.json();
      console.log('View function result:', result);
    } catch (viewError) {
      console.error('View function also failed:', viewError.message);
    }
  }
}

testKeccak256().catch(console.error);