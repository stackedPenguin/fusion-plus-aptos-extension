#!/usr/bin/env node

const { ethers } = require('ethers');
const dotenv = require('dotenv');

dotenv.config({ path: 'backend/resolver/.env' });

// EIP-712 domain
const DOMAIN = {
  name: 'FusionPlusGaslessEscrow',
  version: '1',
  chainId: 11155111, // Sepolia
  verifyingContract: '0x4868C055E894f6C774960a175aD11Dec26f8475f'
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

async function testGaslessWETH() {
  console.log('\n🧪 Testing Gasless WETH Escrow...\n');

  // Setup providers and wallets
  const provider = new ethers.JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia.publicnode.com'
  );
  
  // User wallet (only signs, doesn't pay gas)
  const userWallet = new ethers.Wallet(process.env.TEST_USER_PRIVATE_KEY || '', provider);
  console.log('👤 User address:', userWallet.address);
  
  // Resolver wallet (pays gas)
  const resolverWallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY || '', provider);
  console.log('🤖 Resolver address:', resolverWallet.address);
  
  // Check balances
  const userBalance = await provider.getBalance(userWallet.address);
  const resolverBalance = await provider.getBalance(resolverWallet.address);
  console.log('💰 User ETH balance:', ethers.formatEther(userBalance));
  console.log('💰 Resolver ETH balance:', ethers.formatEther(resolverBalance));
  
  // WETH contract
  const WETH_ADDRESS = process.env.WETH_ADDRESS || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
  ];
  const weth = new ethers.Contract(WETH_ADDRESS, wethAbi, provider);
  
  const userWethBalance = await weth.balanceOf(userWallet.address);
  console.log('💎 User WETH balance:', ethers.formatEther(userWethBalance));
  
  if (userWethBalance === 0n) {
    console.log('\n❌ User has no WETH. Please get some WETH first.');
    return;
  }
  
  // Gasless escrow contract
  const gaslessEscrowAddress = process.env.ETHEREUM_GASLESS_ESCROW_ADDRESS;
  if (!gaslessEscrowAddress) {
    console.log('\n❌ ETHEREUM_GASLESS_ESCROW_ADDRESS not set in .env');
    return;
  }
  
  const gaslessEscrowAbi = [
    'function getNonce(address user) view returns (uint256)',
    'function createEscrowWithMetaTx(tuple(bytes32 escrowId, address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, uint256 deadline) params, uint8 v, bytes32 r, bytes32 s) external payable',
    'function getEscrow(bytes32 _escrowId) external view returns (address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit)'
  ];
  
  const gaslessEscrow = new ethers.Contract(gaslessEscrowAddress, gaslessEscrowAbi, provider);
  
  // Get current nonce
  const nonce = await gaslessEscrow.getNonce(userWallet.address);
  console.log('📝 User nonce:', nonce.toString());
  
  // Check WETH allowance
  const allowance = await weth.allowance(userWallet.address, gaslessEscrowAddress);
  console.log('✅ WETH allowance to gasless escrow:', ethers.formatEther(allowance));
  
  if (allowance === 0n) {
    console.log('\n⚠️  User needs to approve WETH spending first (one-time)');
    console.log('Approving max uint256...');
    
    const approveTx = await weth.connect(userWallet).approve(gaslessEscrowAddress, ethers.MaxUint256);
    console.log('Approval tx:', approveTx.hash);
    await approveTx.wait();
    console.log('✅ Approval confirmed!');
  }
  
  // Create escrow parameters
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  const escrowId = ethers.id('test-gasless-' + Date.now());
  const amount = ethers.parseEther('0.01'); // 0.01 WETH
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const timelock = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
  
  const escrowParams = {
    escrowId: escrowId,
    depositor: userWallet.address,
    beneficiary: resolverWallet.address,
    token: WETH_ADDRESS,
    amount: amount,
    hashlock: secretHash,
    timelock: timelock,
    nonce: nonce,
    deadline: deadline
  };
  
  console.log('\n📋 Escrow parameters:');
  console.log('  Escrow ID:', escrowId);
  console.log('  Amount:', ethers.formatEther(amount), 'WETH');
  console.log('  Secret hash:', secretHash);
  console.log('  Timelock:', new Date(timelock * 1000).toLocaleString());
  
  // Sign the meta-transaction (user signs, no gas)
  console.log('\n🖊️  User signing meta-transaction (no gas)...');
  
  const signature = await userWallet.signTypedData(DOMAIN, TYPES, escrowParams);
  const sig = ethers.Signature.from(signature);
  
  console.log('✅ Signature obtained!');
  console.log('  v:', sig.v);
  console.log('  r:', sig.r);
  console.log('  s:', sig.s);
  
  // Resolver executes the transaction (pays gas)
  console.log('\n🚀 Resolver executing gasless escrow creation...');
  
  const gaslessEscrowWithResolver = gaslessEscrow.connect(resolverWallet);
  const safetyDeposit = ethers.parseEther('0.001');
  
  try {
    const tx = await gaslessEscrowWithResolver.createEscrowWithMetaTx(
      escrowParams,
      sig.v,
      sig.r,
      sig.s,
      { value: safetyDeposit }
    );
    
    console.log('📤 Transaction sent:', tx.hash);
    console.log('⏳ Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Escrow created!');
    console.log('  Gas used:', receipt.gasUsed.toString());
    console.log('  Gas paid by resolver:', ethers.formatEther(receipt.gasUsed * receipt.gasPrice), 'ETH');
    
    // Verify escrow was created
    const escrowData = await gaslessEscrow.getEscrow(escrowId);
    console.log('\n📦 Escrow details:');
    console.log('  Depositor:', escrowData.depositor);
    console.log('  Beneficiary:', escrowData.beneficiary);
    console.log('  Amount:', ethers.formatEther(escrowData.amount), 'WETH');
    console.log('  Safety deposit:', ethers.formatEther(escrowData.safetyDeposit), 'ETH');
    
    console.log('\n🎉 Success! User\'s WETH is locked without paying any gas!');
    console.log('💡 The resolver paid all gas fees for the transaction.');
    
  } catch (error) {
    console.error('\n❌ Transaction failed:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
  }
}

testGaslessWETH().catch(console.error);