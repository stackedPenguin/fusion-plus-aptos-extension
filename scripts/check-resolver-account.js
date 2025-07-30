const axios = require('axios');

const APTOS_NODE_URL = 'https://fullnode.testnet.aptoslabs.com';
const RESOLVER_ADDRESS = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';

async function checkResolverAccount() {
  console.log('🔍 Checking Resolver Account on Aptos');
  console.log('═'.repeat(60));
  console.log(`Address: ${RESOLVER_ADDRESS}`);
  
  try {
    // Check if account exists
    const response = await axios.get(`${APTOS_NODE_URL}/v1/accounts/${RESOLVER_ADDRESS}`);
    console.log('\n✅ Account exists!');
    console.log(`Sequence number: ${response.data.sequence_number}`);
    console.log(`Authentication key: ${response.data.authentication_key}`);
    
    // Check balance
    const balancePayload = {
      function: '0x1::coin::balance',
      type_arguments: ['0x1::aptos_coin::AptosCoin'],
      arguments: [RESOLVER_ADDRESS]
    };
    
    const balanceResponse = await axios.post(`${APTOS_NODE_URL}/v1/view`, balancePayload);
    const balance = balanceResponse.data[0] || 0;
    console.log(`Balance: ${(balance / 100000000).toFixed(8)} APT`);
    
  } catch (error) {
    if (error.response?.status === 404) {
      console.error('\n❌ Account does NOT exist on chain!');
      console.error('This account needs to be funded first before it can be used.');
      console.error('\nTo fix this:');
      console.error('1. Go to https://aptos.dev/en/network/faucet');
      console.error('2. Fund this address:', RESOLVER_ADDRESS);
    } else {
      console.error('Error:', error.response?.data || error.message);
    }
  }
}

checkResolverAccount().catch(console.error);