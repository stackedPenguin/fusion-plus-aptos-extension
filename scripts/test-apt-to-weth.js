const { ethers } = require('ethers');
const { AptosClient, AptosAccount, HexString } = require('aptos');
const axios = require('axios');
const io = require('socket.io-client');
require('dotenv').config({ path: '../backend/resolver/.env' });

// Configuration
const ORDER_ENGINE_URL = 'http://localhost:3001';
const ETHEREUM_RPC = process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const APTOS_NODE = process.env.APTOS_NODE_URL || 'https://fullnode.testnet.aptoslabs.com';

// Test wallet configuration - use the user's funded wallet
const TEST_ETH_PRIVATE_KEY = process.env.TEST_ETH_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_APTOS_PRIVATE_KEY = process.env.APTOS_PRIVATE_KEY || 'ed25519-priv-0xc5338cd251c22daa8c9c9cc94f498cc8a5c7e1d2e75287a5dda91096fe64efa5de8a9d4ff6f8a8d1ae2fe8b1f663e8b8d2146ca066f440fa0d8f55dd2adc7126';

// Contract addresses
const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const APTOS_ESCROW_MODULE = process.env.APTOS_ESCROW_MODULE || '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setupWallets() {
  console.log('\n🔧 Setting up test wallets...');
  
  // Ethereum wallet
  const ethProvider = new ethers.JsonRpcProvider(ETHEREUM_RPC);
  const ethWallet = new ethers.Wallet(TEST_ETH_PRIVATE_KEY, ethProvider);
  console.log('   ETH Wallet:', ethWallet.address);
  
  // Aptos wallet
  let aptosPrivateKey = TEST_APTOS_PRIVATE_KEY;
  if (aptosPrivateKey.startsWith('ed25519-priv-')) {
    aptosPrivateKey = aptosPrivateKey.replace('ed25519-priv-', '');
  }
  if (aptosPrivateKey.startsWith('0x')) {
    aptosPrivateKey = aptosPrivateKey.substring(2);
  }
  
  const aptosAccount = new AptosAccount(new HexString(aptosPrivateKey).toUint8Array());
  const aptosClient = new AptosClient(APTOS_NODE);
  console.log('   APT Wallet:', aptosAccount.address().hex());
  
  return { ethWallet, ethProvider, aptosAccount, aptosClient };
}

async function checkBalances(ethWallet, ethProvider, aptosAccount, aptosClient) {
  console.log('\n💰 Checking balances...');
  
  // ETH balance
  const ethBalance = await ethProvider.getBalance(ethWallet.address);
  console.log('   ETH Balance:', ethers.formatEther(ethBalance));
  
  // WETH balance
  const wethAbi = ['function balanceOf(address) view returns (uint256)'];
  const wethContract = new ethers.Contract(WETH_ADDRESS, wethAbi, ethProvider);
  const wethBalance = await wethContract.balanceOf(ethWallet.address);
  console.log('   WETH Balance:', ethers.formatEther(wethBalance));
  
  // APT balance using view function
  let aptBalance = 0;
  try {
    const viewUrl = 'https://fullnode.testnet.aptoslabs.com/v1/view';
    const payload = {
      function: "0x1::coin::balance",
      type_arguments: ["0x1::aptos_coin::AptosCoin"],
      arguments: [aptosAccount.address().hex()]
    };
    
    const response = await axios.post(viewUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 200) {
      aptBalance = parseInt(response.data[0]);
    }
    console.log('   APT Balance:', aptBalance / 100000000);
  } catch (error) {
    console.log('   APT Balance: 0 (error fetching)');
  }
  
  return { ethBalance, wethBalance, aptBalance };
}

async function createOrder(aptosAccount, ethWallet) {
  console.log('\n📝 Creating APT to WETH order...');
  
  const fromAmount = '20000000'; // 0.2 APT
  const minToAmount = '200000000000000'; // 0.0002 WETH (rough estimate)
  const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
  const nonce = Date.now().toString();
  
  const order = {
    fromChain: 'APTOS',
    toChain: 'ETHEREUM',
    fromToken: '0x1::aptos_coin::AptosCoin',
    toToken: WETH_ADDRESS,
    fromAmount,
    minToAmount,
    maker: aptosAccount.address().hex(),
    receiver: ethWallet.address,
    deadline,
    nonce,
    partialFillAllowed: false,
    signature: '0x00' // Will be replaced with actual signature
  };
  
  console.log('   Order details:', {
    from: `${fromAmount / 100000000} APT`,
    to: `>= ${ethers.formatEther(minToAmount)} WETH`,
    maker: order.maker,
    receiver: order.receiver
  });
  
  return order;
}

