const { AptosClient, AptosAccount, HexString } = require('aptos');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config({ path: '../../backend/resolver/.env' });

async function deployEscrowModule() {
  const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
  
  // Get the private key from environment
  let privateKey = process.env.APTOS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('APTOS_PRIVATE_KEY not found in environment');
  }
  
  // Remove the "ed25519-priv-" prefix if present
  if (privateKey.startsWith('ed25519-priv-')) {
    privateKey = privateKey.replace('ed25519-priv-', '');
  }
  
  // Remove 0x prefix if present
  if (privateKey.startsWith('0x')) {
    privateKey = privateKey.substring(2);
  }

  // Create account from private key
  const account = new AptosAccount(new HexString(privateKey).toUint8Array());
  const address = account.address().hex();
  
  console.log('Deploying from address:', address);
  
  // Check account balance
  const resources = await client.getAccountResources(account.address());
  const accountResource = resources.find((r) => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
  const balance = accountResource ? parseInt(accountResource.data.coin.value) / 100000000 : 0;
  console.log('Account balance:', balance, 'APT');
  
  if (balance < 0.1) {
    console.log('Warning: Low balance. You might need to fund your account for deployment.');
  }

  // Update Move.toml with the actual deployer address
  const moveTomlPath = path.join(__dirname, 'Move.toml');
  let moveToml = fs.readFileSync(moveTomlPath, 'utf8');
  moveToml = moveToml.replace(/fusion_plus = ".*"/g, `fusion_plus = "${address}"`);
  moveToml = moveToml.replace(/escrow_addr = ".*"/g, `escrow_addr = "${address}"`);
  moveToml = moveToml.replace(/FusionPlusAptos = ".*"/g, `FusionPlusAptos = "${address}"`);
  fs.writeFileSync(moveTomlPath, moveToml);
  console.log('Updated Move.toml with deployer address');

  // Compile the module
  console.log('\nCompiling Move module...');
  try {
    const { stdout: compileOut } = await execPromise(
      `aptos move compile --named-addresses fusion_plus=${address},escrow_addr=${address}`,
      { cwd: __dirname }
    );
    console.log('Compilation successful!');
  } catch (error) {
    console.error('Compilation failed:', error);
    throw error;
  }

  // Deploy using CLI (more reliable for package deployment)
  console.log('\nDeploying module to Aptos testnet...');
  
  // First, create a temporary profile
  const profileName = `temp_deploy_${Date.now()}`;
  
  try {
    // Initialize profile with private key
    await execPromise(
      `aptos init --profile ${profileName} --network testnet --private-key ${privateKey} --assume-yes`,
      { cwd: __dirname }
    );
    
    // Deploy the package
    const { stdout: deployOut } = await execPromise(
      `aptos move publish --profile ${profileName} --named-addresses fusion_plus=${address},escrow_addr=${address} --assume-yes`,
      { cwd: __dirname }
    );
    
    console.log('Deployment output:', deployOut);
    console.log('\nModule deployed successfully!');
    console.log('\nEscrow module address:', address);
    console.log('\nUpdate your frontend config with:');
    console.log(`REACT_APP_APTOS_ESCROW_MODULE=${address}`);
    
    // Clean up profile
    await execPromise(`aptos config remove-profile --profile ${profileName}`);
    
  } catch (error) {
    console.error('Deployment failed:', error);
    // Try to clean up profile even if deployment failed
    try {
      await execPromise(`aptos config remove-profile --profile ${profileName}`);
    } catch (e) {}
    throw error;
  }
}

deployEscrowModule().catch(console.error);