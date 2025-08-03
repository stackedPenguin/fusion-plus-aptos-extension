const { ethers } = require('ethers');

// Debug the timelock data type mismatch issue
async function debugTimelockIssue() {
  console.log('🕐 DEBUGGING TIMELOCK DATA TYPE MISMATCH');
  console.log('=' .repeat(50));

  // Create test data that matches the frontend flow exactly
  const timelock = Math.floor(Date.now() / 1000) + 1800; // number
  const deadline = Math.floor(Date.now() / 1000) + 3600; // number
  
  console.log(`Original timelock (number): ${timelock}`);
  console.log(`Original deadline (number): ${deadline}`);
  console.log(`Timelock as string: "${timelock.toString()}"`);
  console.log(`Deadline as string: "${deadline.toString()}"`);

  // Test message structures
  const baseMessage = {
    escrowId: '0x1234567890123456789012345678901234567890123456789012345678901234',
    depositor: '0x17061146a55f31BB85c7e211143581B44f2a03d0',
    beneficiary: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
    token: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    amount: '100000000000000',
    hashlock: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    nonce: 0
  };

  // Message 1: Frontend signing (timelock as number)
  const frontendMessage = {
    ...baseMessage,
    timelock: timelock,    // NUMBER
    deadline: deadline     // NUMBER
  };

  // Message 2: Resolver verification (timelock as string)
  const resolverMessage = {
    ...baseMessage,
    timelock: timelock.toString(),    // STRING
    deadline: deadline.toString()     // STRING
  };

  // Message 3: Resolver verification with correct timelock
  const correctedMessage = {
    ...baseMessage,
    timelock: timelock,    // NUMBER (corrected)
    deadline: deadline     // NUMBER (corrected)
  };

  const domain = {
    name: 'FusionPlusGaslessEscrowV2',
    version: '1',
    chainId: 11155111,
    verifyingContract: '0x704EBa209E391FEBa4F1FCfdFdb852760D068d18'
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

  console.log('\n📝 COMPUTING MESSAGE HASHES:');
  
  try {
    const frontendHash = ethers.TypedDataEncoder.hash(domain, types, frontendMessage);
    console.log(`Frontend hash (timelock as number): ${frontendHash}`);
  } catch (e) {
    console.log(`Frontend hash error: ${e.message}`);
  }

  try {
    const resolverHash = ethers.TypedDataEncoder.hash(domain, types, resolverMessage);
    console.log(`Resolver hash (timelock as string):  ${resolverHash}`);
  } catch (e) {
    console.log(`Resolver hash error: ${e.message}`);
  }

  try {
    const correctedHash = ethers.TypedDataEncoder.hash(domain, types, correctedMessage);
    console.log(`Corrected hash (timelock as number): ${correctedHash}`);
  } catch (e) {
    console.log(`Corrected hash error: ${e.message}`);
  }

  console.log('\n🔍 ANALYSIS:');
  console.log('The issue is that:');
  console.log('1. Frontend signs message with timelock as NUMBER');
  console.log('2. Frontend sends timelock as STRING to resolver');
  console.log('3. Resolver uses STRING timelock in verification');
  console.log('4. This creates different message hashes!');
  
  console.log('\n💡 SOLUTION:');
  console.log('The resolver must convert string values back to numbers before verification:');
  console.log('timelock: parseInt(gaslessData.timelock)');
  console.log('deadline: parseInt(gaslessData.deadline)');

  // Test with the actual signature from logs
  const testSignature = {
    v: 27,
    r: '0xcd6393ec6590ef968df1966ade8d151f77fa1fa715f7839117b930220a9c6d02',
    s: '0x3ee5afbb611aa02d79d3c6215ac0ade57879275359b844e12b413aa7e32855b4'
  };

  console.log('\n🧪 TESTING WITH ACTUAL SIGNATURE:');
  const fullSig = ethers.Signature.from(testSignature).serialized;
  
  try {
    const recovered1 = ethers.verifyTypedData(domain, types, frontendMessage, fullSig);
    console.log(`Recovered with frontend format: ${recovered1}`);
  } catch (e) {
    console.log(`Recovery with frontend format failed: ${e.message}`);
  }

  try {
    const recovered2 = ethers.verifyTypedData(domain, types, correctedMessage, fullSig);
    console.log(`Recovered with corrected format: ${recovered2}`);
  } catch (e) {
    console.log(`Recovery with corrected format failed: ${e.message}`);
  }
}

debugTimelockIssue().catch(console.error);