const { ethers } = require('ethers');
const axios = require('axios');

// Configuration
const ETH_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ESCROW_ADDRESS = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
const USER_ADDRESS = '0x8F90dE323b5E77EB1dDa97410110d2B27892AECF';
const RESOLVER_ADDRESS = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';

// Use the funded user private key from our deployment
const TEST_PRIVATE_KEY = process.env.ETHEREUM_PRIVATE_KEY || '0x...';

async function testEthereumEscrow() {
  console.log('🧪 Testing Ethereum Escrow Contract');
  console.log('═'.repeat(60));
  
  const provider = new ethers.JsonRpcProvider(ETH_RPC);
  const wallet = new ethers.Wallet(TEST_PRIVATE_KEY, provider);
  
  console.log(`Test wallet: ${wallet.address}`);
  
  // Get initial balances
  const userBalanceBefore = await provider.getBalance(USER_ADDRESS);
  const resolverBalanceBefore = await provider.getBalance(RESOLVER_ADDRESS);
  const escrowBalanceBefore = await provider.getBalance(ESCROW_ADDRESS);
  const testWalletBalance = await provider.getBalance(wallet.address);
  
  console.log('\nInitial Balances:');
  console.log(`  User:     ${ethers.formatEther(userBalanceBefore)} ETH`);
  console.log(`  Resolver: ${ethers.formatEther(resolverBalanceBefore)} ETH`);
  console.log(`  Escrow:   ${ethers.formatEther(escrowBalanceBefore)} ETH`);
  console.log(`  Test:     ${ethers.formatEther(testWalletBalance)} ETH`);
  
  if (testWalletBalance < ethers.parseEther('0.01')) {
    console.log('\n❌ Test wallet needs at least 0.01 ETH for testing');
    return;
  }
  
  // Create escrow
  console.log('\n📝 Creating Escrow...');
  
  const escrowAbi = [
    'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable',
    'function withdraw(bytes32 _escrowId, bytes32 _secret)',
    'function getEscrow(bytes32 _escrowId) view returns (address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit)',
    'event EscrowCreated(bytes32 indexed escrowId, address indexed depositor, address indexed beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock)',
    'event EscrowWithdrawn(bytes32 indexed escrowId, address indexed beneficiary, bytes32 secret)'
  ];
  
  const escrowContract = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, wallet);
  
  // Generate escrow parameters
  const escrowId = ethers.id('test-escrow-' + Date.now());
  const secret = ethers.randomBytes(32);
  const secretHash = ethers.keccak256(secret);
  const amount = ethers.parseEther('0.001');
  const safetyDeposit = ethers.parseEther('0.0001');
  const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  
  console.log(`  Escrow ID: ${escrowId}`);
  console.log(`  Secret: ${ethers.hexlify(secret)}`);
  console.log(`  Hash: ${secretHash}`);
  console.log(`  Amount: ${ethers.formatEther(amount)} ETH`);
  console.log(`  Safety Deposit: ${ethers.formatEther(safetyDeposit)} ETH`);
  
  // Create escrow transaction
  const createTx = await escrowContract.createEscrow(
    escrowId,
    RESOLVER_ADDRESS, // Beneficiary is resolver
    ethers.ZeroAddress, // ETH
    amount,
    secretHash,
    timelock,
    { value: amount + safetyDeposit }
  );
  
  console.log(`  Transaction: ${createTx.hash}`);
  const createReceipt = await createTx.wait();
  console.log(`  ✅ Escrow created in block ${createReceipt.blockNumber}`);
  
  // Check escrow details
  const escrowData = await escrowContract.getEscrow(escrowId);
  console.log('\n📦 Escrow Details:');
  console.log(`  Depositor: ${escrowData.depositor}`);
  console.log(`  Beneficiary: ${escrowData.beneficiary}`);
  console.log(`  Amount: ${ethers.formatEther(escrowData.amount)} ETH`);
  console.log(`  Withdrawn: ${escrowData.withdrawn}`);
  
  // Check balances after creation
  const escrowBalanceAfterCreate = await provider.getBalance(ESCROW_ADDRESS);
  console.log(`\n  Escrow balance after creation: ${ethers.formatEther(escrowBalanceAfterCreate)} ETH`);
  console.log(`  Change: +${ethers.formatEther(escrowBalanceAfterCreate - escrowBalanceBefore)} ETH`);
  
  // Withdraw from escrow
  console.log('\n🔓 Withdrawing from Escrow...');
  console.log(`  Using secret: ${ethers.hexlify(secret)}`);
  
  // Switch to resolver wallet for withdrawal
  const resolverWallet = new ethers.Wallet(process.env.RESOLVER_PRIVATE_KEY || TEST_PRIVATE_KEY, provider);
  const escrowContractAsResolver = escrowContract.connect(resolverWallet);
  
  const withdrawTx = await escrowContractAsResolver.withdraw(escrowId, secret);
  console.log(`  Transaction: ${withdrawTx.hash}`);
  const withdrawReceipt = await withdrawTx.wait();
  console.log(`  ✅ Withdrawn in block ${withdrawReceipt.blockNumber}`);
  
  // Check final balances
  const resolverBalanceAfter = await provider.getBalance(RESOLVER_ADDRESS);
  const escrowBalanceAfter = await provider.getBalance(ESCROW_ADDRESS);
  
  console.log('\nFinal Balances:');
  console.log(`  Resolver: ${ethers.formatEther(resolverBalanceAfter)} ETH`);
  console.log(`  Escrow:   ${ethers.formatEther(escrowBalanceAfter)} ETH`);
  
  console.log('\nBalance Changes:');
  console.log(`  Resolver: +${ethers.formatEther(resolverBalanceAfter - resolverBalanceBefore)} ETH`);
  console.log(`  Escrow:   ${ethers.formatEther(escrowBalanceAfter - escrowBalanceBefore)} ETH`);
  
  // Check events
  console.log('\n📋 Events:');
  const filter = escrowContract.filters.EscrowWithdrawn(escrowId);
  const events = await escrowContract.queryFilter(filter, withdrawReceipt.blockNumber);
  
  if (events.length > 0) {
    const event = events[0];
    console.log(`  EscrowWithdrawn event found!`);
    console.log(`  Secret revealed: ${event.args[2]}`);
  }
  
  console.log('\n✅ Test completed successfully!');
}

testEthereumEscrow().catch(console.error);