const { ethers } = require('ethers');
require('dotenv').config({ path: '../backend/resolver/.env' });

async function sendWETHToResolver() {
  const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');
  const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY, provider);
  
  const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  const RESOLVER_ADDRESS = process.env.ETHEREUM_RESOLVER_ADDRESS || '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
  
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function deposit() payable'
  ];
  
  const wethContract = new ethers.Contract(WETH_ADDRESS, wethAbi, wallet);
  
  try {
    // Check current balances
    const resolverBalance = await wethContract.balanceOf(RESOLVER_ADDRESS);
    const senderBalance = await wethContract.balanceOf(wallet.address);
    const ethBalance = await provider.getBalance(wallet.address);
    
    console.log('\nCurrent Balances:');
    console.log('Sender ETH:', ethers.formatEther(ethBalance));
    console.log('Sender WETH:', ethers.formatEther(senderBalance));
    console.log('Resolver WETH:', ethers.formatEther(resolverBalance));
    
    // Calculate how much we can wrap (leave some ETH for gas)
    const amountToWrap = ethBalance > ethers.parseEther('0.04') ? '0.03' : '0.01';
    
    // If sender has less WETH than needed, wrap some ETH first
    if (senderBalance < ethers.parseEther(amountToWrap)) {
      console.log(`\nWrapping ${amountToWrap} ETH to WETH...`);
      const wrapTx = await wethContract.deposit({ value: ethers.parseEther(amountToWrap) });
      await wrapTx.wait();
      console.log('Wrap transaction:', wrapTx.hash);
    }
    
    // Send WETH to resolver (send existing balance)
    const amountToSend = await wethContract.balanceOf(wallet.address);
    if (amountToSend > 0) {
      console.log(`\nSending ${ethers.formatEther(amountToSend)} WETH to resolver...`);
      const transferTx = await wethContract.transfer(RESOLVER_ADDRESS, amountToSend);
      await transferTx.wait();
      console.log('Transfer transaction:', transferTx.hash);
    } else {
      console.log('\nNo WETH to send');
    }
    
    // Check final balance
    const finalResolverBalance = await wethContract.balanceOf(RESOLVER_ADDRESS);
    console.log('\nFinal resolver WETH balance:', ethers.formatEther(finalResolverBalance));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

sendWETHToResolver();