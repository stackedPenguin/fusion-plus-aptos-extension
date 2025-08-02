#!/usr/bin/env node

const { ethers } = require('ethers');

// Simulate a gasless WETH transaction
async function simulateGaslessWETH() {
  console.log('\n🧪 Simulating Gasless WETH Transaction...\n');

  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  
  // Contract addresses
  const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  const GASLESS_ESCROW_ADDRESS = '0x4868C055E894f6C774960a175aD11Dec26f8475f';
  
  // Create test wallets (not real funds needed for simulation)
  const userWallet = ethers.Wallet.createRandom().connect(provider);
  const resolverWallet = ethers.Wallet.createRandom().connect(provider);
  
  console.log('👤 Simulated user:', userWallet.address);
  console.log('🤖 Simulated resolver:', resolverWallet.address);
  
  // EIP-712 domain
  const DOMAIN = {
    name: 'FusionPlusGaslessEscrow',
    version: '1',
    chainId: 11155111,
    verifyingContract: GASLESS_ESCROW_ADDRESS
  };
  
  // EIP-712 types
  const TYPES = {
    CreateEscrow: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'depositor', type: 'address' },
      { name: 'beneficiary', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'hashlock', type: 'bytes32' },
      { name: 'timelock', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };
  
  // Create escrow parameters
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  const escrowId = ethers.id('simulated-gasless-' + Date.now());
  const amount = ethers.parseEther('0.1'); // 0.1 WETH
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const timelock = Math.floor(Date.now() / 1000) + 1800;
  
  const escrowParams = {
    escrowId: escrowId,
    depositor: userWallet.address,
    beneficiary: resolverWallet.address,
    token: WETH_ADDRESS,
    amount: amount,
    hashlock: secretHash,
    timelock: timelock,
    nonce: 0, // First transaction
    deadline: deadline
  };
  
  console.log('\n📋 Simulated escrow parameters:');
  console.log('  Amount:', ethers.formatEther(amount), 'WETH');
  console.log('  Secret hash:', secretHash);
  console.log('  Deadline:', new Date(deadline * 1000).toLocaleString());
  
  // Step 1: User signs meta-transaction (no gas)
  console.log('\n1️⃣ User signing meta-transaction (no gas required)...');
  
  try {
    const signature = await userWallet.signTypedData(DOMAIN, TYPES, escrowParams);
    const sig = ethers.Signature.from(signature);
    
    console.log('✅ Signature obtained!');
    console.log('  v:', sig.v);
    console.log('  r:', sig.r);
    console.log('  s:', sig.s);
    
    // Step 2: Prepare transaction data
    console.log('\n2️⃣ Preparing transaction for resolver...');
    
    const metaTxData = {
      params: escrowParams,
      signature: {
        v: sig.v,
        r: sig.r,
        s: sig.s
      }
    };
    
    console.log('✅ Transaction data prepared');
    console.log('  This data would be sent to the resolver');
    
    // Step 3: Estimate gas (what resolver would pay)
    console.log('\n3️⃣ Estimating gas costs...');
    
    const gaslessEscrowAbi = [
      'function createEscrowWithMetaTx(tuple(bytes32 escrowId, address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, uint256 deadline) params, uint8 v, bytes32 r, bytes32 s) external payable'
    ];
    
    const gaslessEscrow = new ethers.Contract(GASLESS_ESCROW_ADDRESS, gaslessEscrowAbi, provider);
    
    // Estimate gas (this would fail without funds, but shows the concept)
    try {
      const estimatedGas = await gaslessEscrow.estimateGas.createEscrowWithMetaTx(
        escrowParams,
        sig.v,
        sig.r,
        sig.s,
        { value: ethers.parseEther('0.001') } // Safety deposit
      );
      console.log('  Estimated gas:', estimatedGas.toString());
    } catch (error) {
      console.log('  Gas estimation would require actual WETH approval and balance');
    }
    
    console.log('\n✅ Simulation complete!');
    console.log('\n📊 Summary:');
    console.log('  • User signed a message (no gas paid)');
    console.log('  • Resolver would execute the transaction (pays gas)');
    console.log('  • User\'s WETH would be locked in escrow');
    console.log('  • This enables true gasless WETH to APT swaps!');
    
    console.log('\n💡 In production:');
    console.log('  1. User needs one-time WETH approval to gasless escrow');
    console.log('  2. After approval, all swaps are gasless');
    console.log('  3. Resolver handles all Ethereum transaction fees');
    
  } catch (error) {
    console.error('\n❌ Simulation error:', error.message);
  }
}

simulateGaslessWETH().catch(console.error);