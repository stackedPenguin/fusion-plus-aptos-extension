const axios = require('axios');
require('dotenv').config({ path: '../backend/resolver/.env' });

const APTOS_NODE_URL = "https://api.testnet.aptoslabs.com/v1";
const APTOS_FAUCET_URL = "https://faucet.testnet.aptoslabs.com";

async function fundResolver() {
  const resolverAddress = process.env.APTOS_RESOLVER_ADDRESS || "0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532";
  
  console.log("🏛️ Funding Aptos Resolver with APT for gas fees...");
  console.log(`Resolver address: ${resolverAddress}`);
  
  try {
    // Check current balance
    const resourcesRes = await axios.get(`${APTOS_NODE_URL}/accounts/${resolverAddress}/resources`);
    const accountResourceBefore = resourcesRes.data.find((r) => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>");
    const balanceBefore = accountResourceBefore ? parseInt(accountResourceBefore.data.coin.value) / 100000000 : 0;
    console.log(`Current balance: ${balanceBefore} APT`);
    
    // Fund from faucet (testnet only)
    console.log("Requesting funds from faucet...");
    await axios.post(`${APTOS_FAUCET_URL}/mint`, null, {
      params: {
        address: resolverAddress,
        amount: 100000000 // 1 APT
      }
    });
    
    // Check new balance
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for transaction
    const resourcesAfterRes = await axios.get(`${APTOS_NODE_URL}/accounts/${resolverAddress}/resources`);
    const accountResourceAfter = resourcesAfterRes.data.find((r) => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>");
    const balanceAfter = accountResourceAfter ? parseInt(accountResourceAfter.data.coin.value) / 100000000 : 0;
    console.log(`New balance: ${balanceAfter} APT`);
    console.log(`✅ Added ${balanceAfter - balanceBefore} APT to resolver`);
    
  } catch (error) {
    console.error("Failed to fund resolver:", error.response?.data || error.message);
    console.log("\n💡 If faucet fails, you can manually send APT to the resolver address");
  }
}

fundResolver().catch(console.error);