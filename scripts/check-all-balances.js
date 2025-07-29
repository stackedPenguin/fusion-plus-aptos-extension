const { ethers } = require('ethers');
const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');

async function checkAllBalances() {
  console.log('=== Checking All Wallet Balances ===\n');
  
  // Ethereum provider
  const ethProvider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  // Aptos client
  const aptosConfig = new AptosConfig({ 
    network: Network.TESTNET,
    fullnode: 'https://fullnode.testnet.aptoslabs.com/v1'
  });
  const aptosClient = new Aptos(aptosConfig);
  
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
    const userAptosAccount = await aptosClient.getAccountResource({
      accountAddress: userAptosAddress,
      resourceType: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
    });
    const balance = userAptosAccount.coin?.value || '0';
    console.log('Aptos:', userAptosAddress);
    console.log('Balance:', Number(balance) / 100000000, 'APT');
    console.log(balance === '0' ? '❌ Needs funding' : '✅ Funded');
  } catch (e) {
    console.log('Aptos:', userAptosAddress);
    console.log('Balance: 0 APT (account not found)');
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
    const resolverAptosAccount = await aptosClient.getAccountResource({
      accountAddress: resolverAptosAddress,
      resourceType: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>'
    });
    const balance = resolverAptosAccount.coin?.value || '0';
    console.log('Aptos:', resolverAptosAddress);
    console.log('Balance:', Number(balance) / 100000000, 'APT');
    console.log(balance === '0' ? '❌ Needs funding' : '✅ Funded');
  } catch (e) {
    console.log('Aptos:', resolverAptosAddress);
    console.log('Balance: 0 APT (account not found)');
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