const { ethers } = require('ethers');

console.log('=== Mock Deployment for Demonstration ===\n');

// Ethereum deployment
console.log('Ethereum (Sepolia) Deployment:');
console.log('Deploying FusionPlusEscrow...');
console.log('Transaction hash: 0x' + 'a'.repeat(64));
console.log('Waiting for confirmations...');
console.log('FusionPlusEscrow deployed to: 0x' + ethers.randomBytes(20).toString('hex'));

console.log('\nAptos (Testnet) Deployment:');
console.log('Deploying fusion_plus::escrow...');
console.log('Transaction hash: 0x' + 'b'.repeat(64));
console.log('Module published at: 0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35::escrow');

console.log('\n=== Deployment Complete ===');
console.log('\nTo actually deploy:');
console.log('1. Fund the wallets using the faucets');
console.log('2. Run: cd contracts/ethereum && npx hardhat run scripts/deploy.js --network sepolia');
console.log('3. Run: cd contracts/aptos && aptos move publish --profile testnet');