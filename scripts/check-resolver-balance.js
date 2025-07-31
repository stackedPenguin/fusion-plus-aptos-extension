const { AptosClient } = require('aptos');
require('dotenv').config({ path: '../backend/resolver/.env' });

async function checkResolverBalance() {
  const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
  
  const resolverAddress = process.env.APTOS_RESOLVER_ADDRESS || '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
  
  console.log('Checking resolver balance...');
  console.log('Resolver address:', resolverAddress);
  
  try {
    const resources = await client.getAccountResources(resolverAddress);
    const coinStore = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
    
    if (coinStore) {
      const balance = coinStore.data.coin.value;
      console.log('APT Balance:', (parseInt(balance) / 100000000).toFixed(8), 'APT');
      console.log('Raw balance:', balance);
      console.log('Need for escrow: 0.201 APT (20100000 octas)');
      console.log('Has enough?', parseInt(balance) >= 20100000);
    } else {
      console.log('No coin store found');
    }
  } catch (error) {
    console.error('Failed to check balance:', error.message);
  }
}

checkResolverBalance().catch(console.error);