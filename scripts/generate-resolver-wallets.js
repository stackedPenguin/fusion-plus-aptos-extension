const { ethers } = require('ethers');
const { Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');

console.log('=== Generating Resolver Wallets ===\n');
console.log('Resolvers need wallets on both chains to:');
console.log('- Pay gas fees for transactions');
console.log('- Hold liquidity (ETH/APT) to provide in swaps\n');

// Generate Resolver Ethereum wallet
const ethResolverWallet = ethers.Wallet.createRandom();
console.log('Resolver Ethereum Wallet:');
console.log('Address:', ethResolverWallet.address);
console.log('Private Key:', ethResolverWallet.privateKey);
console.log('');

// Generate Resolver Aptos wallet
const aptosPrivateKey = Ed25519PrivateKey.generate();
const aptosResolverAccount = Account.fromPrivateKey({ privateKey: aptosPrivateKey });
console.log('Resolver Aptos Wallet:');
console.log('Address:', aptosResolverAccount.accountAddress.toString());
console.log('Private Key:', aptosPrivateKey.toString());
console.log('Public Key:', aptosResolverAccount.publicKey.toString());
console.log('');

console.log('=== Resolver Funding Requirements ===');
console.log('\nEthereum Resolver Wallet needs:');
console.log('- ETH for gas fees (0.1+ ETH recommended)');
console.log('- NO token balance needed (users provide tokens)');

console.log('\nAptos Resolver Wallet needs:');
console.log('- APT for gas fees (1+ APT recommended)');
console.log('- APT balance for swaps (when user sends ETH, resolver provides APT)');

console.log('\n=== Update Configuration ===');
console.log('Add these to backend/resolver/.env:');
console.log(`ETHEREUM_PRIVATE_KEY=${ethResolverWallet.privateKey.slice(2)}`);
console.log(`ETHEREUM_RESOLVER_ADDRESS=${ethResolverWallet.address}`);
console.log(`APTOS_PRIVATE_KEY=${aptosPrivateKey.toString()}`);
console.log(`APTOS_RESOLVER_ADDRESS=${aptosResolverAccount.accountAddress.toString()}`);