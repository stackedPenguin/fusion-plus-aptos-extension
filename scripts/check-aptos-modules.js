const axios = require('axios');

async function checkAptosModules() {
  console.log('🔍 Checking Aptos Module Deployment Status');
  console.log('═'.repeat(80));

  const deployerAddress = '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0';
  
  // Check if modules exist
  const modules = ['escrow', 'layerzero_adapter'];
  
  for (const moduleName of modules) {
    console.log(`\n📦 Checking ${moduleName} module...`);
    
    try {
      // Try to fetch the module
      const response = await axios.get(
        `https://fullnode.testnet.aptoslabs.com/v1/accounts/${deployerAddress}/module/${moduleName}`
      );
      
      if (response.data) {
        console.log(`   ✅ Module exists at ${deployerAddress}::${moduleName}`);
        console.log(`   Bytecode length: ${response.data.bytecode.length} chars`);
      }
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`   ❌ Module not found`);
      } else {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }
  
  // Also check if the account has any modules
  console.log('\n📋 Checking account modules...');
  try {
    const accountResponse = await axios.get(
      `https://fullnode.testnet.aptoslabs.com/v1/accounts/${deployerAddress}/modules`
    );
    
    if (accountResponse.data && accountResponse.data.length > 0) {
      console.log(`   Found ${accountResponse.data.length} modules:`);
      accountResponse.data.forEach(module => {
        console.log(`   - ${module.abi.name}`);
      });
    } else {
      console.log('   No modules found on this account');
    }
  } catch (error) {
    console.log('   Error fetching modules:', error.message);
  }
  
  // Check for simpler test - does the account exist and have sequence number > 0
  console.log('\n📊 Account activity check...');
  try {
    const accountInfo = await axios.get(
      `https://fullnode.testnet.aptoslabs.com/v1/accounts/${deployerAddress}`
    );
    
    console.log(`   Sequence number: ${accountInfo.data.sequence_number}`);
    console.log(`   Authentication key: ${accountInfo.data.authentication_key}`);
    
    if (parseInt(accountInfo.data.sequence_number) > 0) {
      console.log('   ✅ Account has been used for transactions');
    }
  } catch (error) {
    console.log('   Error checking account:', error.message);
  }
}

checkAptosModules().catch(console.error);