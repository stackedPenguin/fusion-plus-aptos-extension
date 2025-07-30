const axios = require('axios');

const APTOS_NODE_URL = 'https://fullnode.testnet.aptoslabs.com';
const MODULE_ADDRESS = '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0';

async function testModuleView() {
  console.log('🔍 Testing Module View Functions');
  console.log('═'.repeat(80));

  try {
    // Get module info
    const modulesResponse = await axios.get(`${APTOS_NODE_URL}/v1/accounts/${MODULE_ADDRESS}/modules`);
    const escrowModule = modulesResponse.data.find(m => m.abi?.name === 'escrow');
    
    if (escrowModule) {
      console.log('✅ Found escrow module');
      console.log('\n📋 Module Functions:');
      escrowModule.abi.exposed_functions.forEach(func => {
        console.log(`\n- ${func.name}`);
        console.log(`  Visibility: ${func.visibility}`);
        console.log(`  Is entry: ${func.is_entry}`);
        console.log(`  Is view: ${func.is_view}`);
        console.log(`  Params: ${func.params.join(', ')}`);
        if (func.generic_type_params.length > 0) {
          console.log(`  Type params: ${func.generic_type_params.length}`);
        }
      });

      // Check module resources
      console.log('\n📦 Module Resources:');
      const resourcesResponse = await axios.get(`${APTOS_NODE_URL}/v1/accounts/${MODULE_ADDRESS}/resources`);
      resourcesResponse.data.forEach(resource => {
        if (resource.type.includes('escrow')) {
          console.log(`\n- ${resource.type}`);
          console.log(`  Data:`, JSON.stringify(resource.data, null, 2));
        }
      });

      // Try to simulate a simple transaction first
      console.log('\n🧪 Testing simple transaction structure...');
      
      // Get gas price
      const gasResponse = await axios.get(`${APTOS_NODE_URL}/v1/estimate_gas_price`);
      console.log(`Gas price: ${gasResponse.data.gas_estimate}`);

    } else {
      console.log('❌ Escrow module not found');
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testModuleView().catch(console.error);