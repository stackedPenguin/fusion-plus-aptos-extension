const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

async function fundWithLegacyFaucet(address) {
  try {
    const response = await axios.post('https://faucet.testnet.aptoslabs.com/mint', {
      address,
      amount: 200000000 // 2 APT
    });
    return true;
  } catch (error) {
    console.log('Legacy faucet failed, trying alternative...');
    try {
      const response = await axios.post('https://faucet.testnet.aptoslabs.com/fund', null, {
        params: {
          address,
          amount: 200000000
        }
      });
      return true;
    } catch (err) {
      return false;
    }
  }
}

async function deployAptosContracts() {
  console.log('🚀 Deploying Aptos Contracts to Testnet');
  console.log('═'.repeat(80));

  try {
    // Initialize Aptos client
    const aptos = new Aptos(config);

    // Create or load deployer account
    let deployerAccount;
    const keyPath = path.join(__dirname, '../.keys/aptos-deployer.key');
    
    if (fs.existsSync(keyPath)) {
      const privateKeyHex = fs.readFileSync(keyPath, 'utf8').trim();
      const privateKey = new Ed25519PrivateKey(privateKeyHex);
      deployerAccount = Account.fromPrivateKey({ privateKey });
      console.log('✅ Loaded existing deployer account');
    } else {
      deployerAccount = Account.generate();
      fs.mkdirSync(path.dirname(keyPath), { recursive: true });
      fs.writeFileSync(keyPath, deployerAccount.privateKey.toString());
      console.log('✅ Created new deployer account');
    }

    console.log(`\n📋 Deployer Account: ${deployerAccount.accountAddress.toString()}`);

    // Check balance
    let needsFunding = false;
    try {
      const resources = await aptos.getAccountResources({ accountAddress: deployerAccount.accountAddress });
      const aptBalance = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
      
      if (!aptBalance || BigInt(aptBalance.data.coin.value) < BigInt(100000000)) {
        needsFunding = true;
      } else {
        console.log(`   Balance: ${(BigInt(aptBalance.data.coin.value) / BigInt(100000000)).toString()} APT`);
      }
    } catch (error) {
      // Account doesn't exist yet
      needsFunding = true;
    }
    
    if (needsFunding) {
      console.log('\n💰 Account needs funding...');
      console.log('\n⚠️  MANUAL STEP REQUIRED:');
      console.log(`   1. Go to: https://aptos.dev/en/network/faucet`);
      console.log(`   2. Select "Testnet" network`);
      console.log(`   3. Enter address: ${deployerAccount.accountAddress.toString()}`);
      console.log(`   4. Click "Add to faucet queue"`);
      console.log(`   5. Wait for funding confirmation`);
      console.log(`   6. Run this script again`);
      
      // Try legacy faucet anyway
      console.log('\n   Attempting automatic funding...');
      const funded = await fundWithLegacyFaucet(deployerAccount.accountAddress.toString());
      if (funded) {
        console.log('   ✅ Automatic funding successful!');
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.log('   ❌ Automatic funding failed. Please fund manually.');
        return;
      }
    }

    // Recheck balance after funding
    try {
      const resources = await aptos.getAccountResources({ accountAddress: deployerAccount.accountAddress });
      const aptBalance = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
      console.log(`\n   Current Balance: ${(BigInt(aptBalance.data.coin.value) / BigInt(100000000)).toString()} APT`);
    } catch (error) {
      console.log('   ❌ Account still not funded. Please fund manually and try again.');
      return;
    }

    // Read compiled modules
    const buildPath = path.join(__dirname, '../contracts/aptos/build/FusionPlusAptos/bytecode_modules');
    const escrowModule = fs.readFileSync(path.join(buildPath, 'escrow.mv'));
    const layerzeroModule = fs.readFileSync(path.join(buildPath, 'layerzero_adapter.mv'));

    console.log('\n📦 Deploying Modules...');
    console.log('   This will deploy both escrow and layerzero_adapter modules');
    
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
      
      await aptos.waitForTransaction({ transactionHash: deployTxnRes.hash });
      console.log(`   ✅ Modules deployed: ${deployTxnRes.hash}`);

      // Initialize modules
      console.log('\n🔧 Initializing Modules...');
      
      // Initialize escrow module
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

      // Initialize LayerZero adapter
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
        console.log('\n⚠️  Modules already deployed. Skipping to initialization...');
        
        // Try to initialize anyway
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
        } catch (initError) {
          console.log('   ℹ️  Modules may already be initialized');
        }
        
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
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    throw error;
  }
}

// Run deployment
deployAptosContracts().catch(console.error);