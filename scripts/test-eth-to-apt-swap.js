const { ethers } = require('ethers');
const axios = require('axios');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ORDER_ENGINE_URL = 'http://localhost:3001';

// Test wallets
const USER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // Test 2
const USER_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

async function testEthToAptSwap() {
  console.log('🚀 Testing ETH → APT Cross-Chain Swap');
  console.log('═'.repeat(80));
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  const userWallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
  
  // Check user balance
  const balance = await provider.getBalance(userWallet.address);
  console.log(`\n📋 User Wallet: ${userWallet.address}`);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther('0.002')) {
    console.log('\n⚠️  Insufficient balance for test (need at least 0.002 ETH)');
    return;
  }
  
  // Create swap order
  const order = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress, // ETH
    toToken: '0x1::aptos_coin::AptosCoin', // APT
    fromAmount: ethers.parseEther('0.001').toString(),
    maker: userWallet.address,
    receiver: '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532', // Aptos address
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString()
  };
  
  console.log('\n📝 Creating Cross-Chain Swap Order:');
  console.log(`   From: 0.001 ETH (Ethereum)`);
  console.log(`   To: APT (Aptos)`);
  console.log(`   Exchange Rate: Will be determined by resolver`);
  
  // Create EIP-712 signature
  const domain = {
    name: 'FusionPlus',
    version: '1',
    chainId: 11155111, // Sepolia
    verifyingContract: ethers.ZeroAddress
  };
  
  const types = {
    Order: [
      { name: 'fromChain', type: 'string' },
      { name: 'toChain', type: 'string' },
      { name: 'fromToken', type: 'address' },
      { name: 'toToken', type: 'string' },
      { name: 'fromAmount', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'receiver', type: 'string' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'string' }
    ]
  };
  
  const signature = await userWallet.signTypedData(domain, types, order);
  
  try {
    // Submit order to order engine
    console.log('\n📤 Submitting order to order engine...');
    const response = await axios.post(`${ORDER_ENGINE_URL}/orders`, {
      order,
      signature
    });
    
    const createdOrder = response.data;
    console.log(`   ✅ Order created: ${createdOrder.id}`);
    
    // Get exchange rate info
    console.log('\n💱 Exchange Rate Information:');
    try {
      const rateResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,aptos&vs_currencies=usd');
      const ethPrice = rateResponse.data.ethereum?.usd || 3000;
      const aptPrice = rateResponse.data.aptos?.usd || 6;
      const exchangeRate = ethPrice / aptPrice;
      
      console.log(`   ETH Price: $${ethPrice}`);
      console.log(`   APT Price: $${aptPrice}`);
      console.log(`   Exchange Rate: 1 ETH = ${exchangeRate.toFixed(2)} APT`);
      console.log(`   Expected Output: ~${(0.001 * exchangeRate * 0.99).toFixed(2)} APT (with 1% resolver fee)`);
    } catch (error) {
      console.log('   Using fallback rate: 1 ETH = 500 APT');
      console.log('   Expected Output: ~0.495 APT (with 1% resolver fee)');
    }
    
    // Monitor order status
    console.log('\n⏳ Monitoring order status...');
    console.log('   Waiting for resolver to pick up order...');
    
    let attempts = 0;
    const checkInterval = setInterval(async () => {
      try {
        const statusResponse = await axios.get(`${ORDER_ENGINE_URL}/orders/${createdOrder.id}`);
        const orderStatus = statusResponse.data;
        
        console.log(`   Status: ${orderStatus.status}`);
        
        if (orderStatus.fills && orderStatus.fills.length > 0) {
          console.log('\n✅ Order being filled by resolver!');
          const fill = orderStatus.fills[0];
          console.log(`   Resolver: ${fill.resolver}`);
          console.log(`   Output Amount: ${(parseInt(fill.amount) / 100000000).toFixed(4)} APT`);
          console.log(`   Secret Hash: ${fill.secretHash}`);
          
          if (fill.destinationEscrowId) {
            console.log(`   Destination Escrow: ${fill.destinationEscrowId}`);
            console.log('\n📋 Next Steps:');
            console.log('   1. Resolver has locked APT on Aptos for you');
            console.log('   2. You need to create ETH escrow on Ethereum');
            console.log('   3. Resolver will reveal secret to claim ETH');
            console.log('   4. Secret will be sent to Aptos via LayerZero');
            console.log('   5. You can claim APT using the revealed secret');
          }
          
          clearInterval(checkInterval);
        }
        
        attempts++;
        if (attempts > 20) {
          console.log('\n⚠️  No resolver picked up order yet');
          console.log('   Make sure resolver service is running');
          clearInterval(checkInterval);
        }
      } catch (error) {
        console.error('   Error checking status:', error.message);
      }
    }, 3000);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  }
}

// Check if services are running
async function checkServices() {
  console.log('🔍 Checking services...');
  
  try {
    await axios.get(`${ORDER_ENGINE_URL}/health`);
    console.log('   ✅ Order engine is running');
    return true;
  } catch (error) {
    console.log('   ❌ Order engine is not running');
    console.log('   Run: cd backend/order-engine && npm run dev');
    return false;
  }
}

// Main
async function main() {
  const servicesOk = await checkServices();
  if (!servicesOk) {
    console.log('\n⚠️  Please start the required services first');
    return;
  }
  
  await testEthToAptSwap();
}

main().catch(console.error);