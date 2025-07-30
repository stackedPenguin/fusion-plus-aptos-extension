const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');
const axios = require('axios');

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

async function monitorFunding() {
  console.log('🔍 Monitoring Aptos Account Funding');
  console.log('═'.repeat(80));

  const aptos = new Aptos(config);

  // Accounts to monitor
  const accounts = [
    {
      name: 'Deployer',
      address: '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0',
      funded: false
    },
    {
      name: 'Resolver',
      address: '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532',
      funded: false
    }
  ];

  console.log('\n⏳ Waiting for accounts to be funded...\n');

  const checkInterval = setInterval(async () => {
    let allFunded = true;

    for (const account of accounts) {
      if (account.funded) continue;

      try {
        const response = await axios.get(
          `https://fullnode.testnet.aptoslabs.com/v1/accounts/${account.address}/resource/0x1::coin::CoinStore%3C0x1::aptos_coin::AptosCoin%3E`
        );
        
        const balance = BigInt(response.data.data.coin.value) / BigInt(100000000);
        if (balance > 0n) {
          console.log(`✅ ${account.name} funded! Balance: ${balance} APT`);
          account.funded = true;
        } else {
          allFunded = false;
        }
      } catch (error) {
        // Still not funded
        allFunded = false;
        process.stdout.write(`\r⏳ ${account.name}: Waiting for funds...`);
      }
    }

    if (allFunded) {
      clearInterval(checkInterval);
      console.log('\n\n🎉 All accounts funded! Ready to deploy.');
      process.exit(0);
    }
  }, 2000);

  // Timeout after 2 minutes
  setTimeout(() => {
    clearInterval(checkInterval);
    console.log('\n\n⚠️  Timeout waiting for funding.');
    console.log('Please check the faucet status or try funding manually.');
    process.exit(1);
  }, 120000);
}

monitorFunding().catch(console.error);