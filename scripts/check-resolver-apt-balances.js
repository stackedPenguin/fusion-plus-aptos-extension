const { Aptos, AptosConfig, Network } = require("@aptos-labs/ts-sdk");

async function main() {
  // Initialize Aptos client with API key
  const APTOS_API_KEY = "aptoslabs_TeaoYUA6URj_GUvGWfnqhhZfwRGzbanbM2MwrWMH2jGej";
  
  const config = new AptosConfig({
    fullnode: "https://fullnode.testnet.aptoslabs.com/v1",
    network: Network.TESTNET,
    clientConfig: {
      API_KEY: APTOS_API_KEY
    }
  });
  const aptos = new Aptos(config);

  // Resolver Aptos addresses
  const resolvers = [
    {
      name: "Resolver-1",
      address: "0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532"
    },
    {
      name: "Resolver-2",
      address: "0x2edf35335bc13bb9ab9a8a7eb3145dae745db2951ede41ac2206f48f1cd83015"
    },
    {
      name: "Resolver-3", 
      address: "0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8"
    }
  ];

  console.log("Checking Aptos resolver balances...\n");

  for (const resolver of resolvers) {
    try {
      // Check if account exists and get balance
      const resource = await aptos.getAccountResource({
        accountAddress: resolver.address,
        resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
      });
      
      const balance = resource.coin.value;
      console.log(`${resolver.name}: ${(parseInt(balance) / 100000000).toFixed(6)} APT`);
      console.log(`  Address: ${resolver.address}`);
      console.log(`  Raw balance: ${balance} octas`);
      
      // Check if balance is sufficient for transactions
      const minRequired = 0.01; // 0.01 APT minimum for transaction fees
      const balanceInAPT = parseInt(balance) / 100000000;
      
      if (balanceInAPT < minRequired) {
        console.log(`  ⚠️  WARNING: Balance too low for transactions! Need at least ${minRequired} APT`);
      } else {
        console.log(`  ✅ Sufficient balance for transactions`);
      }
      
    } catch (error) {
      if (error.status === 404) {
        console.log(`${resolver.name}: Account not found or 0 APT`);
        console.log(`  Address: ${resolver.address}`);
        console.log(`  ❌ Account needs to be funded with APT`);
      } else {
        console.error(`${resolver.name}: Error checking balance:`, error.message);
      }
    }
    console.log();
  }
}

main().catch(console.error);