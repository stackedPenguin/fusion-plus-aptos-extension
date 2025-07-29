const { ethers } = require('ethers');
const { Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');

console.log('=== Generating Test Wallets ===\n');

// Generate Ethereum wallet
const ethWallet = ethers.Wallet.createRandom();
console.log('Ethereum Wallet:');
console.log('Address:', ethWallet.address);
console.log('Private Key:', ethWallet.privateKey);
console.log('');

// Generate Aptos wallet
const privateKey = Ed25519PrivateKey.generate();
const account = Account.fromPrivateKey({ privateKey });
console.log('Aptos Wallet:');
console.log('Address:', account.accountAddress.toString());
console.log('Private Key:', privateKey.toString());
console.log('Public Key:', account.publicKey.toString());
console.log('');

console.log('=== Save these keys securely! ===');
console.log('\nNext steps:');
console.log('1. Fund Ethereum wallet with Sepolia ETH: https://sepoliafaucet.com/');
console.log('2. Fund Aptos wallet with test APT: https://aptos.dev/en/network/faucet');
console.log('3. Update .env files with these keys');