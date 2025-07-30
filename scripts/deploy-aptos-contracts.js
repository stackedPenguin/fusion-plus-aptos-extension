const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const config = new AptosConfig({ network: Network.TESTNET });

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
    const resources = await aptos.getAccountResources({ accountAddress: deployerAccount.accountAddress });
    let aptBalance = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
    
    if (!aptBalance || BigInt(aptBalance.data.coin.value) < BigInt(100000000)) { // 1 APT
      console.log('\n💰 Funding deployer account...');
      await aptos.fundAccount({ accountAddress: deployerAccount.accountAddress, amount: 200000000 }); // 2 APT
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const updatedResources = await aptos.getAccountResources({ accountAddress: deployerAccount.accountAddress });
      aptBalance = updatedResources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
    }
    
    console.log(`   Balance: ${(BigInt(aptBalance.data.coin.value) / BigInt(100000000)).toString()} APT`);

    // Read compiled modules
    const buildPath = path.join(__dirname, '../contracts/aptos/build/FusionPlusAptos/bytecode_modules');
    const escrowModule = fs.readFileSync(path.join(buildPath, 'escrow.mv'));
    const layerzeroModule = fs.readFileSync(path.join(buildPath, 'layerzero_adapter.mv'));

    console.log('\n📦 Deploying Escrow Module...');
    
    // Deploy escrow module
    const escrowTxn = await aptos.publishModuleTransaction({
      account: deployerAccount,
      moduleBytecode: escrowModule,
    });
    
    const escrowTxnRes = await aptos.signAndSubmitTransaction({
      signer: deployerAccount,
      transaction: escrowTxn,
    });
    
    await aptos.waitForTransaction({ transactionHash: escrowTxnRes.hash });
    console.log(`   ✅ Escrow module deployed: ${escrowTxnRes.hash}`);

    console.log('\n📦 Deploying LayerZero Adapter Module...');
    
    // Deploy LayerZero adapter module
    const layerzeroTxn = await aptos.publishModuleTransaction({
      account: deployerAccount,
      moduleBytecode: layerzeroModule,
    });
    
    const layerzeroTxnRes = await aptos.signAndSubmitTransaction({
      signer: deployerAccount,
      transaction: layerzeroTxn,
    });
    
    await aptos.waitForTransaction({ transactionHash: layerzeroTxnRes.hash });
    console.log(`   ✅ LayerZero adapter module deployed: ${layerzeroTxnRes.hash}`);

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
      escrowDeployTx: escrowTxnRes.hash,
      layerzeroDeployTx: layerzeroTxnRes.hash,
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
    console.error('\n❌ Deployment failed:', error);
    throw error;
  }
}

// Run deployment
deployAptosContracts().catch(console.error);