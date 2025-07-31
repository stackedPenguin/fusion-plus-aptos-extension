const { AptosClient, AptosAccount, HexString } = require('aptos');
const { ethers } = require('ethers');
require('dotenv').config({ path: '.env' });

async function transferAPTToResolver() {
  const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
  
  // Test wallet private key (hardcoded for hackathon demo)
  const privateKey = 'ed25519-priv-0xc5338cd251c22daa8c9c9cc94f498cc8a5c7e1d2e75287a5dda91096fe64efa5de8a9d4ff6f8a8d1ae2fe8b1f663e8b8d2146ca066f440fa0d8f55dd2adc7126';
  
  // Handle the ed25519-priv- prefix
  const cleanKey = privateKey.replace('ed25519-priv-', '').replace('0x', '');
  const account = new AptosAccount(new HexString(cleanKey).toUint8Array());
  const resolverAddress = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
  
  console.log('Transferring APT to resolver...');
  console.log('From:', account.address().hex());
  console.log('To:', resolverAddress);
  
  try {
    // Check balance first using view function
    const balancePayload = {
      function: '0x1::coin::balance',
      type_arguments: ['0x1::aptos_coin::AptosCoin'],
      arguments: [account.address().hex()]
    };
    
    const balanceResponse = await fetch(`${client.nodeUrl}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(balancePayload)
    });
    
    const balanceResult = await balanceResponse.json();
    console.log('Balance result:', balanceResult);
    
    if (balanceResult && balanceResult[0]) {
      const balance = balanceResult[0];
      console.log('Sender balance:', (parseInt(balance) / 100000000).toFixed(8), 'APT');
      
      // Transfer 0.5 APT to resolver
      const amount = 50000000; // 0.5 APT
      console.log('Transferring:', (amount / 100000000).toFixed(8), 'APT');
      
      const payload = {
        type: 'entry_function_payload',
        function: '0x1::aptos_account::transfer',
        type_arguments: [],
        arguments: [
          resolverAddress,
          amount
        ]
      };
      
      const txnRequest = await client.generateTransaction(account.address(), payload);
      const signedTxn = await client.signTransaction(account, txnRequest);
      const transactionRes = await client.submitTransaction(signedTxn);
      
      console.log('Transaction submitted:', transactionRes.hash);
      
      // Wait for transaction
      await client.waitForTransaction(transactionRes.hash);
      console.log('Transfer complete!');
      
      // Check resolver balance
      const resolverBalancePayload = {
        function: '0x1::coin::balance',
        type_arguments: ['0x1::aptos_coin::AptosCoin'],
        arguments: [resolverAddress]
      };
      
      const resolverBalanceResponse = await fetch(`${client.nodeUrl}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolverBalancePayload)
      });
      
      const resolverBalanceResult = await resolverBalanceResponse.json();
      if (resolverBalanceResult && resolverBalanceResult[0]) {
        console.log('Resolver new balance:', (parseInt(resolverBalanceResult[0]) / 100000000).toFixed(8), 'APT');
      }
    } else {
      console.log('No balance found for sender');
    }
  } catch (error) {
    console.error('Transfer failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

transferAPTToResolver().catch(console.error);