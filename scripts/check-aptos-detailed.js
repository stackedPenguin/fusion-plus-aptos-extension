const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');
const axios = require('axios');

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

async function checkDetailedBalance() {
  console.log('🔍 Detailed Aptos Balance Check');
  console.log('═'.repeat(80));

  const aptos = new Aptos(config);

  // Accounts to check
  const accounts = [
    {
      name: 'Deployer',
      address: '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0'
    },
    {
      name: 'Resolver',
      address: '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532'
    }
  ];

  for (const account of accounts) {
    console.log(`\n📋 ${account.name} Account:`);
    console.log(`   Address: ${account.address}`);
    
    try {
      // First check if account exists
      const accountInfo = await aptos.getAccountInfo({ 
        accountAddress: account.address 
      });
      console.log(`   ✅ Account exists`);
      console.log(`   Sequence number: ${accountInfo.sequence_number}`);
      
      // Try to get resources
      try {
        const resources = await aptos.getAccountResources({ 
          accountAddress: account.address 
        });
        
        const aptBalance = resources.find(r => 
          r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
        );
        
        if (aptBalance) {
          const balance = BigInt(aptBalance.data.coin.value) / BigInt(100000000);
          console.log(`   💰 Balance: ${balance.toString()} APT`);
        } else {
          console.log('   ⚠️  Account exists but no coin store initialized');
        }
      } catch (resourceError) {
        console.log('   ⚠️  Could not fetch resources');
      }
      
    } catch (error) {
      if (error.status === 404) {
        console.log('   ❌ Account not found - needs to be funded first');
      } else {
        console.log('   ❌ Error checking account:', error.message);
      }
    }
  }

  // Also try direct REST API call
  console.log('\n📡 Trying direct API calls...');
  for (const account of accounts) {
    try {
      const response = await axios.get(
        `https://fullnode.testnet.aptoslabs.com/v1/accounts/${account.address}/resource/0x1::coin::CoinStore%3C0x1::aptos_coin::AptosCoin%3E`
      );
      const balance = BigInt(response.data.data.coin.value) / BigInt(100000000);
      console.log(`   ${account.name}: ${balance} APT`);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`   ${account.name}: Not found`);
      }
    }
  }

  console.log('\n');
}

checkDetailedBalance().catch(console.error);