const axios = require('axios');
const nacl = require('tweetnacl');
const crypto = require('crypto');

// Test configuration
const APTOS_NODE_URL = 'https://fullnode.testnet.aptoslabs.com';
const RESOLVER_ADDRESS = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
const MODULE_ADDRESS = '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0';

async function testAptosIntegration() {
  console.log('🧪 Testing Aptos Integration');
  console.log('═'.repeat(80));

  // Step 1: Check if the module exists
  console.log('\n1️⃣ Checking if module exists...');
  try {
    // Check account info
    const accountResponse = await axios.get(`${APTOS_NODE_URL}/v1/accounts/${MODULE_ADDRESS}`);
    console.log('✅ Module account exists');
    console.log(`   Sequence: ${accountResponse.data.sequence_number}`);
    
    // Try to get module info
    const modulesResponse = await axios.get(`${APTOS_NODE_URL}/v1/accounts/${MODULE_ADDRESS}/modules`);
    console.log(`✅ Found ${modulesResponse.data.length} modules`);
    
    const escrowModule = modulesResponse.data.find(m => m.abi?.name === 'escrow');
    if (escrowModule) {
      console.log('✅ Found escrow module');
      console.log(`   Functions: ${escrowModule.abi.exposed_functions.map(f => f.name).join(', ')}`);
    } else {
      console.log('❌ Escrow module not found in account');
      console.log('   Available modules:', modulesResponse.data.map(m => m.abi?.name || 'unknown'));
    }
  } catch (error) {
    console.error('❌ Error checking module:', error.response?.data || error.message);
  }

  // Step 2: Check resolver account balance
  console.log('\n2️⃣ Checking resolver account...');
  try {
    const viewPayload = {
      function: '0x1::coin::balance',
      type_arguments: ['0x1::aptos_coin::AptosCoin'],
      arguments: [RESOLVER_ADDRESS]
    };
    
    const response = await axios.post(`${APTOS_NODE_URL}/v1/view`, viewPayload);
    const balance = response.data[0] || 0;
    console.log(`✅ Resolver balance: ${(balance / 100000000).toFixed(8)} APT`);
  } catch (error) {
    console.error('❌ Error checking balance:', error.response?.data || error.message);
  }

  // Step 3: Test private key setup
  console.log('\n3️⃣ Testing private key...');
  const rawPrivateKey = 'ed25519-priv-0x17f2f2c3b35f4a1d3688c2bdc445239fb25d2e495915a15b586d7319bf751f7e';
  const cleanKey = rawPrivateKey.replace('ed25519-priv-', '').replace('0x', '');
  console.log(`   Key length: ${cleanKey.length} hex chars (${cleanKey.length / 2} bytes)`);
  
  try {
    const privateKeyBytes = Buffer.from(cleanKey.substring(0, 64), 'hex'); // First 32 bytes
    const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
    const publicKey = '0x' + Buffer.from(keyPair.publicKey).toString('hex');
    console.log(`✅ Generated public key: ${publicKey}`);
    
    // Derive address from public key
    const authKey = Buffer.concat([
      Buffer.from(keyPair.publicKey),
      Buffer.from([0x00]) // Single signature scheme
    ]);
    const hash = crypto.createHash('sha3-256').update(authKey).digest();
    const address = '0x' + hash.toString('hex').slice(0, 63) + '0';
    console.log(`   Derived address: ${address}`);
    console.log(`   Expected address: ${RESOLVER_ADDRESS}`);
    console.log(`   Match: ${address === RESOLVER_ADDRESS ? '✅' : '❌'}`);
  } catch (error) {
    console.error('❌ Error with key:', error.message);
  }

  // Step 4: Test transaction structure
  console.log('\n4️⃣ Testing transaction structure...');
  const testPayload = {
    type: 'entry_function_payload',
    function: `${MODULE_ADDRESS}::escrow::create_escrow`,
    type_arguments: ['0x1::aptos_coin::AptosCoin'],
    arguments: [
      Array.from(crypto.randomBytes(32)), // escrow_id
      RESOLVER_ADDRESS, // beneficiary
      '41000000', // amount (0.41 APT)
      Array.from(crypto.randomBytes(32)), // hashlock
      Math.floor(Date.now() / 1000) + 3600, // timelock
      '1000000' // safety deposit (0.01 APT)
    ]
  };
  
  console.log('📦 Test payload:');
  console.log(`   Function: ${testPayload.function}`);
  console.log(`   Arguments: ${testPayload.arguments.length} args`);
  console.log(`   - escrow_id: ${testPayload.arguments[0].length} bytes`);
  console.log(`   - beneficiary: ${testPayload.arguments[1]}`);
  console.log(`   - amount: ${testPayload.arguments[2]} (${parseInt(testPayload.arguments[2]) / 100000000} APT)`);
  console.log(`   - hashlock: ${testPayload.arguments[3].length} bytes`);
  console.log(`   - timelock: ${new Date(testPayload.arguments[4] * 1000).toISOString()}`);
  console.log(`   - safety_deposit: ${testPayload.arguments[5]} (${parseInt(testPayload.arguments[5]) / 100000000} APT)`);

  // Step 5: Test view function
  console.log('\n5️⃣ Testing view function...');
  try {
    const viewPayload = {
      function: `${MODULE_ADDRESS}::escrow::get_escrow`,
      type_arguments: ['0x1::aptos_coin::AptosCoin'],
      arguments: [Array.from(crypto.randomBytes(32))] // Random ID that won't exist
    };
    
    await axios.post(`${APTOS_NODE_URL}/v1/view`, viewPayload);
    console.log('✅ View function exists (no error thrown)');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ View function exists but escrow not found (expected)');
    } else {
      console.error('❌ View function error:', error.response?.data || error.message);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('🏁 Test complete! Check results above.');
}

testAptosIntegration().catch(console.error);