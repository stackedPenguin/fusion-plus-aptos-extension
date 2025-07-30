const { ethers } = require('ethers');
const axios = require('axios');

async function checkAllBalances() {
  console.log('🔍 Checking All Balances');
  console.log('═'.repeat(80));
  
  // Ethereum balances
  console.log('\n📊 ETHEREUM (Sepolia)');
  console.log('─'.repeat(40));
  
  const ethProvider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  const ethWallets = [
    { name: 'User Wallet', address: '0x4479B0150248772B44B63817c11c589a25957e85' },
    { name: 'Resolver Wallet', address: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc' },
    { name: 'Relayer Wallet', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
    { name: 'Escrow Contract', address: '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4' }
  ];
  
  for (const wallet of ethWallets) {
    const balance = await ethProvider.getBalance(wallet.address);
    console.log(`${wallet.name.padEnd(20)} ${wallet.address} = ${ethers.formatEther(balance)} ETH`);
  }
  
  // Aptos balances
  console.log('\n📊 APTOS (Testnet)');
  console.log('─'.repeat(40));
  
  const aptosWallets = [
    { name: 'User Wallet', address: '0xd7b8a93b8d5a6c473bf96e4ae8b0c5cc57c5c5f5ff38b3819e2c5f4e5f4e5f4e' },
    { name: 'Resolver Wallet', address: '0x36f5260acde988971c690510e4f36b166e614e7dc16bb3b86dd19c758e38f577' },
    { name: 'Escrow Module', address: '0x36f5260acde988971c690510e4f36b166e614e7dc16bb3b86dd19c758e38f577' }
  ];
  
  for (const wallet of aptosWallets) {
    try {
      const response = await axios.post(
        'https://fullnode.testnet.aptoslabs.com/v1/view',
        {
          function: '0x1::coin::balance',
          type_arguments: ['0x1::aptos_coin::AptosCoin'],
          arguments: [wallet.address]
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      const balance = response.data[0] || 0;
      const aptBalance = (balance / 100000000).toFixed(8);
      console.log(`${wallet.name.padEnd(20)} ${wallet.address.substring(0, 16)}... = ${aptBalance} APT`);
    } catch (error) {
      console.log(`${wallet.name.padEnd(20)} ${wallet.address.substring(0, 16)}... = Error checking balance`);
    }
  }
  
  console.log('\n' + '═'.repeat(80));
}

checkAllBalances().catch(console.error);