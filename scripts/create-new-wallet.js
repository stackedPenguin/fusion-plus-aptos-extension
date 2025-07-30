const { ethers } = require('ethers');

// Create a new wallet
const wallet = ethers.Wallet.createRandom();

console.log('🔑 New Wallet Created:');
console.log('═'.repeat(50));
console.log(`Address:     ${wallet.address}`);
console.log(`Private Key: ${wallet.privateKey}`);
console.log('═'.repeat(50));
console.log('\n⚠️  IMPORTANT: Save this private key securely!');
console.log('\n📍 Please send at least 0.01 ETH to this address on Sepolia:');
console.log(`\n${wallet.address}\n`);