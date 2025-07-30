const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
const fs = require('fs');
const path = require('path');

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

async function checkDeployerBalance() {
  console.log('🔍 Checking Aptos Deployer Balance');
  console.log('═'.repeat(80));

  try {
    // Initialize Aptos client
    const aptos = new Aptos(config);

    // Load deployer account
    const keyPath = path.join(__dirname, '../.keys/aptos-deployer.key');
    const privateKeyString = fs.readFileSync(keyPath, 'utf8').trim();
    const privateKeyHex = privateKeyString.replace('ed25519-priv-', '');
    const privateKey = new Ed25519PrivateKey(privateKeyHex);
    const deployerAccount = Account.fromPrivateKey({ privateKey });

    console.log(`\n📋 Deployer Account: ${deployerAccount.accountAddress.toString()}`);

    // Check balance
    try {
      const resources = await aptos.getAccountResources({ accountAddress: deployerAccount.accountAddress });
      const aptBalance = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
      
      if (!aptBalance) {
        console.log('   ❌ Account has no APT balance or does not exist');
        console.log('\n💡 To fund this account:');
        console.log(`   1. Go to: https://aptos.dev/en/network/faucet`);
        console.log(`   2. Select "Testnet" network`);
        console.log(`   3. Enter address: ${deployerAccount.accountAddress.toString()}`);
        console.log(`   4. Click "Add to faucet queue"`);
        return;
      }
      
      const balance = BigInt(aptBalance.data.coin.value) / BigInt(100000000);
      console.log(`   ✅ Balance: ${balance.toString()} APT`);
      
      if (balance >= 1n) {
        console.log('\n✅ Account has sufficient balance for deployment!');
        console.log('   Run: node scripts/deploy-aptos-simple.js');
      } else {
        console.log('\n⚠️  Low balance. Need at least 1 APT for deployment.');
      }
      
    } catch (error) {
      console.log('   ❌ Error checking balance:', error.message);
      console.log('\n💡 Account may not exist. To fund this account:');
      console.log(`   1. Go to: https://aptos.dev/en/network/faucet`);
      console.log(`   2. Select "Testnet" network`);
      console.log(`   3. Enter address: ${deployerAccount.accountAddress.toString()}`);
      console.log(`   4. Click "Add to faucet queue"`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message || error);
  }
}

// Run check
checkDeployerBalance().catch(console.error);