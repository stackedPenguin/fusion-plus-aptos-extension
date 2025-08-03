const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");
const fs = require('fs');
const path = require('path');

async function deployContract() {
  // Initialize Aptos client
  const config = new AptosConfig({ network: Network.TESTNET });
  const aptos = new Aptos(config);

  // Use the account that has the escrow module already deployed
  const DEPLOYER_PRIVATE_KEY = "ed25519-priv-0x6f96d196c83b19ed4d051edf71ebb4782443c429ef82ae73cb7a9eb08e339c59";
  const rawPrivateKey = DEPLOYER_PRIVATE_KEY
    .replace('ed25519-priv-', '')
    .replace('0x', '');
  
  let privateKeyHex;
  if (rawPrivateKey.length === 128) {
    privateKeyHex = rawPrivateKey.substring(0, 64);
  } else if (rawPrivateKey.length === 64) {
    privateKeyHex = rawPrivateKey;
  } else {
    throw new Error(`Invalid private key length: ${rawPrivateKey.length}`);
  }

  const privateKey = new Ed25519PrivateKey(privateKeyHex);
  const deployerAccount = Account.fromPrivateKey({ privateKey });
  
  console.log('Deployer address:', deployerAccount.accountAddress.toString());
  
  // Get account info
  try {
    const accountInfo = await aptos.getAccountInfo({
      accountAddress: deployerAccount.accountAddress
    });
    console.log('Account sequence number:', accountInfo.sequence_number);
    
    // Check balance (account might not have coin store)
    try {
      const balance = await aptos.getAccountResource({
        accountAddress: deployerAccount.accountAddress,
        resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
      });
      console.log('APT Balance:', (parseInt(balance.coin.value) / 100000000).toFixed(8), 'APT');
    } catch (e) {
      console.log('Note: Account does not have a coin store (likely no APT balance)');
      console.log('This is fine - we can still deploy/update modules');
    }
  } catch (error) {
    console.error('Failed to get account info:', error);
    return;
  }

  // Read the compiled modules
  const buildPath = path.join(__dirname, 'build', 'FusionPlusAptos', 'bytecode_modules');
  
  console.log('\n📦 Deploying Updated Fusion+ Contracts to Aptos Testnet...');
  
  const modules = [
    'escrow_v2.mv'
  ];
  
  const moduleData = [];
  for (const moduleName of modules) {
    const modulePath = path.join(buildPath, moduleName);
    if (fs.existsSync(modulePath)) {
      const moduleBytes = fs.readFileSync(modulePath);
      moduleData.push(moduleBytes);
      console.log(`   ✓ Loaded ${moduleName}`);
    } else {
      console.error(`   ✗ Module not found: ${modulePath}`);
      return;
    }
  }

  try {
    // Deploy all modules in a single transaction
    console.log('\n🚀 Publishing updated modules...');
    const transaction = await aptos.publishPackageTransaction({
      account: deployerAccount.accountAddress,
      metadataBytes: fs.readFileSync(path.join(buildPath, '..', 'package-metadata.bcs')),
      moduleBytecode: moduleData,
    });

    console.log('   Transaction built');
    
    // Sign and submit
    const pendingTxn = await aptos.signAndSubmitTransaction({
      signer: deployerAccount,
      transaction
    });
    
    console.log(`   Transaction submitted: ${pendingTxn.hash}`);
    console.log(`   View on explorer: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=testnet`);
    
    // Wait for transaction
    const response = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash
    });
    
    if (response.success) {
      console.log('\n✅ Escrow V2 module updated successfully!');
      console.log('\n📝 Updated escrow_v2 module features:');
      console.log('   - create_escrow_user_funded: Now accepts 0 safety deposit for gasless experience');
      console.log('   - create_escrow_multi_agent: Resolver pays safety deposit');
      console.log('   - create_escrow_gasless: True gasless with optional safety deposit');
      console.log('   - withdraw/refund: Handle optional safety deposits gracefully');
    } else {
      console.error('\n❌ Deployment failed:', response.vm_status);
    }
    
  } catch (error) {
    console.error('\n❌ Error deploying contract:', error);
  }
}

// Set environment variables if running directly
if (require.main === module) {
  require('dotenv').config({ path: '../../backend/resolver/.env' });
  deployContract().catch(console.error);
}

module.exports = { deployContract };