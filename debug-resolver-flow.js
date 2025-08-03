const { ethers } = require('ethers');

// Debug the exact resolver flow to find where signature verification fails
class ResolverFlowDebugger {
  constructor() {
    this.provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    this.contractAddress = '0x704EBa209E391FEBa4F1FCfdFdb852760D068d18';
    this.userAddress = '0x17061146a55f31BB85c7e211143581B44f2a03d0';
  }

  async debugSignatureFlow() {
    console.log('🔍 DEBUGGING EXACT RESOLVER SIGNATURE PROCESSING');
    console.log('=' .repeat(60));

    // Get current nonce
    const contract = new ethers.Contract(this.contractAddress, [
      'function getNonce(address user) view returns (uint256)',
    ], this.provider);
    
    const nonce = await contract.getNonce(this.userAddress);
    console.log(`📊 Current nonce: ${nonce.toString()}`);

    // Simulate exact frontend gaslessData creation
    console.log('\n🎭 SIMULATING FRONTEND FLOW:');
    
    // Step 1: Frontend creates escrow params (exactly as SwapInterface does)
    const orderNonce = Date.now().toString();
    const secretHash = ethers.keccak256(ethers.randomBytes(32));
    const sourceEscrowId = ethers.id(orderNonce + '-source-' + secretHash);
    
    const escrowParams = {
      escrowId: ethers.getBytes(sourceEscrowId),
      depositor: this.userAddress,
      beneficiary: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
      token: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      amount: '100000000000000',
      hashlock: ethers.getBytes(secretHash),
      timelock: Math.floor(Date.now() / 1000) + 1800,
      gaslessEscrowAddress: this.contractAddress
    };
    
    console.log('   ✅ Escrow params created');

    // Step 2: Frontend builds meta-tx message (as GaslessWETHTransaction does)
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const frontendMessage = {
      escrowId: this.toHex(escrowParams.escrowId),
      depositor: escrowParams.depositor,
      beneficiary: escrowParams.beneficiary,
      token: escrowParams.token,
      amount: escrowParams.amount,
      hashlock: this.toHex(escrowParams.hashlock),
      timelock: escrowParams.timelock,  // NUMBER
      nonce: Number(nonce),
      deadline: deadline                // NUMBER
    };
    
    console.log('   ✅ Frontend message created');
    console.log('   📝 Frontend message:', JSON.stringify(frontendMessage, null, 4));

    // Step 3: Frontend creates gaslessData (as prepareGaslessEscrowData does)
    const gaslessData = {
      escrowId: this.toHex(escrowParams.escrowId),
      depositor: escrowParams.depositor,
      beneficiary: escrowParams.beneficiary,
      token: escrowParams.token,
      amount: escrowParams.amount,
      hashlock: this.toHex(escrowParams.hashlock),
      timelock: escrowParams.timelock.toString(), // STRING!
      deadline: deadline.toString(),              // STRING!
      metaTxV: 27,
      metaTxR: '0xcd6393ec6590ef968df1966ade8d151f77fa1fa715f7839117b930220a9c6d02',
      metaTxS: '0x3ee5afbb611aa02d79d3c6215ac0ade57879275359b844e12b413aa7e32855b4'
    };
    
    console.log('   ✅ GaslessData created (with string conversions)');
    console.log('   📦 GaslessData:', JSON.stringify(gaslessData, null, 4));

    // Step 4: Resolver builds metaTxParams (as ResolverServiceV2 does)
    console.log('\n🔧 SIMULATING RESOLVER FLOW:');
    
    const metaTxParams = {
      escrowId: gaslessData.escrowId,        // string
      depositor: gaslessData.depositor,      // string
      beneficiary: gaslessData.beneficiary,  // string
      token: gaslessData.token,              // string
      amount: gaslessData.amount,            // string
      hashlock: gaslessData.hashlock,        // string
      timelock: gaslessData.timelock,        // STRING from gaslessData!
      deadline: gaslessData.deadline         // STRING from gaslessData!
    };
    
    console.log('   ✅ Resolver metaTxParams created');
    console.log('   📋 MetaTxParams:', JSON.stringify(metaTxParams, null, 4));

    // The key issue: resolver creates message for verification using these params
    // But the contract expects the ORIGINAL message format (with numbers)!
    
    console.log('\n🔍 COMPARING MESSAGE FORMATS:');
    
    const domain = {
      name: 'FusionPlusGaslessEscrowV2',
      version: '1',
      chainId: 11155111,
      verifyingContract: this.contractAddress
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

    // Test message verification with both formats
    const frontendHash = ethers.TypedDataEncoder.hash(domain, types, frontendMessage);
    console.log(`   📝 Frontend signed hash: ${frontendHash}`);

    // Message as resolver would reconstruct it (but this might be wrong!)
    const resolverMessage = {
      escrowId: metaTxParams.escrowId,
      depositor: metaTxParams.depositor,
      beneficiary: metaTxParams.beneficiary,
      token: metaTxParams.token,
      amount: metaTxParams.amount,
      hashlock: metaTxParams.hashlock,
      timelock: metaTxParams.timelock,  // Still string - this could be wrong!
      nonce: Number(nonce),
      deadline: metaTxParams.deadline   // Still string - this could be wrong!
    };

    const resolverHash = ethers.TypedDataEncoder.hash(domain, types, resolverMessage);
    console.log(`   🔧 Resolver verify hash:  ${resolverHash}`);
    console.log(`   ✅ Hashes match: ${frontendHash === resolverHash}`);

    // The fix: resolver should convert strings back to numbers
    const correctedResolverMessage = {
      escrowId: metaTxParams.escrowId,
      depositor: metaTxParams.depositor,
      beneficiary: metaTxParams.beneficiary,
      token: metaTxParams.token,
      amount: metaTxParams.amount,
      hashlock: metaTxParams.hashlock,
      timelock: parseInt(metaTxParams.timelock),   // Convert back to number!
      nonce: Number(nonce),
      deadline: parseInt(metaTxParams.deadline)    // Convert back to number!
    };

    const correctedHash = ethers.TypedDataEncoder.hash(domain, types, correctedResolverMessage);
    console.log(`   🔧 Corrected verify hash: ${correctedHash}`);
    console.log(`   ✅ Corrected matches:     ${frontendHash === correctedHash}`);

    // Test signature recovery
    console.log('\n🔐 TESTING SIGNATURE RECOVERY:');
    
    const signature = {
      v: gaslessData.metaTxV,
      r: gaslessData.metaTxR,
      s: gaslessData.metaTxS
    };
    
    const fullSig = ethers.Signature.from(signature).serialized;
    
    try {
      const recoveredCorrect = ethers.verifyTypedData(domain, types, correctedResolverMessage, fullSig);
      console.log(`   🎯 Signature recovers to: ${recoveredCorrect}`);
      console.log(`   ✅ Matches user address:  ${recoveredCorrect.toLowerCase() === this.userAddress.toLowerCase()}`);
    } catch (e) {
      console.log(`   ❌ Signature recovery failed: ${e.message}`);
    }

    console.log('\n💡 SOLUTION:');
    console.log('The resolver must convert gaslessData string values back to numbers:');
    console.log('timelock: parseInt(gaslessData.timelock)');
    console.log('deadline: parseInt(gaslessData.deadline)');
    console.log('amount: gaslessData.amount (already string for uint256)');
  }

  toHex(uint8array) {
    return '0x' + Array.from(uint8array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

const flowDebugger = new ResolverFlowDebugger();
flowDebugger.debugSignatureFlow().catch(console.error);