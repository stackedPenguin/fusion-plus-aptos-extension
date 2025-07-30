const { ethers } = require('ethers');
const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ORDER_ENGINE_URL = 'http://localhost:3001';
const ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';

// Test wallets
const USER_PRIVATE_KEY = '0x4479B0150248772B44B63817c11c589a25957e85'; // User with funded wallet
const USER_ADDRESS = '0x4479B0150248772B44B63817c11c589a25957e85';

// Escrow ABI (minimal for demo)
const ESCROW_ABI = [
  'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable',
  'function withdraw(bytes32 _escrowId, bytes32 _secret)',
  'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, uint256 amount, bytes32 hashlock, uint256 timelock)',
  'event EscrowWithdrawn(bytes32 indexed escrowId, bytes32 secret)'
];

async function testCrossChainWithRates() {
  console.log('🌐 Testing Cross-Chain Swap with Exchange Rates');
  console.log('═'.repeat(80));
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  const userWallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, userWallet);
  
  // Connect to order engine WebSocket
  const socket = io(ORDER_ENGINE_URL);
  
  // Check initial balances
  const ethBalance = await provider.getBalance(userWallet.address);
  console.log(`\n📊 Initial Balances:`);
  console.log(`   User ETH: ${ethers.formatEther(ethBalance)} ETH`);
  console.log(`   User APT: 0 APT (on Aptos testnet)`);
  
  // Get current exchange rates
  console.log('\n💱 Fetching Exchange Rates...');
  let exchangeRate = 500; // Default fallback
  try {
    const rateResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,aptos&vs_currencies=usd');
    const ethPrice = rateResponse.data.ethereum?.usd || 3000;
    const aptPrice = rateResponse.data.aptos?.usd || 6;
    exchangeRate = ethPrice / aptPrice;
    
    console.log(`   ETH Price: $${ethPrice.toFixed(2)}`);
    console.log(`   APT Price: $${aptPrice.toFixed(2)}`);
    console.log(`   Exchange Rate: 1 ETH = ${exchangeRate.toFixed(2)} APT`);
  } catch (error) {
    console.log('   Using fallback rate: 1 ETH = 500 APT');
  }
  
  // Calculate expected output
  const inputAmount = 0.001; // ETH
  const resolverFee = 0.01; // 1%
  const expectedOutput = inputAmount * exchangeRate * (1 - resolverFee);
  
  console.log(`\n📈 Swap Calculation:`);
  console.log(`   Input: ${inputAmount} ETH`);
  console.log(`   Exchange Rate: ${exchangeRate.toFixed(2)} APT/ETH`);
  console.log(`   Resolver Fee: ${(resolverFee * 100).toFixed(1)}%`);
  console.log(`   Expected Output: ${expectedOutput.toFixed(4)} APT`);
  
  // Create swap order
  const order = {
    fromChain: 'ETHEREUM',
    toChain: 'APTOS',
    fromToken: ethers.ZeroAddress, // ETH
    toToken: '0x1::aptos_coin::AptosCoin', // APT
    fromAmount: ethers.parseEther(inputAmount.toString()).toString(),
    minToAmount: Math.floor(expectedOutput * 0.95 * 100000000).toString(), // 95% of expected, APT has 8 decimals
    maker: userWallet.address,
    receiver: '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532', // Aptos address
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: Date.now().toString()
  };
  
  console.log('\n📝 Creating Swap Order:');
  console.log(`   From: ${inputAmount} ETH @ ${userWallet.address.slice(0, 10)}...`);
  console.log(`   To: ~${expectedOutput.toFixed(4)} APT @ 0x2d61a25d...`);
  console.log(`   Min Output: ${(parseInt(order.minToAmount) / 100000000).toFixed(4)} APT`);
  
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
      { name: 'minToAmount', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'receiver', type: 'string' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'string' }
    ]
  };
  
  const signature = await userWallet.signTypedData(domain, types, order);
  
  // Set up WebSocket listeners
  let destinationEscrowCreated = false;
  let escrowDetails = null;
  
  socket.on('escrow:destination:created', (data) => {
    if (data.orderId === order.id) {
      console.log('\n🎯 Destination Escrow Created on Aptos!');
      console.log(`   Escrow ID: ${data.escrowId}`);
      console.log(`   Amount: ${(parseInt(data.amount) / 100000000).toFixed(4)} APT`);
      console.log(`   Secret Hash: ${data.secretHash}`);
      destinationEscrowCreated = true;
      escrowDetails = data;
    }
  });
  
  try {
    // Submit order
    console.log('\n📤 Submitting order to order engine...');
    const response = await axios.post(`${ORDER_ENGINE_URL}/orders`, {
      order,
      signature
    });
    
    const createdOrder = response.data;
    order.id = createdOrder.id;
    console.log(`   ✅ Order created: ${createdOrder.id}`);
    
    // Wait for resolver to create destination escrow
    console.log('\n⏳ Waiting for resolver to lock APT on Aptos...');
    
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (destinationEscrowCreated) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 30000);
    });
    
    if (!destinationEscrowCreated) {
      console.log('\n⚠️  Resolver did not create destination escrow');
      console.log('   Make sure resolver service is running');
      socket.close();
      return;
    }
    
    // Create source escrow on Ethereum
    console.log('\n🔐 Creating Source Escrow on Ethereum...');
    console.log(`   Locking ${inputAmount} ETH for resolver...`);
    
    const escrowId = ethers.id(order.id + '-source');
    const amount = ethers.parseEther(inputAmount.toString());
    const safetyDeposit = ethers.parseEther('0.0001');
    const totalValue = amount + safetyDeposit;
    
    const createTx = await escrowContract.createEscrow(
      escrowId,
      '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc', // Resolver address
      ethers.ZeroAddress, // ETH
      amount,
      escrowDetails.secretHash,
      escrowDetails.timelock,
      { value: totalValue }
    );
    
    console.log(`   Transaction: ${createTx.hash}`);
    const receipt = await createTx.wait();
    console.log(`   ✅ Source escrow created!`);
    
    // Monitor for withdrawal
    console.log('\n⏳ Waiting for resolver to withdraw and reveal secret...');
    
    const filter = escrowContract.filters.EscrowWithdrawn(escrowId);
    const withdrawEvent = await new Promise((resolve) => {
      escrowContract.once(filter, (escrowId, secret, event) => {
        resolve({ escrowId, secret, event });
      });
      
      // Timeout after 60 seconds
      setTimeout(() => resolve(null), 60000);
    });
    
    if (withdrawEvent) {
      console.log('\n🎉 Secret Revealed!');
      console.log(`   Secret: ${withdrawEvent.secret}`);
      console.log(`   Transaction: ${withdrawEvent.event.log.transactionHash}`);
      
      // Check final balances
      const finalEthBalance = await provider.getBalance(userWallet.address);
      const ethSpent = ethers.formatEther(ethBalance - finalEthBalance);
      
      console.log('\n📊 Final Balance Summary:');
      console.log('   Ethereum:');
      console.log(`     User ETH: ${ethers.formatEther(finalEthBalance)} ETH (-${ethSpent} ETH)`);
      console.log('   Aptos (pending):');
      console.log(`     User APT: ${expectedOutput.toFixed(4)} APT (claimable with secret)`);
      
      console.log('\n✅ Cross-Chain Swap Complete!');
      console.log('   Next: Use revealed secret to claim APT on Aptos');
      console.log('   LayerZero will propagate the secret cross-chain');
    } else {
      console.log('\n⚠️  Timeout waiting for withdrawal');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  } finally {
    socket.close();
  }
}

// Check if services are running
async function checkServices() {
  console.log('🔍 Checking services...');
  
  const checks = [
    { name: 'Order Engine', url: `${ORDER_ENGINE_URL}/health` },
    { name: 'Resolver', check: async () => {
      // Check if resolver is connected to order engine
      const response = await axios.get(`${ORDER_ENGINE_URL}/resolvers`);
      return response.data.length > 0;
    }}
  ];
  
  let allOk = true;
  
  for (const check of checks) {
    try {
      if (check.url) {
        await axios.get(check.url);
      } else if (check.check) {
        const result = await check.check();
        if (!result) throw new Error('Check failed');
      }
      console.log(`   ✅ ${check.name} is running`);
    } catch (error) {
      console.log(`   ❌ ${check.name} is not running`);
      allOk = false;
    }
  }
  
  return allOk;
}

// Main
async function main() {
  const servicesOk = await checkServices();
  if (!servicesOk) {
    console.log('\n⚠️  Please start all required services:');
    console.log('   cd backend/order-engine && npm run dev');
    console.log('   cd backend/resolver && npm run dev');
    return;
  }
  
  await testCrossChainWithRates();
}

main().catch(console.error);