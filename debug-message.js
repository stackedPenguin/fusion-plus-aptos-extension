const { ethers } = require('ethers');

// Test the exact parameters from the latest transaction
const contractAddress = '0xF1c8A530fA525eDd5D906070C2127904B16962b4';
const userAddress = '0x17061146a55f31BB85c7e211143581B44f2a03d0';

// Latest transaction parameters
const params = {
  escrowId: '0xb0747cefd60c2437e0ca8b4c39a3c344819f87b42156f975eb3d2a2609a8c93f',
  depositor: '0x17061146a55f31BB85c7e211143581B44f2a03d0',
  beneficiary: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
  token: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  amount: '50000000000000',
  hashlock: '0x5fa28a58a4148a86ec66d80e76783f19b5f5bd0615e19454979e6d2214876873',
  timelock: '1754211409',
  deadline: '1754213238',
  nonce: '0'
};

const domain = {
  name: 'FusionPlusGaslessEscrowV2',
  version: '1',
  chainId: 11155111,
  verifyingContract: contractAddress
};

const types = {
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

console.log('=== TESTING DIFFERENT NONCE VALUES ===');

// Test with different nonce values since that might be the issue
for (let testNonce = 0; testNonce <= 3; testNonce++) {
  const testParams = { ...params, nonce: testNonce.toString() };
  
  // Create a test signature with a known private key
  const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testWallet = new ethers.Wallet(testPrivateKey);
  
  console.log('\\n--- Testing with nonce ' + testNonce + ' ---');
  console.log('Test wallet address:', testWallet.address);
  
  try {
    const testSignature = await testWallet.signTypedData(domain, types, testParams);
    const recoveredTest = ethers.verifyTypedData(domain, types, testParams, testSignature);
    console.log('Test signature recovers to:', recoveredTest);
    console.log('Test signature works:', recoveredTest === testWallet.address);
    
    // Now test if the actual signature from the transaction would work with this nonce
    const actualSignature = '0xe86062b3744bec8b8ba98f0119b73e5929c41ddaa99f76e78a1a8d6c13c54b1e44a10573cac89e9cc8e5001a05e70d4ac780a2072baef51db94ba83f67ac27c51c';
    const recoveredActual = ethers.verifyTypedData(domain, types, testParams, actualSignature);
    console.log('Actual signature recovers to:', recoveredActual);
    console.log('Matches user address:', recoveredActual.toLowerCase() === userAddress.toLowerCase());
    
  } catch (e) {
    console.error('Error with nonce', testNonce, ':', e.message);
  }
}

console.log('\\n=== TESTING WRONG FIELD ORDER ===');
// Test if the issue is field ordering
const wrongOrderTypes = {
  CreateEscrow: [
    { name: 'depositor', type: 'address' },
    { name: 'escrowId', type: 'bytes32' },
    { name: 'beneficiary', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'hashlock', type: 'bytes32' },
    { name: 'timelock', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

try {
  const actualSignature = '0xe86062b3744bec8b8ba98f0119b73e5929c41ddaa99f76e78a1a8d6c13c54b1e44a10573cac89e9cc8e5001a05e70d4ac780a2072baef51db94ba83f67ac27c51c';
  const recoveredWrongOrder = ethers.verifyTypedData(domain, wrongOrderTypes, params, actualSignature);
  console.log('With wrong field order, recovers to:', recoveredWrongOrder);
  console.log('Matches user with wrong order:', recoveredWrongOrder.toLowerCase() === userAddress.toLowerCase());
} catch (e) {
  console.error('Error with wrong field order:', e.message);
}

async function testContractTypeHash() {
  console.log('\\n=== CHECKING CONTRACT TYPEHASH ===');
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  try {
    // Check if we can get the typehash from the contract
    const contract = new ethers.Contract(contractAddress, [
      'function CREATE_ESCROW_TYPEHASH() view returns (bytes32)'
    ], provider);
    
    const contractTypeHash = await contract.CREATE_ESCROW_TYPEHASH();
    console.log('Contract CREATE_ESCROW_TYPEHASH:', contractTypeHash);
    
    // Compute what the typehash should be
    const expectedTypeHash = ethers.id('CreateEscrow(bytes32 escrowId,address depositor,address beneficiary,address token,uint256 amount,bytes32 hashlock,uint256 timelock,uint256 nonce,uint256 deadline)');
    console.log('Expected typehash:', expectedTypeHash);
    console.log('Typehashes match:', contractTypeHash === expectedTypeHash);
    
  } catch (e) {
    console.log('Could not get typehash from contract (method might not exist)');
  }
}

testContractTypeHash();