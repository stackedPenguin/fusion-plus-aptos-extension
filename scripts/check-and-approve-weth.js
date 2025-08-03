const { ethers } = require('ethers');
require('dotenv').config({ path: '../backend/resolver/.env' });

async function checkAndApproveWETH() {
  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
  const signer = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY, provider);
  
  const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
  const OLD_ESCROW = '0x5Ea57C2Fb5f054E9bdBdb3449135f823439E1338';
  const NEW_ESCROW = '0x33dF80f370D487d73A97c83B5147F1D7aEC8FF53';
  
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
  ];
  
  const wethContract = new ethers.Contract(WETH_ADDRESS, wethAbi, signer);
  
  console.log('🔍 Checking WETH status for resolver:', signer.address);
  console.log('================================================');
  
  // Check balance
  const balance = await wethContract.balanceOf(signer.address);
  console.log('💰 WETH Balance:', ethers.formatEther(balance), 'WETH');
  
  // Check allowances
  const oldAllowance = await wethContract.allowance(signer.address, OLD_ESCROW);
  const newAllowance = await wethContract.allowance(signer.address, NEW_ESCROW);
  
  console.log('\n📋 Allowances:');
  console.log('  Old Escrow:', ethers.formatEther(oldAllowance), 'WETH');
  console.log('  New Escrow:', ethers.formatEther(newAllowance), 'WETH');
  
  // If new escrow has no allowance, approve it
  if (newAllowance === 0n) {
    console.log('\n⚠️  New escrow contract needs WETH approval!');
    console.log('🔐 Approving max WETH to new escrow contract...');
    
    try {
      const tx = await wethContract.approve(NEW_ESCROW, ethers.MaxUint256);
      console.log('📤 Transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('✅ Approval confirmed in block:', receipt.blockNumber);
      
      // Verify new allowance
      const updatedAllowance = await wethContract.allowance(signer.address, NEW_ESCROW);
      console.log('✅ New allowance:', ethers.formatEther(updatedAllowance), 'WETH');
    } catch (error) {
      console.error('❌ Approval failed:', error.message);
    }
  } else {
    console.log('\n✅ New escrow already has WETH approval');
  }
  
  // Also check ETH balance for gas
  const ethBalance = await provider.getBalance(signer.address);
  console.log('\n⛽ ETH Balance (for gas):', ethers.formatEther(ethBalance), 'ETH');
}

checkAndApproveWETH().catch(console.error);