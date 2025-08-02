#!/usr/bin/env node

const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');

async function checkTransaction(txHash) {
  // Initialize Aptos client
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  console.log('\n🔍 Checking Aptos transaction...');
  console.log('Transaction hash:', txHash);
  
  try {
    // Get transaction details
    const tx = await aptos.getTransactionByHash({ transactionHash: txHash });
    
    console.log('\n📋 Transaction details:');
    console.log('Type:', tx.type);
    console.log('Success:', tx.success);
    console.log('VM Status:', tx.vm_status);
    console.log('Sender:', tx.sender);
    console.log('Sequence number:', tx.sequence_number);
    console.log('Gas used:', tx.gas_used);
    
    if (tx.payload) {
      console.log('\n📦 Payload:');
      console.log('Function:', tx.payload.function);
      console.log('Type arguments:', tx.payload.type_arguments);
      console.log('Arguments:');
      tx.payload.arguments.forEach((arg, i) => {
        console.log(`  [${i}]:`, arg);
      });
    }
    
    if (tx.events && tx.events.length > 0) {
      console.log('\n📢 Events:');
      tx.events.forEach((event, i) => {
        console.log(`  Event ${i}:`, event.type);
        if (event.data) {
          console.log('    Data:', event.data);
        }
      });
    }
    
    if (!tx.success) {
      console.log('\n❌ Transaction failed!');
      console.log('VM Status:', tx.vm_status);
    }
    
  } catch (error) {
    console.error('Error getting transaction:', error.message);
  }
}

// Get transaction hash from command line
const txHash = process.argv[2];
if (!txHash) {
  console.log('Usage: node check-aptos-transaction.js <transaction_hash>');
  process.exit(1);
}

checkTransaction(txHash).catch(console.error);