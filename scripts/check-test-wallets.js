const { ethers } = require('ethers');

async function checkTestWallets() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  console.log('🔍 Fusion+ Test Wallets Status (Sepolia)');
  console.log('═'.repeat(80));
  
  const wallets = [
    {
      name: 'NEW User Wallet',
      address: '0x4479B0150248772B44B63817c11c589a25957e85',
      purpose: 'Creates source escrow in tests',
      needed: '0.01 ETH'
    },
    {
      name: 'Resolver Wallet',
      address: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
      purpose: 'Creates destination escrow',
      needed: '0.002 ETH'
    },
    {
      name: 'Escrow Contract',
      address: '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4',
      purpose: 'Holds locked funds',
      needed: 'N/A'
    }
  ];
  
  for (const wallet of wallets) {
    const balance = await provider.getBalance(wallet.address);
    const ethBalance = ethers.formatEther(balance);
    
    console.log(`\n${wallet.name}:`);
    console.log(`  Address: ${wallet.address}`);
    console.log(`  Balance: ${ethBalance} ETH`);
    console.log(`  Purpose: ${wallet.purpose}`);
    
    if (wallet.needed !== 'N/A') {
      const neededAmount = ethers.parseEther(wallet.needed.split(' ')[0]);
      if (balance < neededAmount) {
        console.log(`  Status:  ❌ NEEDS FUNDING (${wallet.needed})`);
      } else {
        console.log(`  Status:  ✅ Sufficient balance`);
      }
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('\n📍 To fund the NEW User Wallet, send ETH to:');
  console.log('\n0x4479B0150248772B44B63817c11c589a25957e85\n');
}

checkTestWallets().catch(console.error);