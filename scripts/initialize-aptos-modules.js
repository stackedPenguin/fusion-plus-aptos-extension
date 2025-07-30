const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
const fs = require('fs');
const path = require('path');

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

async function initializeModules() {
  console.log('🔧 Initializing Aptos Modules');
  console.log('═'.repeat(80));

  try {
    const aptos = new Aptos(config);

    // Load deployer account
    const keyPath = path.join(__dirname, '../.keys/aptos-deployer.key');
    const privateKeyString = fs.readFileSync(keyPath, 'utf8').trim();
    const privateKeyHex = privateKeyString.replace('ed25519-priv-', '');
    const privateKey = new Ed25519PrivateKey(privateKeyHex);
    const deployerAccount = Account.fromPrivateKey({ privateKey });

    console.log(`\n📋 Using Account: ${deployerAccount.accountAddress.toString()}`);

    // Initialize escrow module
    console.log('\n📦 Initializing Escrow Module...');
    try {
      const initEscrowTxn = await aptos.transaction.build.simple({
        sender: deployerAccount.accountAddress,
        data: {
          function: `${deployerAccount.accountAddress.toString()}::escrow::initialize`,
          typeArguments: [],
          functionArguments: []
        }
      });

      const pendingTxn = await aptos.signAndSubmitTransaction({
        signer: deployerAccount,
        transaction: initEscrowTxn,
      });

      console.log(`   Transaction: ${pendingTxn.hash}`);
      const result = await aptos.waitForTransaction({ 
        transactionHash: pendingTxn.hash 
      });
      
      if (result.success) {
        console.log('   ✅ Escrow module initialized');
      } else {
        console.log(`   ❌ Failed: ${result.vm_status}`);
      }
    } catch (error) {
      if (error.message && error.message.includes('RESOURCE_ALREADY_EXISTS')) {
        console.log('   ℹ️  Escrow already initialized');
      } else if (error.message && error.message.includes('0x30001')) {
        console.log('   ℹ️  Escrow already initialized (Move abort)');
      } else {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    // Initialize LayerZero adapter
    console.log('\n📦 Initializing LayerZero Adapter...');
    try {
      // For now, use the deployer address as the endpoint (in production, this would be the LayerZero endpoint)
      const endpoint = deployerAccount.accountAddress.toString();
      
      const initLayerzeroTxn = await aptos.transaction.build.simple({
        sender: deployerAccount.accountAddress,
        data: {
          function: `${deployerAccount.accountAddress.toString()}::layerzero_adapter::initialize`,
          typeArguments: [],
          functionArguments: [endpoint]
        }
      });

      const pendingTxn = await aptos.signAndSubmitTransaction({
        signer: deployerAccount,
        transaction: initLayerzeroTxn,
      });

      console.log(`   Transaction: ${pendingTxn.hash}`);
      const result = await aptos.waitForTransaction({ 
        transactionHash: pendingTxn.hash 
      });
      
      if (result.success) {
        console.log('   ✅ LayerZero adapter initialized');
      } else {
        console.log(`   ❌ Failed: ${result.vm_status}`);
      }
    } catch (error) {
      if (error.message && error.message.includes('RESOURCE_ALREADY_EXISTS')) {
        console.log('   ℹ️  LayerZero adapter already initialized');
      } else if (error.message && error.message.includes('0x30001')) {
        console.log('   ℹ️  LayerZero adapter already initialized (Move abort)');
      } else {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    console.log('\n✅ Initialization complete!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message || error);
  }
}

initializeModules().catch(console.error);