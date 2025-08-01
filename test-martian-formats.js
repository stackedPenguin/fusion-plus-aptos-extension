// Comprehensive Martian Wallet Format Tests
// Copy and paste this into browser console

async function testMartianFormats() {
  console.log('=== Martian Wallet Format Tests ===\n');
  
  // Check if Martian is available
  if (!window.martian) {
    console.error('❌ Martian wallet not detected! Please install and refresh.');
    return;
  }

  // Connect to Martian
  let account;
  try {
    const response = await window.martian.connect();
    account = response.address || response;
    console.log('✅ Connected to Martian:', account);
  } catch (err) {
    console.error('❌ Failed to connect:', err);
    return;
  }

  // Helper functions
  function toHex(uint8array) {
    return '0x' + Array.from(uint8array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function randomBytes(length = 32) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return arr;
  }

  // Test configuration
  const beneficiary = "0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532";
  const amount = "50000000"; // 0.5 APT
  const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const safetyDeposit = "100000"; // 0.001 APT

  console.log('\n=== Test 1: Simple Coin Transfer (Baseline) ===');
  try {
    const transferPayload = {
      function: "0x1::coin::transfer",
      type_arguments: ["0x1::aptos_coin::AptosCoin"],
      arguments: [beneficiary, "1000000"] // 0.01 APT
    };
    console.log('Payload:', JSON.stringify(transferPayload, null, 2));
    const tx = await window.martian.generateSignAndSubmitTransaction(account, transferPayload);
    console.log('✅ Simple transfer works! Tx:', tx);
  } catch (e) {
    console.error('❌ Simple transfer failed:', e.message || e);
    console.log('If simple transfer fails, check network and balance');
  }

  console.log('\n=== Test 2: Escrow with Hex Strings (Recommended) ===');
  try {
    const escrowId = randomBytes(32);
    const hashlock = randomBytes(32);
    
    const hexPayload = {
      type: "entry_function_payload",
      function: "0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow::create_escrow",
      type_arguments: [],
      arguments: [
        toHex(escrowId),        // vector<u8> as hex string
        beneficiary,            // address
        amount,                 // u64 as string
        toHex(hashlock),        // vector<u8> as hex string
        timelock.toString(),    // u64 as string
        safetyDeposit          // u64 as string
      ]
    };
    
    console.log('Payload:', JSON.stringify(hexPayload, null, 2));
    console.log('Argument types:', hexPayload.arguments.map((arg, i) => `[${i}] ${typeof arg}: ${arg.slice(0, 20)}...`));
    
    const tx = await window.martian.generateSignAndSubmitTransaction(account, hexPayload);
    console.log('✅ Hex string format works! Tx:', tx);
    return { success: true, format: 'hex strings with 0x prefix' };
  } catch (e) {
    console.error('❌ Hex string format failed:', e.message || e);
  }

  console.log('\n=== Test 3: Escrow with Arrays (Alternative) ===');
  try {
    const escrowId = randomBytes(32);
    const hashlock = randomBytes(32);
    
    const arrayPayload = {
      type: "entry_function_payload",
      function: "0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow::create_escrow",
      type_arguments: [],
      arguments: [
        Array.from(escrowId),   // vector<u8> as array
        beneficiary,            // address
        amount,                 // u64 as string
        Array.from(hashlock),   // vector<u8> as array
        timelock.toString(),    // u64 as string
        safetyDeposit          // u64 as string
      ]
    };
    
    console.log('Payload (arrays shown as length):', {
      ...arrayPayload,
      arguments: arrayPayload.arguments.map((arg, i) => 
        Array.isArray(arg) ? `[Array of ${arg.length} numbers]` : arg
      )
    });
    
    const tx = await window.martian.generateSignAndSubmitTransaction(account, arrayPayload);
    console.log('✅ Array format works! Tx:', tx);
    return { success: true, format: 'arrays of numbers' };
  } catch (e) {
    console.error('❌ Array format failed:', e.message || e);
  }

  console.log('\n=== Test 4: Without type field ===');
  try {
    const escrowId = randomBytes(32);
    const hashlock = randomBytes(32);
    
    const noTypePayload = {
      function: "0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow::create_escrow",
      type_arguments: [],
      arguments: [
        toHex(escrowId),        // vector<u8> as hex string
        beneficiary,            // address
        amount,                 // u64 as string
        toHex(hashlock),        // vector<u8> as hex string
        timelock.toString(),    // u64 as string
        safetyDeposit          // u64 as string
      ]
    };
    
    console.log('Payload (no type field):', JSON.stringify(noTypePayload, null, 2));
    
    const tx = await window.martian.generateSignAndSubmitTransaction(account, noTypePayload);
    console.log('✅ No type field works! Tx:', tx);
    return { success: true, format: 'no type field' };
  } catch (e) {
    console.error('❌ No type field failed:', e.message || e);
  }

  console.log('\n=== Test 5: Two-step process (generateTransaction + signAndSubmitTransaction) ===');
  try {
    const escrowId = randomBytes(32);
    const hashlock = randomBytes(32);
    
    const twoStepPayload = {
      type: "entry_function_payload",
      function: "0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca::escrow::create_escrow",
      type_arguments: [],
      arguments: [
        toHex(escrowId),        // vector<u8> as hex string
        beneficiary,            // address
        amount,                 // u64 as string
        toHex(hashlock),        // vector<u8> as hex string
        timelock.toString(),    // u64 as string
        safetyDeposit          // u64 as string
      ]
    };
    
    console.log('Step 1: Generate transaction...');
    const rawTx = await window.martian.generateTransaction(account, twoStepPayload);
    console.log('Generated transaction:', rawTx);
    
    console.log('Step 2: Sign and submit...');
    const tx = await window.martian.signAndSubmitTransaction(rawTx);
    console.log('✅ Two-step process works! Tx:', tx);
    return { success: true, format: 'two-step process' };
  } catch (e) {
    console.error('❌ Two-step process failed:', e.message || e);
  }

  console.log('\n=== Test 6: Check contract exists ===');
  try {
    // Try to view the module
    const moduleAddress = "0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca";
    const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/accounts/' + moduleAddress + '/modules');
    const modules = await response.json();
    const hasEscrow = modules.some(m => m.abi?.name === 'escrow' || m.abi?.name === 'escrow_v2');
    console.log(`Contract check: ${hasEscrow ? '✅ Found escrow module' : '❌ Escrow module not found'}`);
    if (!hasEscrow) {
      console.log('Available modules:', modules.map(m => m.abi?.name).filter(Boolean));
    }
  } catch (e) {
    console.error('Failed to check contract:', e);
  }

  console.log('\n=== Summary ===');
  console.log('Tests complete. If all tests failed with "invalid payload":');
  console.log('1. Check that Martian is connected to testnet (not mainnet)');
  console.log('2. Ensure the contract is deployed at the address');
  console.log('3. Verify function signature matches (6 arguments)');
  console.log('4. Try updating Martian wallet extension');
  console.log('\nTo manually test in Martian console:');
  console.log('window.martian');
}

// Run the tests
testMartianFormats();