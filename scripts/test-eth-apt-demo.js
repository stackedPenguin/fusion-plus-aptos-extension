const { ethers } = require('ethers');
const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ORDER_ENGINE_URL = 'http://localhost:3001';

// For demo purposes, create a new test wallet
async function testEthAptSwapDemo() {
  console.log('🚀 ETH → APT Cross-Chain Swap Demo');
  console.log('═'.repeat(80));
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  
  // Create a new test wallet for demo
  const userWallet = ethers.Wallet.createRandom().connect(provider);
  console.log(`\n📋 Demo User Wallet: ${userWallet.address}`);
  
  // Check balance
  const balance = await provider.getBalance(userWallet.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    console.log('\n💡 This is a demo showing the flow. In production:');
    console.log('   1. User would have ETH in their wallet');
    console.log('   2. User signs an intent to swap ETH for APT');
    console.log('   3. Resolver locks APT on Aptos for the user');
    console.log('   4. User locks ETH on Ethereum for resolver');
    console.log('   5. Secrets are revealed enabling atomic swap');
  }
  
  // Get exchange rates
  console.log('\n💱 Current Exchange Rates:');
  let rate = 500; // Default fallback
  let expectedApt = 0;
  const swapAmount = 0.001; // ETH
  
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,aptos&vs_currencies=usd');
    const ethPrice = response.data.ethereum?.usd || 3000;
    const aptPrice = response.data.aptos?.usd || 6;
    rate = ethPrice / aptPrice;
    
    console.log(`   ETH: $${ethPrice.toFixed(2)}`);
    console.log(`   APT: $${aptPrice.toFixed(2)}`);
    console.log(`   Exchange Rate: 1 ETH = ${rate.toFixed(2)} APT`);
    
    expectedApt = swapAmount * rate * 0.99; // 1% resolver fee
    
    console.log(`\n📊 Example Swap:`);
    console.log(`   Input: ${swapAmount} ETH`);
    console.log(`   Output: ~${expectedApt.toFixed(4)} APT (after 1% fee)`);
    
  } catch (error) {
    console.log('   Using fallback rates');
    console.log('   1 ETH = 500 APT (approx)');
    expectedApt = swapAmount * rate * 0.99;
  }
  
  // Create demo order
  const orderData = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress,
    toToken: '0x1::aptos_coin::AptosCoin',
    fromAmount: ethers.parseEther('0.001').toString(),
    minToAmount: Math.floor(expectedApt * 100000000).toString(), // Expected APT with 8 decimals
    maker: userWallet.address,
    receiver: '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532',
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString()
  };
  
  // Sign order - match the order engine's expected format
  const domain = {
    name: 'FusionPlusAptos',
    version: '1',
    chainId: 11155111
  };
  
  const types = {
    Order: [
      { name: 'fromChain', type: 'string' },
      { name: 'toChain', type: 'string' },
      { name: 'fromToken', type: 'address' },
      { name: 'toToken', type: 'address' },
      { name: 'fromAmount', type: 'uint256' },
      { name: 'minToAmount', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'partialFillAllowed', type: 'bool' }
    ]
  };
  
  // For demo purposes, use test signature since cross-chain addresses break EIP-712
  const signature = '0x00'; // Development mode accepts this
  
  console.log('\n📝 Order Created');
  console.log(`   Order ID: ${orderData.nonce}`);
  console.log(`   Using test signature for demo (cross-chain addresses not supported in EIP-712)`);
  
  // Connect to order engine
  const socket = io(ORDER_ENGINE_URL);
  
  // Submit order with signature included
  const orderWithSig = { 
    ...orderData, 
    signature,
    partialFillAllowed: false 
  };
  
  console.log('\n📤 Submitting Order to Order Engine...');
  try {
    const response = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, orderWithSig);
    console.log(`   ✅ Order accepted: ${response.data.id}`);
    
    // Monitor for resolver activity
    console.log('\n⏳ Waiting for Resolver Response...');
    
    socket.on('escrow:destination:created', (data) => {
      console.log('\n🎯 Resolver Created Destination Escrow!');
      console.log(`   APT Amount: ${(parseInt(data.amount || '0') / 100000000).toFixed(4)} APT`);
      console.log(`   Secret Hash: ${data.secretHash}`);
      console.log(`   On Aptos Chain`);
      
      console.log('\n✅ Demo Complete!');
      console.log('\n📋 What Happened:');
      console.log('   1. User signed intent to swap 0.001 ETH for APT');
      console.log('   2. Order was submitted to order engine');
      console.log('   3. Resolver saw the order and calculated profitability');
      console.log('   4. Resolver would lock APT on Aptos (simulated)');
      console.log('   5. User would then lock ETH on Ethereum');
      console.log('   6. Atomic swap completes with secret reveal');
      
      socket.close();
      process.exit(0);
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      console.log('\n⚠️  Demo timeout reached');
      console.log('   Check logs for resolver activity');
      socket.close();
      process.exit(0);
    }, 10000);
    
  } catch (error) {
    console.error('   ❌ Error:', error.response?.data || error.message);
    socket.close();
  }
}

// Run demo
testEthAptSwapDemo().catch(console.error);