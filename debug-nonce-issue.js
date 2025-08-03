const { ethers } = require('ethers');

async function debugNonceIssue() {
  console.log('🔍 DEBUGGING NONCE SYNCHRONIZATION ISSUE');
  console.log('=' .repeat(50));
  
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const contractAddress = '0x704EBa209E391FEBa4F1FCfdFdb852760D068d18';
  const userAddress = '0x17061146a55f31BB85c7e211143581B44f2a03d0';
  
  // Get current nonce from contract
  const contract = new ethers.Contract(contractAddress, [
    'function getNonce(address user) view returns (uint256)',
  ], provider);
  
  const currentNonce = await contract.getNonce(userAddress);
  console.log(`📊 Current contract nonce: ${currentNonce}`);
  
  // Check recent transactions to this contract from this user
  console.log('\n🔍 CHECKING RECENT TRANSACTION HISTORY:');
  
  const latestBlock = await provider.getBlockNumber();
  console.log(`📦 Latest block: ${latestBlock}`);
  
  let foundTxs = [];
  
  // Look through last 100 blocks for transactions from user to contract
  for (let i = 0; i < 100; i++) {
    const blockNumber = latestBlock - i;
    try {
      const block = await provider.getBlock(blockNumber, true);
      if (block && block.transactions) {
        const userTxs = block.transactions.filter(tx => 
          tx.from && tx.from.toLowerCase() === userAddress.toLowerCase() &&
          tx.to && tx.to.toLowerCase() === contractAddress.toLowerCase()
        );
        
        if (userTxs.length > 0) {
          for (const tx of userTxs) {
            try {
              const receipt = await provider.getTransactionReceipt(tx.hash);
              foundTxs.push({
                block: blockNumber,
                hash: tx.hash,
                status: receipt.status === 1 ? 'Success' : 'Failed',
                gasUsed: receipt.gasUsed?.toString(),
                timestamp: block.timestamp
              });
            } catch (e) {
              // Skip if can't get receipt
            }
          }
        }
      }
    } catch (e) {
      // Skip blocks we can't read
    }
  }
  
  if (foundTxs.length > 0) {
    console.log(`📝 Found ${foundTxs.length} recent transaction(s) from user to contract:`);
    foundTxs.forEach((tx, i) => {
      const date = new Date(tx.timestamp * 1000);
      console.log(`   ${i + 1}. Block ${tx.block}: ${tx.hash}`);
      console.log(`      Status: ${tx.status}, Gas: ${tx.gas}, Time: ${date.toISOString()}`);
    });
  } else {
    console.log('   ✅ No recent transactions found from user to contract');
  }
  
  // The key insight: Let's simulate the exact nonce timing issue
  console.log('\n🧪 SIMULATING NONCE TIMING ISSUE:');
  
  // Simulate what happens if signature was created with nonce 0 but contract now has nonce 1
  const testSignature = {
    v: 27,
    r: '0xcd6393ec6590ef968df1966ade8d151f77fa1fa715f7839117b930220a9c6d02',
    s: '0x3ee5afbb611aa02d79d3c6215ac0ade57879275359b844e12b413aa7e32855b4'
  };
  
  // Test message with nonce 0 (what frontend might have signed)
  const messageWithNonce0 = {
    escrowId: '0x1234567890123456789012345678901234567890123456789012345678901234',
    depositor: userAddress,
    beneficiary: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
    token: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    amount: '100000000000000',
    hashlock: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    timelock: Math.floor(Date.now() / 1000) + 1800,
    nonce: 0,  // Frontend signed with nonce 0
    deadline: Math.floor(Date.now() / 1000) + 3600
  };
  
  // Test message with current nonce (what contract will verify against)
  const messageWithCurrentNonce = {
    ...messageWithNonce0,
    nonce: Number(currentNonce)  // Contract verifies with current nonce
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
  
  const fullSig = ethers.Signature.from(testSignature).serialized;
  
  console.log(`   🔍 Testing signature recovery with nonce 0:`);
  try {
    const recovered0 = ethers.verifyTypedData(domain, types, messageWithNonce0, fullSig);
    console.log(`      Recovered: ${recovered0}`);
    console.log(`      Matches user: ${recovered0.toLowerCase() === userAddress.toLowerCase()}`);
  } catch (e) {
    console.log(`      Failed: ${e.message}`);
  }
  
  console.log(`   🔍 Testing signature recovery with current nonce (${currentNonce}):`);
  try {
    const recoveredCurrent = ethers.verifyTypedData(domain, types, messageWithCurrentNonce, fullSig);
    console.log(`      Recovered: ${recoveredCurrent}`);
    console.log(`      Matches user: ${recoveredCurrent.toLowerCase() === userAddress.toLowerCase()}`);
  } catch (e) {
    console.log(`      Failed: ${e.message}`);
  }
  
  console.log('\n💡 SOLUTION:');
  console.log('1. Frontend must ensure signature nonce matches contract nonce at submission time');
  console.log('2. OR resolver must refresh signature if nonce has changed');
  console.log('3. OR implement signature caching with nonce validation');
  
  console.log('\n🔧 RECOMMENDED FIX:');
  console.log('Check contract nonce before submitting, and if it differs from signed nonce,');
  console.log('request user to sign a new transaction with the current nonce.');
}

debugNonceIssue().catch(console.error);