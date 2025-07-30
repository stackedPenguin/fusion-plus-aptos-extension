const axios = require('axios');
const { ethers } = require('ethers');
const io = require('socket.io-client');

// Configuration
const ORDER_ENGINE_URL = 'http://localhost:3001';
const ETHEREUM_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
const ETHEREUM_ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const APTOS_NODE_URL = 'https://fullnode.testnet.aptoslabs.com/v1';

// Test accounts
const MAKER_PRIVATE_KEY = '0x9aa575bac62c0966d497971a4504d8a5b68b198608120553d38da3bba8436efe';
const MAKER_ADDRESS = '0x4479B0150248772B44B63817c11c589a25957e85';
const APTOS_RECEIVER = '0x3cf8d46b8ad3e1be66c7d42dbcb3f5f0241d86015bd4d521e65ed8df1a97633b';

// Escrow ABI
const ESCROW_ABI = [
  'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable',
  'function withdraw(bytes32 _escrowId, bytes32 _secret)',
  'function getEscrow(bytes32 _escrowId) view returns (tuple(address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit))',
  'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)',
  'event EscrowWithdrawn(bytes32 indexed escrowId, bytes32 secret)'
];

async function checkAptosBalance(address) {
  try {
    const response = await axios.post(
      `${APTOS_NODE_URL}/view`,
      {
        function: '0x1::coin::balance',
        type_arguments: ['0x1::aptos_coin::AptosCoin'],
        arguments: [address]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    const balance = response.data[0] || 0;
    return (balance / 100000000).toFixed(8);
  } catch (error) {
    console.error('Error checking Aptos balance:', error.message);
    return '0';
  }
}

async function waitForEvent(eventName, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const socket = io(ORDER_ENGINE_URL);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeout);
    
    socket.on(eventName, (data) => {
      clearTimeout(timer);
      socket.close();
      resolve(data);
    });
  });
}

async function testAutomaticTransfer() {
  console.log('🚀 Testing Automatic Transfer Flow (ETH → APT)');
  console.log('═'.repeat(80));
  console.log('This test verifies that APT is automatically transferred to the user');
  console.log('without requiring manual claiming after the resolver reveals the secret.\n');
  
  try {
    // 1. Setup
    const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);
    const signer = new ethers.Wallet(MAKER_PRIVATE_KEY, provider);
    const escrowContract = new ethers.Contract(ETHEREUM_ESCROW_ADDRESS, ESCROW_ABI, signer);
    
    // 2. Check initial balances
    console.log('📊 Initial Balances:');
    const ethBalance = await provider.getBalance(MAKER_ADDRESS);
    console.log(`   ETH (maker): ${ethers.formatEther(ethBalance)} ETH`);
    
    const aptBalanceBefore = await checkAptosBalance(APTOS_RECEIVER);
    console.log(`   APT (receiver): ${aptBalanceBefore} APT`);
    
    // 3. Submit order
    const order = {
      fromChain: 'ETHEREUM',
      toChain: 'APTOS',
      fromToken: '0x0000000000000000000000000000000000000000',
      toToken: '0x1::aptos_coin::AptosCoin',
      fromAmount: '500000000000000', // 0.0005 ETH
      minToAmount: '41000000', // 0.41 APT
      maker: MAKER_ADDRESS,
      receiver: APTOS_RECEIVER,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      nonce: Date.now().toString(),
      partialFillAllowed: false,
      signature: '0x00' // Dev mode
    };
    
    console.log('\n📤 Submitting order...');
    console.log(`   From: ${parseFloat(order.fromAmount) / 1e18} ETH`);
    console.log(`   To: ${parseFloat(order.minToAmount) / 1e8} APT minimum`);
    console.log(`   Receiver: ${APTOS_RECEIVER}`);
    
    const response = await axios.post(`${ORDER_ENGINE_URL}/api/orders`, order);
    const orderId = response.data.data?.id;
    console.log(`   ✅ Order ID: ${orderId}`);
    
    // 4. Wait for destination escrow
    console.log('\n⏳ Waiting for resolver to create destination escrow...');
    const destEscrowEvent = await waitForEvent('escrow:destination:created');
    console.log('   ✅ Destination escrow created on Aptos');
    console.log(`   Escrow ID: ${destEscrowEvent.escrowId}`);
    
    // 5. Create source escrow
    console.log('\n💎 Creating source escrow on Ethereum...');
    const escrowId = destEscrowEvent.escrowId;
    const secretHash = destEscrowEvent.secretHash;
    const resolverAddress = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
    const timelock = Math.floor(Date.now() / 1000) + 1800;
    const safetyDeposit = ethers.parseEther('0.0001');
    const totalValue = BigInt(order.fromAmount) + safetyDeposit;
    
    const tx = await escrowContract.createEscrow(
      escrowId,
      resolverAddress,
      ethers.ZeroAddress,
      order.fromAmount,
      secretHash,
      timelock,
      { value: totalValue }
    );
    
    console.log(`   Transaction: ${tx.hash}`);
    await tx.wait();
    console.log('   ✅ Source escrow created');
    
    // 6. Wait for automatic transfer
    console.log('\n⏳ Waiting for automatic transfer to complete...');
    console.log('   The resolver will:');
    console.log('   1. Withdraw from Ethereum escrow (revealing secret)');
    console.log('   2. Automatically withdraw from Aptos escrow');
    console.log('   3. APT will be transferred directly to your wallet\n');
    
    // Wait for the resolver to process
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
    
    // 7. Check final balance
    console.log('📊 Checking final balance...');
    const aptBalanceAfter = await checkAptosBalance(APTOS_RECEIVER);
    console.log(`   APT (receiver): ${aptBalanceAfter} APT`);
    
    const aptReceived = parseFloat(aptBalanceAfter) - parseFloat(aptBalanceBefore);
    console.log(`   APT received: ${aptReceived.toFixed(8)} APT`);
    
    // 8. Summary
    console.log('\n✨ Transfer Summary:');
    console.log('═'.repeat(80));
    console.log(`   Sent: ${parseFloat(order.fromAmount) / 1e18} ETH`);
    console.log(`   Received: ${aptReceived.toFixed(8)} APT`);
    console.log(`   Exchange rate: 1 ETH = ${(aptReceived / (parseFloat(order.fromAmount) / 1e18)).toFixed(4)} APT`);
    
    if (aptReceived > 0) {
      console.log('\n🎉 SUCCESS! APT was automatically transferred to your wallet!');
      console.log('   No manual claiming was required - true Fusion+ experience! 🚀');
    } else {
      console.log('\n⚠️  No APT received yet. The resolver may still be processing...');
      console.log('   Check the resolver logs for details.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the test
testAutomaticTransfer().catch(console.error);