const { AptosClient, AptosAccount, HexString } = require('aptos');
const { ethers } = require('ethers');
require('dotenv').config({ path: '../backend/resolver/.env' });

async function testEscrowWithdraw() {
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
  console.log('Resolver address:', account.address().hex());
  
  // Test withdraw from one of the created escrows
  const escrowId = '0xde288d83d23458cbba3ed536376c72851cbca6c87041b2fafdee7f0f30ddd966';
  const secret = ethers.randomBytes(32);
  
  console.log('Testing withdraw with:');
  console.log('  Escrow ID:', escrowId);
  console.log('  Secret:', ethers.hexlify(secret));
  
  try {
    const payload = {
      type: 'entry_function_payload',
      function: `${account.address().hex()}::escrow::withdraw`,
      type_arguments: [],
      arguments: [
        Array.from(ethers.getBytes(escrowId)),
        Array.from(secret)
      ]
    };
    
    const txnRequest = await client.generateTransaction(account.address(), payload);
    const signedTxn = await client.signTransaction(account, txnRequest);
    const transactionRes = await client.submitTransaction(signedTxn);
    
    console.log('Transaction submitted:', transactionRes.hash);
    
    // Wait for transaction
    try {
      await client.waitForTransactionWithResult(transactionRes.hash);
      console.log('Transaction succeeded!');
    } catch (waitError) {
      console.log('Transaction failed:', waitError.message);
      
      // Get transaction details
      const txnDetails = await fetch(`https://fullnode.testnet.aptoslabs.com/v1/transactions/by_hash/${transactionRes.hash}`);
      const txn = await txnDetails.json();
      console.log('VM Status:', txn.vm_status);
      if (txn.events) {
        console.log('Events:', txn.events);
      }
    }
    
  } catch (error) {
    console.error('Withdraw failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testEscrowWithdraw().catch(console.error);