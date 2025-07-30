const axios = require('axios');
const nacl = require('tweetnacl');
const crypto = require('crypto');

// Configuration
const APTOS_NODE_URL = 'https://fullnode.testnet.aptoslabs.com';
const RESOLVER_ADDRESS = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
const MODULE_ADDRESS = '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0';
const PRIVATE_KEY = 'ed25519-priv-0x17f2f2c3b35f4a1d3688c2bdc445239fb25d2e495915a15b586d7319bf751f7e';

async function testCreateEscrow() {
  console.log('🧪 Testing Create Escrow Transaction');
  console.log('═'.repeat(80));

  // Prepare key
  const cleanKey = PRIVATE_KEY.replace('ed25519-priv-', '').replace('0x', '');
  const privateKeyBytes = Buffer.from(cleanKey.substring(0, 64), 'hex');
  const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
  const publicKey = '0x' + Buffer.from(keyPair.publicKey).toString('hex');
  
  console.log('Public key:', publicKey);

  try {
    // Get account info
    const accountResponse = await axios.get(`${APTOS_NODE_URL}/v1/accounts/${RESOLVER_ADDRESS}`);
    const sequenceNumber = accountResponse.data.sequence_number;
    console.log('Sequence number:', sequenceNumber);

    // Create test escrow parameters
    const escrowId = crypto.randomBytes(32);
    const beneficiary = '0x3cf8d46b8ad3e1be66c7d42dbcb3f5f0241d86015bd4d521e65ed8df1a97633b'; // user address
    const amount = '41000000'; // 0.41 APT
    const hashlock = crypto.randomBytes(32);
    const timelock = Math.floor(Date.now() / 1000) + 3600;
    const safetyDeposit = '1000000'; // 0.01 APT

    // Create transaction payload
    const payload = {
      type: 'entry_function_payload',
      function: `${MODULE_ADDRESS}::escrow::create_escrow`,
      type_arguments: ['0x1::aptos_coin::AptosCoin'],
      arguments: [
        Array.from(escrowId),
        beneficiary,
        amount,
        Array.from(hashlock),
        timelock.toString(),
        safetyDeposit
      ]
    };

    console.log('\n📦 Transaction Payload:');
    console.log(JSON.stringify(payload, null, 2));

    // Get gas estimate
    console.log('\n⛽ Estimating gas...');
    const simulationPayload = {
      sender: RESOLVER_ADDRESS,
      sequence_number: sequenceNumber.toString(),
      max_gas_amount: '200000',
      gas_unit_price: '100',
      expiration_timestamp_secs: (Math.floor(Date.now() / 1000) + 30).toString(),
      payload: payload
    };

    try {
      const simResponse = await axios.post(
        `${APTOS_NODE_URL}/v1/transactions/simulate`,
        simulationPayload,
        { 
          headers: { 
            'Content-Type': 'application/json'
          },
          params: {
            estimate_gas_unit_price: true,
            estimate_max_gas_amount: true
          }
        }
      );
      
      console.log('Simulation response:', simResponse.data[0]);
      
      if (simResponse.data[0].success) {
        console.log('✅ Transaction simulation successful!');
        console.log(`   Gas used: ${simResponse.data[0].gas_used}`);
        console.log(`   VM Status: ${simResponse.data[0].vm_status}`);
      } else {
        console.log('❌ Transaction simulation failed!');
        console.log('   Error:', simResponse.data[0].vm_status);
      }
    } catch (simError) {
      console.error('❌ Simulation error:', simError.response?.data || simError.message);
      if (simError.response?.data?.message) {
        console.error('   Message:', simError.response.data.message);
      }
      if (simError.response?.data?.error_code) {
        console.error('   Error code:', simError.response.data.error_code);
      }
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testCreateEscrow().catch(console.error);