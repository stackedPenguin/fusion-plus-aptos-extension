const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");

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

  // Resolver 1 private key (source of funds)
  const resolver1PrivateKey = "ed25519-priv-0x17f2f2c3b35f4a1d3688c2bdc445239fb25d2e495915a15b586d7319bf751f7e";
  const privateKey1 = new Ed25519PrivateKey(resolver1PrivateKey);
  const resolver1 = Account.fromPrivateKey({ privateKey: privateKey1 });
  
  // Resolver addresses to fund
  const resolversToFund = [
    {
      name: "Resolver-2",
      address: "0x2edf35335bc13bb9ab9a8a7eb3145dae745db2951ede41ac2206f48f1cd83015"
    },
    {
      name: "Resolver-3", 
      address: "0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8"
    }
  ];

  console.log("Funding resolvers with APT...");
  console.log("Source account:", resolver1.accountAddress.toString());

  // Check source balance
  try {
    const balance = await aptos.getAccountResource({
      accountAddress: resolver1.accountAddress,
      resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
    });
    const sourceBalance = balance.coin.value;
    console.log(`Source balance: ${(parseInt(sourceBalance) / 100000000).toFixed(6)} APT`);
  } catch (error) {
    console.error("Failed to get source balance:", error);
    return;
  }

  // Fund each resolver with 0.1 APT (10000000 octas)
  const fundingAmount = 10000000; // 0.1 APT
  
  for (const resolver of resolversToFund) {
    try {
      console.log(`\nFunding ${resolver.name} (${resolver.address}) with 0.1 APT...`);
      
      // Create transfer transaction
      const transaction = await aptos.transferCoinTransaction({
        sender: resolver1.accountAddress,
        recipient: resolver.address,
        amount: fundingAmount
      });
      
      // Sign and submit transaction
      const pendingTxn = await aptos.signAndSubmitTransaction({
        signer: resolver1,
        transaction
      });
      
      // Wait for transaction
      const response = await aptos.waitForTransaction({
        transactionHash: pendingTxn.hash
      });
      
      console.log(`✅ ${resolver.name} funded successfully!`);
      console.log(`   Transaction: ${pendingTxn.hash}`);
      
      // Check new balance
      try {
        const newBalance = await aptos.getAccountResource({
          accountAddress: resolver.address,
          resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
        });
        console.log(`   New balance: ${(parseInt(newBalance.coin.value) / 100000000).toFixed(6)} APT`);
      } catch (error) {
        console.log(`   Account might need to be initialized first`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to fund ${resolver.name}:`, error.message);
    }
  }
  
  // Check final source balance
  try {
    const finalBalance = await aptos.getAccountResource({
      accountAddress: resolver1.accountAddress,
      resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
    });
    console.log(`\nFinal source balance: ${(parseInt(finalBalance.coin.value) / 100000000).toFixed(6)} APT`);
  } catch (error) {
    console.error("Failed to get final balance:", error);
  }
}

main().catch(console.error);