const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
const fs = require('fs');
const path = require('path');

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

async function checkAptosBalances() {
  console.log('🔍 Checking Aptos Testnet Balances');
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
      const resources = await aptos.getAccountResources({ 
        accountAddress: account.address 
      });
      
      const aptBalance = resources.find(r => 
        r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
      );
      
      if (aptBalance) {
        const balance = BigInt(aptBalance.data.coin.value) / BigInt(100000000);
        console.log(`   ✅ Balance: ${balance.toString()} APT`);
      } else {
        console.log('   ❌ No APT balance found');
      }
    } catch (error) {
      console.log('   ❌ Account does not exist');
    }
  }

  console.log('\n');
}

checkAptosBalances().catch(console.error);