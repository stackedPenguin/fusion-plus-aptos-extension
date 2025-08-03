#!/usr/bin/env node

const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');
const { ethers } = require('ethers');

async function checkEscrow() {
  const escrowModule = '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8';
  
  // Initialize Aptos client
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node check-aptos-escrow.js <escrow_id_hex_or_array>');
    console.log('Example: node check-aptos-escrow.js 0x1234...');
    console.log('Example: node check-aptos-escrow.js "[1,2,3,4...]"');
    process.exit(1);
  }
  
  let escrowId;
  const input = args[0];
  
  // Parse input - could be hex string or array
  if (input.startsWith('0x')) {
    // Hex string input
    escrowId = Array.from(ethers.getBytes(input));
  } else if (input.startsWith('[')) {
    // Array input
    escrowId = JSON.parse(input);
  } else {
    console.error('Invalid input format. Use hex string (0x...) or array [1,2,3...]');
    process.exit(1);
  }
  
  console.log('\n🔍 Checking Aptos escrow...');
  console.log('Module:', escrowModule);
  console.log('Escrow ID (array):', escrowId);
  console.log('Escrow ID (hex):', '0x' + escrowId.map(b => b.toString(16).padStart(2, '0')).join(''));
  
  try {
    // Check if escrow exists using escrow_v2
    console.log('\n📋 Checking escrow_v2::escrow_exists...');
    const existsV2 = await aptos.view({
      payload: {
        function: `${escrowModule}::escrow_v2::escrow_exists`,
        typeArguments: [],
        functionArguments: [escrowId]
      }
    });
    console.log('escrow_v2 exists:', existsV2);
    
    // Also check old escrow module
    console.log('\n📋 Checking escrow::escrow_exists...');
    try {
      const existsV1 = await aptos.view({
        payload: {
          function: `${escrowModule}::escrow::escrow_exists`,
          typeArguments: [],
          functionArguments: [escrowId]
        }
      });
      console.log('escrow v1 exists:', existsV1);
    } catch (e) {
      console.log('escrow v1 check failed:', e.message);
    }
    
    // If escrow exists, get details
    if (existsV2[0]) {
      console.log('\n📦 Getting escrow details from escrow_v2...');
      try {
        const details = await aptos.view({
          payload: {
            function: `${escrowModule}::escrow_v2::get_escrow`,
            typeArguments: [],
            functionArguments: [escrowId]
          }
        });
        console.log('Escrow details:', details);
      } catch (e) {
        console.log('Failed to get escrow details:', e.message);
      }
    }
    
  } catch (error) {
    console.error('Error checking escrow:', error.message);
  }
  
  // Also check recent transactions to the module
  console.log('\n📜 Checking recent transactions to escrow module...');
  try {
    const transactions = await aptos.getTransactions({
      options: {
        limit: 10
      }
    });
    
    const escrowTxs = transactions.filter(tx => {
      if (tx.type === 'user_transaction' && tx.payload?.function) {
        return tx.payload.function.includes(escrowModule);
      }
      return false;
    });
    
    console.log(`Found ${escrowTxs.length} recent escrow transactions:`);
    escrowTxs.forEach(tx => {
      console.log(`- ${tx.hash}: ${tx.payload.function}`);
      if (tx.payload.function.includes('create_escrow')) {
        console.log('  Arguments:', tx.payload.arguments[0]); // escrow_id is first arg
      }
    });
    
  } catch (error) {
    console.error('Error getting transactions:', error.message);
  }
}

checkEscrow().catch(console.error);