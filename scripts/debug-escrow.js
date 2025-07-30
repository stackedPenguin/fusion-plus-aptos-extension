const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const escrowAddress = '0x5D03520c42fca21159c66cA44E24f7B0c0C590d4';
  
  // Check if escrow already exists
  const escrowId = '0x645eb5a55a07b708304e49db5bc8596b2931eaed4dab4796ad2b199047feab28';
  
  const abi = [
    'function escrows(bytes32) view returns (address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, uint256 safetyDeposit)',
    'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable'
  ];
  
  const contract = new ethers.Contract(escrowAddress, abi, provider);
  
  try {
    const escrow = await contract.escrows(escrowId);
    console.log('Checking escrow ID:', escrowId);
    console.log('Escrow exists:', escrow.depositor !== ethers.ZeroAddress);
    console.log('Depositor:', escrow.depositor);
    
    if (escrow.depositor !== ethers.ZeroAddress) {
      console.log('Escrow details:');
      console.log('  Beneficiary:', escrow.beneficiary);
      console.log('  Token:', escrow.token);
      console.log('  Amount:', ethers.formatEther(escrow.amount));
      console.log('  Withdrawn:', escrow.withdrawn);
      console.log('  Refunded:', escrow.refunded);
    }
    
    // Try to simulate the transaction
    const resolverAddress = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
    const wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    const amount = '500000000000000';
    const hashlock = '0xd814f45c7be7eb8e3b9740728536f6463b3acbc33fb6f3576822c56a42f17e2a';
    const timelock = 1753906702;
    const safetyDeposit = ethers.parseEther('0.001');
    
    console.log('\nSimulating createEscrow transaction:');
    console.log('  From:', resolverAddress);
    console.log('  Safety deposit:', ethers.formatEther(safetyDeposit), 'ETH');
    
    // Check WETH balance and allowance
    const wethAbi = [
      'function balanceOf(address) view returns (uint256)',
      'function allowance(address owner, address spender) view returns (uint256)'
    ];
    const weth = new ethers.Contract(wethAddress, wethAbi, provider);
    
    const userAddress = '0x17061146a55f31BB85c7e211143581B44f2a03d0';
    const wethBalance = await weth.balanceOf(userAddress);
    const wethAllowance = await weth.allowance(userAddress, escrowAddress);
    
    console.log('\nWETH Status:');
    console.log('  User WETH balance:', ethers.formatEther(wethBalance));
    console.log('  User WETH allowance to escrow:', ethers.formatEther(wethAllowance));
    console.log('  Required amount:', ethers.formatEther(amount));
    console.log('  Has enough WETH:', wethBalance >= BigInt(amount));
    console.log('  Has enough allowance:', wethAllowance >= BigInt(amount));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);