const { ethers } = require('ethers');

// Provider
const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');

// Resolver 2 wallet (has ETH to send)
const resolver2PrivateKey = '0x8a497b1a2924ccbed784a65541dac0af48f684e263fda2a3b1ca017d5ce9bc21';
const resolver2Wallet = new ethers.Wallet(resolver2PrivateKey, provider);

// Resolver 1 address (needs ETH)
const resolver1Address = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';

async function fundResolver1() {
  console.log('Sending ETH from Resolver-2 to Resolver-1...\n');
  
  // Check current balances
  const resolver1Balance = await provider.getBalance(resolver1Address);
  const resolver2Balance = await provider.getBalance(resolver2Wallet.address);
  
  console.log('Current balances:');
  console.log(`  Resolver-1: ${ethers.formatEther(resolver1Balance)} ETH`);
  console.log(`  Resolver-2: ${ethers.formatEther(resolver2Balance)} ETH\n`);
  
  const amountToSend = '0.005'; // Send 0.005 ETH
  
  try {
    console.log(`Sending ${amountToSend} ETH to Resolver-1...`);
    const tx = await resolver2Wallet.sendTransaction({
      to: resolver1Address,
      value: ethers.parseEther(amountToSend)
    });
    
    console.log(`Transaction hash: ${tx.hash}`);
    await tx.wait();
    console.log('✅ ETH sent successfully!\n');
    
    // Check final balances
    const finalResolver1Balance = await provider.getBalance(resolver1Address);
    const finalResolver2Balance = await provider.getBalance(resolver2Wallet.address);
    
    console.log('Final balances:');
    console.log(`  Resolver-1: ${ethers.formatEther(finalResolver1Balance)} ETH`);
    console.log(`  Resolver-2: ${ethers.formatEther(finalResolver2Balance)} ETH`);
    
  } catch (error) {
    console.error('❌ Failed to send ETH:', error.message);
  }
}

fundResolver1().catch(console.error);