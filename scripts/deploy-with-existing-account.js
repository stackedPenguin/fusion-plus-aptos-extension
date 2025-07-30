const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../backend/resolver/.env') });

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

async function deployWithExistingAccount() {
  console.log('🚀 Deploying Aptos Contracts with Existing Account');
  console.log('═'.repeat(80));

  try {
    // Initialize Aptos client
    const aptos = new Aptos(config);

    // Load existing account from .env
    const privateKeyString = process.env.APTOS_PRIVATE_KEY;
    if (!privateKeyString) {
      throw new Error('APTOS_PRIVATE_KEY not found in .env');
    }

    // Remove the 'ed25519-priv-' prefix if present
    const privateKeyHex = privateKeyString.replace('ed25519-priv-', '');
    const privateKey = new Ed25519PrivateKey(privateKeyHex);
    const deployerAccount = Account.fromPrivateKey({ privateKey });

    console.log(`\n📋 Using Existing Account: ${deployerAccount.accountAddress.toString()}`);

    // Check balance
    try {
      const resources = await aptos.getAccountResources({ accountAddress: deployerAccount.accountAddress });
      const aptBalance = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
      
      if (!aptBalance) {
        console.log('   ❌ Account has no APT balance');
        console.log(`   Please fund account: ${deployerAccount.accountAddress.toString()}`);
        return;
      }
      
      const balance = BigInt(aptBalance.data.coin.value) / BigInt(100000000);
      console.log(`   Balance: ${balance.toString()} APT`);
      
      if (balance < 1n) {
        console.log('   ⚠️  Low balance. Deployment may fail.');
      }
    } catch (error) {
      console.log('   ❌ Could not check balance. Account may not exist.');
      console.log(`   Please fund account: ${deployerAccount.accountAddress.toString()}`);
      return;
    }

    // Read compiled modules
    const buildPath = path.join(__dirname, '../contracts/aptos/build/FusionPlusAptos/bytecode_modules');
    const escrowModule = fs.readFileSync(path.join(buildPath, 'escrow.mv'));
    const layerzeroModule = fs.readFileSync(path.join(buildPath, 'layerzero_adapter.mv'));

    console.log('\n📦 Deploying Modules...');
    
    try {
      // Deploy both modules in one transaction
      const moduleBytecodes = [escrowModule, layerzeroModule];
      
      const deployTxn = await aptos.publishModuleTransaction({
        account: deployerAccount,
        moduleBytecode: moduleBytecodes,
      });
      
      const deployTxnRes = await aptos.signAndSubmitTransaction({
        signer: deployerAccount,
        transaction: deployTxn,
      });
      
      console.log(`   ⏳ Waiting for transaction...`);
      await aptos.waitForTransaction({ transactionHash: deployTxnRes.hash });
      console.log(`   ✅ Modules deployed: ${deployTxnRes.hash}`);

      // Initialize modules
      console.log('\n🔧 Initializing Modules...');
      
      // Initialize escrow module
      try {
        const initEscrowTxn = await aptos.transaction.build.simple({
          sender: deployerAccount.accountAddress,
          data: {
            function: `${deployerAccount.accountAddress.toString()}::escrow::initialize`,
            typeArguments: [],
            functionArguments: []
          }
        });

        const initEscrowTxnRes = await aptos.signAndSubmitTransaction({
          signer: deployerAccount,
          transaction: initEscrowTxn,
        });
        
        await aptos.waitForTransaction({ transactionHash: initEscrowTxnRes.hash });
        console.log(`   ✅ Escrow module initialized: ${initEscrowTxnRes.hash}`);
      } catch (error) {
        if (error.message && error.message.includes('RESOURCE_ALREADY_EXISTS')) {
          console.log('   ℹ️  Escrow module already initialized');
        } else {
          throw error;
        }
      }

      // Initialize LayerZero adapter
      try {
        const initLayerzeroTxn = await aptos.transaction.build.simple({
          sender: deployerAccount.accountAddress,
          data: {
            function: `${deployerAccount.accountAddress.toString()}::layerzero_adapter::initialize`,
            typeArguments: [],
            functionArguments: []
          }
        });

        const initLayerzeroTxnRes = await aptos.signAndSubmitTransaction({
          signer: deployerAccount,
          transaction: initLayerzeroTxn,
        });
        
        await aptos.waitForTransaction({ transactionHash: initLayerzeroTxnRes.hash });
        console.log(`   ✅ LayerZero adapter initialized: ${initLayerzeroTxnRes.hash}`);
      } catch (error) {
        if (error.message && error.message.includes('RESOURCE_ALREADY_EXISTS')) {
          console.log('   ℹ️  LayerZero adapter already initialized');
        } else {
          throw error;
        }
      }

      // Save deployment info
      const deploymentInfo = {
        network: 'testnet',
        deployerAddress: deployerAccount.accountAddress.toString(),
        escrowModule: `${deployerAccount.accountAddress.toString()}::escrow`,
        layerzeroModule: `${deployerAccount.accountAddress.toString()}::layerzero_adapter`,
        deployTx: deployTxnRes.hash,
        timestamp: new Date().toISOString()
      };

      // Create deployments directory if it doesn't exist
      const deploymentsDir = path.join(__dirname, '../deployments');
      if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(deploymentsDir, 'aptos-testnet.json'),
        JSON.stringify(deploymentInfo, null, 2)
      );

      console.log('\n✅ Deployment Complete!');
      console.log('\n📋 Deployment Summary:');
      console.log(`   Deployer: ${deployerAccount.accountAddress.toString()}`);
      console.log(`   Escrow Module: ${deploymentInfo.escrowModule}`);
      console.log(`   LayerZero Module: ${deploymentInfo.layerzeroModule}`);
      
      // Update .env file
      const envPath = path.join(__dirname, '../backend/resolver/.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Update or add Aptos contract address
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
        console.log('\n✅ Updated .env with contract addresses');
      }

    } catch (error) {
      if (error.message && error.message.includes('DUPLICATE_MODULE')) {
        console.log('\n⚠️  Modules already deployed by this account');
        
        // Save deployment info anyway
        const deploymentInfo = {
          network: 'testnet',
          deployerAddress: deployerAccount.accountAddress.toString(),
          escrowModule: `${deployerAccount.accountAddress.toString()}::escrow`,
          layerzeroModule: `${deployerAccount.accountAddress.toString()}::layerzero_adapter`,
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

        console.log('\n📋 Modules already deployed at:');
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
          console.log('\n✅ Updated .env with contract addresses');
        }
      } else if (error.message && error.message.includes('INSUFFICIENT_BALANCE')) {
        console.log('\n❌ Insufficient balance for deployment');
        console.log(`   Please fund account: ${deployerAccount.accountAddress.toString()}`);
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message || error);
  }
}

// Run deployment
deployWithExistingAccount().catch(console.error);