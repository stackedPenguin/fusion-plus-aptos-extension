const { ethers } = require('ethers');

// Debug the exact signature mismatch by recreating frontend conditions
class ExactSignatureDebugger {
  constructor() {
    this.provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    this.contractAddress = '0x704EBa209E391FEBa4F1FCfdFdb852760D068d18';
    this.userAddress = '0x17061146a55f31BB85c7e211143581B44f2a03d0';
    
    // Exact values from frontend
    this.resolverAddress = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc'; // CONTRACTS.RESOLVER.ETHEREUM
    this.wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';   // CONTRACTS.ETHEREUM.WETH
  }

  // Helper function to convert Uint8Array to hex string (exact copy from frontend)
  toHex(uint8array) {
    return '0x' + Array.from(uint8array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async testSignatureRecovery() {
    console.log('🔍 TESTING EXACT SIGNATURE RECOVERY MISMATCH');
    console.log('=' .repeat(60));

    // Get the current nonce from contract
    const contract = new ethers.Contract(this.contractAddress, [
      'function getNonce(address user) view returns (uint256)',
    ], this.provider);
    
    const nonce = await contract.getNonce(this.userAddress);
    console.log(`📊 Current user nonce: ${nonce.toString()}`);

    // Recreate the exact frontend flow
    const orderNonce = Date.now().toString(); // This would be from orderData.nonce
    const secretHash = ethers.keccak256(ethers.randomBytes(32));
    const sourceEscrowId = ethers.id(orderNonce + '-source-' + secretHash);
    
    console.log(`🆔 Generated escrow ID: ${sourceEscrowId}`);
    
    // This is exactly how frontend creates escrow params
    const escrowParams = {
      escrowId: ethers.getBytes(sourceEscrowId),
      depositor: this.userAddress,
      beneficiary: this.resolverAddress,
      token: this.wethAddress,
      amount: '100000000000000', // 0.0001 WETH
      hashlock: ethers.getBytes(secretHash),
      timelock: Math.floor(Date.now() / 1000) + 1800, // This is orderData.deadline in frontend
      gaslessEscrowAddress: this.contractAddress
    };

    // Build meta-transaction message exactly as GaslessWETHTransaction does
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const message = {
      escrowId: this.toHex(escrowParams.escrowId),
      depositor: escrowParams.depositor,
      beneficiary: escrowParams.beneficiary,
      token: escrowParams.token,
      amount: escrowParams.amount,
      hashlock: this.toHex(escrowParams.hashlock),
      timelock: escrowParams.timelock,
      nonce: Number(nonce), // This is the critical part!
      deadline: deadline
    };

    // EIP-712 domain (exact copy from frontend)
    const domain = {
      name: 'FusionPlusGaslessEscrowV2',
      version: '1',
      chainId: 11155111, // Sepolia
      verifyingContract: this.contractAddress
    };

    // EIP-712 types (exact copy from frontend)
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

    console.log('\n📝 MESSAGE STRUCTURE:');
    console.log(JSON.stringify(message, null, 2));
    
    console.log('\n🌐 DOMAIN STRUCTURE:');
    console.log(JSON.stringify(domain, null, 2));

    // Calculate the message hash
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
    console.log(`\n🔍 Message hash: ${messageHash}`);

    // Test the actual signature from frontend logs
    const frontendSignature = {
      v: 27,
      r: '0xcd6393ec6590ef968df1966ade8d151f77fa1fa715f7839117b930220a9c6d02',
      s: '0x3ee5afbb611aa02d79d3c6215ac0ade57879275359b844e12b413aa7e32855b4'
    };

    console.log('\n✍️  TESTING FRONTEND SIGNATURE:');
    console.log(`v: ${frontendSignature.v}`);
    console.log(`r: ${frontendSignature.r}`);
    console.log(`s: ${frontendSignature.s}`);

    try {
      const fullSig = ethers.Signature.from(frontendSignature).serialized;
      const recoveredAddress = ethers.verifyTypedData(domain, types, message, fullSig);
      
      console.log(`\n🔍 Recovered address: ${recoveredAddress}`);
      console.log(`👤 Expected address:  ${this.userAddress}`);
      console.log(`✅ Match: ${recoveredAddress.toLowerCase() === this.userAddress.toLowerCase()}`);
      
      if (recoveredAddress.toLowerCase() !== this.userAddress.toLowerCase()) {
        console.log('\n❌ SIGNATURE MISMATCH CONFIRMED!');
        console.log('\n🔍 POSSIBLE CAUSES:');
        console.log('1. The message structure is different from what was signed');
        console.log('2. The domain/types are different from what was signed');
        console.log('3. The nonce changed between signing and verification');
        console.log('4. The deadline changed between signing and verification');
        console.log('5. The chainId or contract address is wrong');
        
        // Let's try some variations to see if we can figure out what was actually signed
        console.log('\n🧪 TESTING VARIATIONS...');
        
        // Test with nonce+1 (maybe nonce was incremented?)
        const messageWithIncrementedNonce = { ...message, nonce: Number(nonce) + 1 };
        try {
          const recoveredWithIncNonce = ethers.verifyTypedData(domain, types, messageWithIncrementedNonce, fullSig);
          console.log(`📊 With nonce+1 (${Number(nonce) + 1}): ${recoveredWithIncNonce}`);
          if (recoveredWithIncNonce.toLowerCase() === this.userAddress.toLowerCase()) {
            console.log('🎉 FOUND IT! The signature was created with incremented nonce!');
            return;
          }
        } catch (e) {
          console.log(`📊 With nonce+1: verification failed`);
        }
        
        // Test with different deadline (maybe deadline was different?)
        const messageWithDiffDeadline = { ...message, deadline: deadline + 3600 };
        try {
          const recoveredWithDiffDeadline = ethers.verifyTypedData(domain, types, messageWithDiffDeadline, fullSig);
          console.log(`⏰ With different deadline: ${recoveredWithDiffDeadline}`);
          if (recoveredWithDiffDeadline.toLowerCase() === this.userAddress.toLowerCase()) {
            console.log('🎉 FOUND IT! The signature was created with different deadline!');
            return;
          }
        } catch (e) {
          console.log(`⏰ With different deadline: verification failed`);
        }
        
        // Test with old domain name
        const oldDomain = { ...domain, name: 'FusionPlusGaslessEscrow' };
        try {
          const recoveredWithOldDomain = ethers.verifyTypedData(oldDomain, types, message, fullSig);
          console.log(`🏷️  With old domain name: ${recoveredWithOldDomain}`);
          if (recoveredWithOldDomain.toLowerCase() === this.userAddress.toLowerCase()) {
            console.log('🎉 FOUND IT! The signature was created with old domain name!');
            return;
          }
        } catch (e) {
          console.log(`🏷️  With old domain name: verification failed`);
        }

        console.log('\n❌ No matching variations found. The signature was created with different parameters.');
        
      } else {
        console.log('\n✅ SIGNATURE MATCHES! The frontend signing logic is correct.');
      }

    } catch (error) {
      console.log(`\n💥 Signature verification failed: ${error.message}`);
    }

    // Let's also check what the contract's domain separator is
    try {
      const contractDomainSeparator = await contract.DOMAIN_SEPARATOR();
      const expectedDomainSeparator = ethers.TypedDataEncoder.hashDomain(domain);
      
      console.log(`\n🔒 Contract domain separator: ${contractDomainSeparator}`);
      console.log(`🔒 Expected domain separator: ${expectedDomainSeparator}`);
      console.log(`✅ Domain separators match: ${contractDomainSeparator === expectedDomainSeparator}`);
    } catch (e) {
      console.log(`\n❌ Could not check domain separator: ${e.message}`);
    }
  }
}

// Run the exact signature debugging
const sigDebugger = new ExactSignatureDebugger();
sigDebugger.testSignatureRecovery().catch(console.error);