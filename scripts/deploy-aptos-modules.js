const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

async function deployAptosModules() {
  console.log('🚀 Deploying Aptos Modules Individually');
  console.log('═'.repeat(80));

  try {
    const aptos = new Aptos(config);

    // Load deployer account
    const keyPath = path.join(__dirname, '../.keys/aptos-deployer.key');
    const privateKeyString = fs.readFileSync(keyPath, 'utf8').trim();
    const privateKeyHex = privateKeyString.replace('ed25519-priv-', '');
    const privateKey = new Ed25519PrivateKey(privateKeyHex);
    const deployerAccount = Account.fromPrivateKey({ privateKey });

    console.log(`\n📋 Deployer Account: ${deployerAccount.accountAddress.toString()}`);

    // Check balance
    const viewPayload = {
      function: "0x1::coin::balance",
      type_arguments: ["0x1::aptos_coin::AptosCoin"],
      arguments: [deployerAccount.accountAddress.toString()]
    };
    
    const balanceResponse = await axios.post('https://fullnode.testnet.aptoslabs.com/v1/view', viewPayload);
    const balance = BigInt(balanceResponse.data[0]) / BigInt(100000000);
    console.log(`   Balance: ${balance} APT`);

    if (balance < 1n) {
      console.log('\n❌ Insufficient balance for deployment');
      return;
    }

    // Read compiled modules
    const buildPath = path.join(__dirname, '../contracts/aptos/build/FusionPlusAptos/bytecode_modules');
    const escrowModule = fs.readFileSync(path.join(buildPath, 'escrow.mv'));
    const layerzeroModule = fs.readFileSync(path.join(buildPath, 'layerzero_adapter.mv'));

    console.log('\n📦 Deploying Modules...');
    
    // For Aptos, we need to use the legacy transaction format for module deployment
    // Let's try a different approach using the REST API directly
    
    const moduleHex = '0x' + escrowModule.toString('hex');
    const layerzeroHex = '0x' + layerzeroModule.toString('hex');
    
    console.log('   Module sizes:');
    console.log(`   - Escrow: ${escrowModule.length} bytes`);
    console.log(`   - LayerZero: ${layerzeroModule.length} bytes`);

    // Deploy using direct REST API call
    const deployPayload = {
      type: "module_bundle_payload",
      modules: [
        { bytecode: moduleHex },
        { bytecode: layerzeroHex }
      ]
    };

    console.log('\n   Generating transaction...');
    
    const txnRequest = await aptos.transaction.build.simple({
      sender: deployerAccount.accountAddress,
      data: deployPayload
    });

    const signedTxn = await aptos.signTransaction({
      signer: deployerAccount,
      transaction: txnRequest
    });

    console.log('   Submitting transaction...');
    
    const pendingTxn = await aptos.submitTransaction({
      transaction: txnRequest,
      senderAuthenticator: signedTxn
    });

    console.log(`   Transaction hash: ${pendingTxn.hash}`);
    console.log('   Waiting for confirmation...');

    const txnReceipt = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash
    });

    if (txnReceipt.success) {
      console.log(`   ✅ Modules deployed successfully!`);
      
      // Save deployment info
      const deploymentInfo = {
        network: 'testnet',
        deployerAddress: deployerAccount.accountAddress.toString(),
        escrowModule: `${deployerAccount.accountAddress.toString()}::escrow`,
        layerzeroModule: `${deployerAccount.accountAddress.toString()}::layerzero_adapter`,
        deployTxHash: pendingTxn.hash,
        timestamp: new Date().toISOString()
      };

      const deploymentsDir = path.join(__dirname, '../deployments');
      if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(deploymentsDir, 'aptos-testnet.json'),
        JSON.stringify(deploymentInfo, null, 2)
      );

      console.log('\n📋 Deployment Summary:');
      console.log(`   Deployer: ${deployerAccount.accountAddress.toString()}`);
      console.log(`   Escrow Module: ${deploymentInfo.escrowModule}`);
      console.log(`   LayerZero Module: ${deploymentInfo.layerzeroModule}`);
      
      // Update .env file
      const envPath = path.join(__dirname, '../backend/resolver/.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        if (envContent.includes('APTOS_ESCROW_MODULE=')) {
          envContent = envContent.replace(/APTOS_ESCROW_MODULE=.*/, `APTOS_ESCROW_MODULE=${deploymentInfo.escrowModule}`);
        } else {
          envContent += `\nAPTOS_ESCROW_MODULE=${deploymentInfo.escrowModule}`;
        }
        
        if (envContent.includes('APTOS_LAYERZERO_MODULE=')) {
          envContent = envContent.replace(/APTOS_LAYERZERO_MODULE=.*/, `APTOS_LAYERZERO_MODULE=${deploymentInfo.layerzeroModule}`);
        } else {
          envContent += `\nAPTOS_LAYERZERO_MODULE=${deploymentInfo.layerzeroModule}`;
        }
        
        fs.writeFileSync(envPath, envContent);
        console.log('\n✅ Updated .env with module addresses');
      }

      // Now initialize the modules
      console.log('\n🔧 Initializing Modules...');
      
      try {
        // Initialize escrow
        const initEscrowTxn = await aptos.transaction.build.simple({
          sender: deployerAccount.accountAddress,
          data: {
            function: `${deployerAccount.accountAddress.toString()}::escrow::initialize`,
            typeArguments: [],
            functionArguments: []
          }
        });

        const initEscrowSigned = await aptos.signTransaction({
          signer: deployerAccount,
          transaction: initEscrowTxn
        });

        const initEscrowPending = await aptos.submitTransaction({
          transaction: initEscrowTxn,
          senderAuthenticator: initEscrowSigned
        });

        await aptos.waitForTransaction({ transactionHash: initEscrowPending.hash });
        console.log('   ✅ Escrow module initialized');
      } catch (error) {
        if (error.message && error.message.includes('RESOURCE_ALREADY_EXISTS')) {
          console.log('   ℹ️  Escrow already initialized');
        } else {
          console.log('   ⚠️  Failed to initialize escrow:', error.message);
        }
      }

      try {
        // Initialize layerzero adapter
        const initLayerzeroTxn = await aptos.transaction.build.simple({
          sender: deployerAccount.accountAddress,
          data: {
            function: `${deployerAccount.accountAddress.toString()}::layerzero_adapter::initialize`,
            typeArguments: [],
            functionArguments: []
          }
        });

        const initLayerzeroSigned = await aptos.signTransaction({
          signer: deployerAccount,
          transaction: initLayerzeroTxn
        });

        const initLayerzeroPending = await aptos.submitTransaction({
          transaction: initLayerzeroTxn,
          senderAuthenticator: initLayerzeroSigned
        });

        await aptos.waitForTransaction({ transactionHash: initLayerzeroPending.hash });
        console.log('   ✅ LayerZero adapter initialized');
      } catch (error) {
        if (error.message && error.message.includes('RESOURCE_ALREADY_EXISTS')) {
          console.log('   ℹ️  LayerZero adapter already initialized');
        } else {
          console.log('   ⚠️  Failed to initialize LayerZero adapter:', error.message);
        }
      }

      console.log('\n✅ Deployment complete!');
      
    } else {
      console.log(`   ❌ Deployment failed: ${txnReceipt.vm_status}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message || error);
    if (error.transaction) {
      console.error('Transaction details:', {
        vm_status: error.transaction.vm_status,
        gas_used: error.transaction.gas_used
      });
    }
  }
}

deployAptosModules().catch(console.error);