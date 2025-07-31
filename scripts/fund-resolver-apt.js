const { AptosClient, AptosAccount, HexString } = require('aptos');
require('dotenv').config({ path: '../backend/resolver/.env' });

async function fundResolver() {
  const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
  
  // This would normally be done from a funded account
  // For testnet, you can use the faucet
  const resolverAddress = process.env.APTOS_RESOLVER_ADDRESS || '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
  
  console.log('Funding resolver address:', resolverAddress);
  console.log('Please use the Aptos faucet to fund this address:');
  console.log('https://aptoslabs.com/testnet-faucet');
  console.log('Or use: aptos account fund-with-faucet --account', resolverAddress);
}

fundResolver().catch(console.error);