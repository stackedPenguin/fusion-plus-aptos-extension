const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');

async function checkTransaction(txHash) {
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);
  
  try {
    console.log('Checking transaction:', txHash);
    
    // Get transaction by hash
    const tx = await aptos.getTransactionByHash({ transactionHash: txHash });
    
    console.log('\nTransaction details:');
    console.log('  Success:', tx.success);
    console.log('  VM Status:', tx.vm_status);
    console.log('  Gas used:', tx.gas_used);
    
    if (tx.payload) {
      console.log('\nPayload:');
      console.log('  Function:', tx.payload.function);
      if (tx.payload.arguments) {
        console.log('  Arguments:');
        tx.payload.arguments.forEach((arg, i) => {
          console.log(`    [${i}]:`, arg);
        });
      }
    }
    
    if (tx.events && tx.events.length > 0) {
      console.log('\nEvents:');
      tx.events.forEach((event, i) => {
        console.log(`  Event ${i}:`, event.type);
        console.log('    Data:', event.data);
      });
    }
    
    if (!tx.success) {
      console.log('\n❌ Transaction failed!');
      console.log('VM Status:', tx.vm_status);
    }
    
  } catch (error) {
    console.error('Error checking transaction:', error);
  }
}

// Check the escrow creation transaction
const txHash = process.argv[2] || '0xbfaa9e7253b78c5c47f38eb06c66db743194a247e7c6e3ea1943c6e13d73929f';
checkTransaction(txHash);