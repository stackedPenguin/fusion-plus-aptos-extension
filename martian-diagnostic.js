// Martian Wallet Diagnostic Script
// Run this in your main app (http://localhost:3000) where Martian is already connected

console.log('=== Martian Wallet Diagnostics ===\n');

// 1. Check window objects
console.log('1. Window object check:');
console.log('   window.martian:', typeof window.martian);
console.log('   window.aptos:', typeof window.aptos);
console.log('   window.petra:', typeof window.petra);

// 2. If Martian exists, check its properties
if (window.martian) {
  console.log('\n2. Martian properties:');
  console.log('   Methods:', Object.keys(window.martian).filter(k => typeof window.martian[k] === 'function'));
  console.log('   Properties:', Object.keys(window.martian).filter(k => typeof window.martian[k] !== 'function'));
  
  // 3. Check if already connected
  console.log('\n3. Connection status:');
  try {
    const account = await window.martian.account();
    console.log('   Already connected to:', account);
    console.log('   Account address:', account.address || account);
    console.log('   Public key:', account.publicKey);
  } catch (e) {
    console.log('   Not connected:', e.message);
  }
  
  // 4. Check network
  console.log('\n4. Network check:');
  try {
    const network = await window.martian.network();
    console.log('   Network:', network);
    console.log('   Network name:', network.name || network);
    console.log('   Network URL:', network.url);
  } catch (e) {
    console.log('   Network error:', e.message);
  }
  
  // 5. Try the simplest possible transaction
  console.log('\n5. Testing simplest transaction format:');
  try {
    const account = await window.martian.account();
    const addr = account.address || account;
    
    // Test different payload formats
    const payloads = [
      {
        name: "Standard format",
        payload: {
          type: "entry_function_payload",
          function: "0x1::aptos_account::transfer",
          type_arguments: [],
          arguments: ["0x1", "1"]
        }
      },
      {
        name: "Without type field",
        payload: {
          function: "0x1::aptos_account::transfer",
          type_arguments: [],
          arguments: ["0x1", "1"]
        }
      },
      {
        name: "Coin transfer",
        payload: {
          function: "0x1::coin::transfer",
          type_arguments: ["0x1::aptos_coin::AptosCoin"],
          arguments: ["0x1", "1"]
        }
      }
    ];
    
    for (const test of payloads) {
      console.log(`\n   Testing ${test.name}:`);
      console.log('   Payload:', JSON.stringify(test.payload, null, 2));
      try {
        // Just try to generate, not submit
        const tx = await window.martian.generateTransaction(addr, test.payload);
        console.log('   ✅ Transaction generated successfully');
        console.log('   Generated tx type:', typeof tx);
        console.log('   Generated tx sample:', tx.substring ? tx.substring(0, 50) + '...' : 'Not a string');
        break;
      } catch (e) {
        console.log('   ❌ Failed:', e.message);
      }
    }
  } catch (e) {
    console.log('   Test failed:', e.message);
  }
  
  // 6. Check our specific escrow contract
  console.log('\n6. Checking escrow contract on network:');
  try {
    const network = await window.martian.network();
    const networkUrl = network.url || 'https://fullnode.testnet.aptoslabs.com';
    const moduleAddr = '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca';
    
    console.log('   Fetching from:', networkUrl);
    const response = await fetch(`${networkUrl}/v1/accounts/${moduleAddr}/modules`);
    if (response.ok) {
      const modules = await response.json();
      const escrowModule = modules.find(m => m.abi?.name === 'escrow' || m.abi?.name === 'fusion_plus_escrow');
      if (escrowModule) {
        console.log('   ✅ Found escrow module:', escrowModule.abi.name);
        const createEscrow = escrowModule.abi.exposed_functions.find(f => f.name === 'create_escrow');
        if (createEscrow) {
          console.log('   ✅ Found create_escrow function');
          console.log('   Parameters:', createEscrow.params);
          console.log('   Is entry:', createEscrow.is_entry);
        }
      } else {
        console.log('   ❌ Escrow module not found');
        console.log('   Available modules:', modules.map(m => m.abi?.name));
      }
    } else {
      console.log('   ❌ Failed to fetch modules:', response.status);
    }
  } catch (e) {
    console.log('   Contract check failed:', e.message);
  }
  
} else {
  console.log('\n❌ Martian wallet not found!');
  console.log('Possible reasons:');
  console.log('1. Martian extension not installed');
  console.log('2. Martian not enabled for this site');
  console.log('3. Page needs refresh after installing Martian');
  console.log('4. Running in file:// protocol (use http://localhost instead)');
}

console.log('\n=== Diagnostics Complete ===');