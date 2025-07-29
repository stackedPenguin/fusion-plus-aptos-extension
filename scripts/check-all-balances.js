const { ethers } = require('ethers');

async function checkAllBalances() {
  console.log('=== Checking All Wallet Balances ===\n');
  
  // Ethereum provider
  const ethProvider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  // User wallets
  console.log('USER WALLETS:');
  console.log('-------------');
  
  // User Ethereum
  const userEthAddress = '0x8F90dE323b5E77EB1dDa97410110d2B27892AECF';
  const userEthBalance = await ethProvider.getBalance(userEthAddress);
  console.log('Ethereum:', userEthAddress);
  console.log('Balance:', ethers.formatEther(userEthBalance), 'ETH');
  console.log(userEthBalance === 0n ? '❌ Needs funding' : '✅ Funded');
  console.log('');
  
  // User Aptos
  const userAptosAddress = '0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35';
  try {
    const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        function: "0x1::coin::balance",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [userAptosAddress]
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      const balance = result[0] || '0';
      const aptAmount = parseInt(balance) / 1e8;
      console.log('Aptos:', userAptosAddress);
      console.log('Balance:', aptAmount, 'APT');
      console.log(balance === '0' ? '❌ Needs funding' : '✅ Funded');
    } else {
      console.log('Aptos:', userAptosAddress);
      console.log('Balance: 0 APT (account not found)');
      console.log('❌ Needs funding');
    }
  } catch (e) {
    console.log('Aptos:', userAptosAddress);
    console.log('Balance: 0 APT (error checking balance)');
    console.log('❌ Needs funding');
  }
  
  console.log('\n\nRESOLVER WALLETS:');
  console.log('-----------------');
  
  // Resolver Ethereum
  const resolverEthAddress = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
  const resolverEthBalance = await ethProvider.getBalance(resolverEthAddress);
  console.log('Ethereum:', resolverEthAddress);
  console.log('Balance:', ethers.formatEther(resolverEthBalance), 'ETH');
  console.log(resolverEthBalance === 0n ? '❌ Needs funding' : '✅ Funded');
  console.log('');
  
  // Resolver Aptos
  const resolverAptosAddress = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
  try {
    const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        function: "0x1::coin::balance",
        type_arguments: ["0x1::aptos_coin::AptosCoin"],
        arguments: [resolverAptosAddress]
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      const balance = result[0] || '0';
      const aptAmount = parseInt(balance) / 1e8;
      console.log('Aptos:', resolverAptosAddress);
      console.log('Balance:', aptAmount, 'APT');
      console.log(balance === '0' ? '❌ Needs funding' : '✅ Funded');
    } else {
      console.log('Aptos:', resolverAptosAddress);
      console.log('Balance: 0 APT (account not found)');
      console.log('❌ Needs funding');
    }
  } catch (e) {
    console.log('Aptos:', resolverAptosAddress);
    console.log('Balance: 0 APT (error checking balance)');
    console.log('❌ Needs funding');
  }
  
  console.log('\n\nFUNDING SUMMARY:');
  console.log('----------------');
  console.log('User needs:');
  console.log('- ETH for swapping');
  console.log('- APT for receiving swaps');
  console.log('\nResolver needs:');
  console.log('- ETH for gas fees');
  console.log('- APT for gas fees + liquidity to provide');
}

checkAllBalances().catch(console.error);