async function signAptosOrder(aptosAccount, orderMessage) {
  console.log('\n✍️  Signing order message...');
  
  // Create the message string (matching frontend format)
  const messageString = `Fusion+ Swap Order:
From: ${(parseInt(orderMessage.amount) / 100000000).toFixed(4)} APT
To: ${orderMessage.amount} WETH
Beneficiary: ${orderMessage.beneficiary}
Order ID: ${orderMessage.escrow_id}
Nonce: ${orderMessage.nonce}
Expires: ${new Date(orderMessage.expiry * 1000).toLocaleString()}`;
  
  const fullMessage = `APTOS
message: ${messageString}
nonce: ${orderMessage.nonce}`;
  
  // Sign the message
  const messageBytes = new TextEncoder().encode(fullMessage);
  const signature = aptosAccount.signBuffer(messageBytes);
  
  console.log('   Signature:', signature.hex());
  console.log('   Public key:', aptosAccount.pubKey().hex());
  
  return {
    signature: signature.hex(),
    publicKey: aptosAccount.pubKey().hex(),
    fullMessage
  };
}

async function submitOrder(order, socket) {
  return new Promise((resolve, reject) => {
    console.log('\n🚀 Submitting order to order engine...');
    
    // Listen for all events for debugging
    socket.onAny((eventName, ...args) => {
      console.log(`   📡 Event: ${eventName}`);
    });
    
    // Set up event listeners before emitting
    const timeout = setTimeout(() => {
      reject(new Error('Order submission timeout'));
    }, 60000); // 60 second timeout
    
    let orderId;
    let destinationEscrowCreated = false;
    let sourceEscrowNeeded = false;
    
    socket.on('order:created', (data) => {
      console.log('   ✅ Order created:', data.orderId);
      orderId = data.orderId;
    });
    
    socket.on('order:new', (data) => {
      console.log('   📋 Order broadcast received');
      if (!orderId && data.id) {
        orderId = data.id;
      }
    });
    
    socket.on('escrow:destination:created', (data) => {
      console.log('   🔔 Destination escrow event:', data);
      if (!orderId || data.orderId === orderId) {
        console.log('   ✅ Destination escrow created on Ethereum');
        console.log('      Escrow ID:', data.escrowId);
        console.log('      Amount:', ethers.formatEther(data.amount || '0'), 'WETH');
        destinationEscrowCreated = true;
        sourceEscrowNeeded = true;
        
        // For APT to WETH, we need to sign after destination escrow
        clearTimeout(timeout);
        resolve({
          orderId: data.orderId || orderId,
          secretHash: data.secretHash,
          timelock: data.timelock,
          destinationEscrowId: data.escrowId
        });
      }
    });
    
    socket.on('escrow:source:needed', (data) => {
      console.log('   ⏳ Source escrow needed event');
      if (!orderId || data.orderId === orderId) {
        console.log('   ⏳ Source escrow needed on Aptos');
        sourceEscrowNeeded = true;
        
        // Return the order data needed for signing
        clearTimeout(timeout);
        resolve({
          orderId: data.orderId || orderId,
          secretHash: data.secretHash,
          timelock: data.timelock,
          destinationEscrowId: data.escrowId
        });
      }
    });
    
    socket.on('error', (error) => {
      console.error('   ❌ Socket error:', error);
      clearTimeout(timeout);
      reject(error);
    });
    
    // Emit the order
    socket.emit('order:new', order);
  });
}

async function createSignedOrder(aptosAccount, orderData, orderId) {
  console.log('\n🔏 Creating signed order for gasless escrow...');
  
  // Create the order message matching the Move struct
  const orderMessage = {
    escrow_id: Array.from(ethers.randomBytes(32)),
    depositor: aptosAccount.address().hex(),
    beneficiary: APTOS_ESCROW_MODULE, // Resolver address
    amount: '20000000', // 0.2 APT
    hashlock: Array.from(ethers.getBytes(orderData.secretHash)),
    timelock: orderData.timelock,
    nonce: Date.now(),
    expiry: Math.floor(Date.now() / 1000) + 300 // 5 minute expiry
  };
  
  // Sign the order
  const { signature, publicKey, fullMessage } = await signAptosOrder(aptosAccount, orderMessage);
  
  return {
    orderId,
    orderMessage,
    signature,
    publicKey,
    fullMessage,
    fromChain: 'APTOS',
    toChain: 'ETHEREUM',
    fromAmount: orderMessage.amount,
    toAmount: '200000000000000', // Expected WETH amount
    secretHash: orderData.secretHash
  };
}

