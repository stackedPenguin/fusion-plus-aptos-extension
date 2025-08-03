const { AptosClient, AptosAccount, HexString } = require('aptos');
const fs = require('fs');
const path = require('path');

async function deployPartialFill() {
  try {
    const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
    
    // Use the existing private key from .env.resolver3
    const privateKeyHex = '0x7c7ac1c8279011232286dd94ad54b3fc17a37ee1f7df3b9d337825dfb64b0a2b';
    const privateKey = new HexString(privateKeyHex);
    const account = new AptosAccount(privateKey.toUint8Array());
    
    console.log('Using account address:', account.address().hex());
    console.log('Private key:', privateKeyHex);
    
    // Check account balance
    const resources = await client.getAccountResources(account.address());
    const accountResource = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
    if (accountResource) {
      console.log('Account balance:', accountResource.data.coin.value);
    }
    
    // Update Move.toml with the account address
    const moveTomlPath = path.join(__dirname, 'Move.toml');
    let moveToml = fs.readFileSync(moveTomlPath, 'utf8');
    
    // Replace all instances of the old address with the new one
    const newAddress = account.address().hex();
    moveToml = moveToml.replace(/0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8/g, newAddress);
    
    // Write back the updated Move.toml
    fs.writeFileSync(moveTomlPath, moveToml);
    console.log('Updated Move.toml with address:', newAddress);
    
    // Compile the modules
    console.log('Compiling modules...');
    const { execSync } = require('child_process');
    execSync('aptos move compile', { cwd: __dirname, stdio: 'inherit' });
    
    // Deploy the modules
    console.log('Deploying modules...');
    const deployResult = execSync(
      `aptos move publish --assume-yes --private-key ${privateKeyHex} --url https://fullnode.testnet.aptoslabs.com`,
      { cwd: __dirname, encoding: 'utf8' }
    );
    console.log(deployResult);
    
    // Save deployment info
    const deploymentInfo = {
      address: newAddress,
      privateKey: privateKeyHex,
      publicKey: account.toPrivateKeyObject().publicKeyHex,
      network: 'testnet',
      modules: ['fusion_plus_partial_fill', 'escrow', 'escrow_v2', 'escrow_v3', 'layerzero_adapter']
    };
    
    fs.writeFileSync(
      path.join(__dirname, 'partial-fill-deployment.json'),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log('\n✅ Deployment successful!');
    console.log('Deployment info saved to partial-fill-deployment.json');
    console.log(`\nIMPORTANT: Update your .env files with:`);
    console.log(`APTOS_ESCROW_MODULE=${newAddress}`);
    console.log(`APTOS_ESCROW_ADDRESS=${newAddress}`);
    
    return deploymentInfo;
  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  }
}

// Run deployment
deployPartialFill().catch(console.error);