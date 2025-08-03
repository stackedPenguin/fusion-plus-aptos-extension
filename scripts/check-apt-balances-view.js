// Using native fetch in Node.js 18+

async function checkAptosBalances() {
  const resolvers = [
    { name: 'Resolver-1', address: '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532' },
    { name: 'Resolver-2', address: '0x2edf35335bc13bb9ab9a8a7eb3145dae745db2951ede41ac2206f48f1cd83015' },
    { name: 'Resolver-3', address: '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8' }
  ];
  
  console.log('Checking Aptos resolver balances...\n');
  
  for (const resolver of resolvers) {
    try {
      const viewPayload = {
        function: "0x1::coin::balance",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [resolver.address]
      };
      
      const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-KEY': 'aptoslabs_TeaoYUA6URj_GUvGWfnqhhZfwRGzbanbM2MwrWMH2jGej'
        },
        body: JSON.stringify(viewPayload)
      });
      
      const result = await response.json();
      
      if (result && result[0] !== undefined) {
        const balance = BigInt(result[0]);
        const aptBalance = Number(balance) / 100000000; // Convert octas to APT
        console.log(`${resolver.name}:`);
        console.log(`  Address: ${resolver.address}`);
        console.log(`  Balance: ${aptBalance.toFixed(6)} APT`);
        
        if (aptBalance < 0.1) {
          console.log('  ⚠️ Low balance - may need more APT for transaction fees');
        } else {
          console.log('  ✅ Has sufficient APT');
        }
      } else {
        console.log(`${resolver.name}: Could not fetch balance`);
        console.log(`  Response:`, result);
      }
    } catch (error) {
      console.log(`${resolver.name}: Error - ${error.message}`);
    }
    console.log();
  }
}

checkAptosBalances().catch(console.error);