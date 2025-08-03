const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function deployEscrow() {
  try {
    console.log('Building Move package...');
    
    // Change to the contracts/aptos directory
    const contractsDir = path.join(__dirname);
    process.chdir(contractsDir);
    
    // Build the package
    console.log('Running: aptos move compile');
    execSync('aptos move compile', { stdio: 'inherit' });
    
    // Deploy the package
    console.log('\nDeploying to testnet...');
    console.log('Running: aptos move publish');
    
    // Get private key from the new account
    let privateKey;
    try {
      const accountData = JSON.parse(fs.readFileSync(path.join(__dirname, 'new-escrow-account.json'), 'utf8'));
      // Use the first account that was generated
      privateKey = 'ed25519-priv-0x6f96d196c83b19ed4d051edf71ebb4782443c429ef82ae73cb7a9eb08e339c59';
      console.log('Using account:', '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8');
    } catch (err) {
      throw new Error('Could not read new account details');
    }
    
    // Remove prefixes if present
    if (privateKey.startsWith('ed25519-priv-')) {
      privateKey = privateKey.replace('ed25519-priv-', '');
    }
    if (privateKey.startsWith('0x')) {
      privateKey = privateKey.substring(2);
    }
    
    // Deploy using the new account's private key
    execSync(`aptos move publish --assume-yes --url https://fullnode.testnet.aptoslabs.com/v1 --private-key ${privateKey}`, { stdio: 'inherit' });
    
    console.log('\nDeployment complete!');
    console.log('Note: The module will be deployed at your account address');
    
  } catch (error) {
    console.error('Error deploying contract:', error);
    process.exit(1);
  }
}

deployEscrow();