async function monitorSwapCompletion(socket, orderId) {
  return new Promise((resolve, reject) => {
    console.log('\n⏳ Monitoring swap completion...');
    
    const timeout = setTimeout(() => {
      reject(new Error('Swap completion timeout'));
    }, 300000); // 5 minute timeout
    
    let sourceEscrowCreated = false;
    let secretRevealed = false;
    let swapCompleted = false;
    
    socket.on('escrow:source:created', (data) => {
      if (data.orderId === orderId) {
        console.log('   ✅ Source escrow created on Aptos');
        console.log('      Transaction:', data.txHash);
        sourceEscrowCreated = true;
      }
    });
    
    socket.on('escrow:secret:revealed', (data) => {
      if (data.orderId === orderId) {
        console.log('   🔓 Secret revealed by resolver');
        console.log('      Chain:', data.chain);
        secretRevealed = true;
      }
    });
    
    socket.on('swap:completed', (data) => {
      if (data.orderId === orderId) {
        console.log('   🎉 Swap completed successfully!');
        swapCompleted = true;
        clearTimeout(timeout);
        resolve(data);
      }
    });
    
    socket.on('fill:statusUpdate', (data) => {
      if (data.orderId === orderId) {
        console.log(`   📊 Fill status: ${data.status}`);
        if (data.error) {
          console.error('   ❌ Error:', data.error);
        }
      }
    });
    
    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function main() {
  try {
    console.log('🚀 Starting APT to WETH end-to-end test...');
    
    // Setup wallets
    const { ethWallet, ethProvider, aptosAccount, aptosClient } = await setupWallets();
    
    // Check initial balances
    const initialBalances = await checkBalances(ethWallet, ethProvider, aptosAccount, aptosClient);
    
    // Check if we have sufficient APT balance
    if (!initialBalances.aptBalance || initialBalances.aptBalance < 20000000) {
      console.error('\n❌ Insufficient APT balance for test');
      console.error(`   Required: 0.2 APT`);
      console.error(`   Available: ${(initialBalances.aptBalance || 0) / 100000000} APT`);
      console.error(`   Please fund the test wallet: ${aptosAccount.address().hex()}`);
      process.exit(1);
    }
    
    // Connect to order engine
    console.log('\n🔌 Connecting to order engine...');
    const socket = io(ORDER_ENGINE_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        console.log('   ✅ Connected to order engine');
        resolve();
      });
      
      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection error: ${error.message}`));
      });
    });
    
    // Create and submit order
    const order = await createOrder(aptosAccount, ethWallet);
    const orderData = await submitOrder(order, socket);
    
    // Create signed order for gasless escrow
    const signedOrder = await createSignedOrder(aptosAccount, orderData, orderData.orderId);
    
    // Emit signed order
    console.log('\n📤 Sending signed order for gasless escrow creation...');
    socket.emit('order:signed', signedOrder);
    
    // Monitor for completion
    await monitorSwapCompletion(socket, orderData.orderId);
    
    // Check final balances
    console.log('\n🏁 Checking final balances...');
    await sleep(5000); // Wait for transactions to settle
    const finalBalances = await checkBalances(ethWallet, ethProvider, aptosAccount, aptosClient);
    
    // Calculate differences
    console.log('\n📊 Balance changes:');
    const aptBefore = initialBalances.aptBalance || 0;
    const aptAfter = finalBalances.aptBalance || 0;
    console.log(`   APT: ${aptBefore / 100000000} → ${aptAfter / 100000000} (${(aptAfter - aptBefore) / 100000000})`);
    console.log(`   WETH: ${ethers.formatEther(initialBalances.wethBalance)} → ${ethers.formatEther(finalBalances.wethBalance)} (+${ethers.formatEther(finalBalances.wethBalance - initialBalances.wethBalance)})`);
    
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
main();