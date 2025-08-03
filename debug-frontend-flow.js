const { ethers } = require('ethers');

// Replicate the exact frontend flow to debug the signature mismatch
class FrontendFlowDebugger {
  constructor() {
    this.provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    this.contractAddress = '0x704EBa209E391FEBa4F1FCfdFdb852760D068d18';
    this.userAddress = '0x17061146a55f31BB85c7e211143581B44f2a03d0';
    this.resolverAddress = '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc';
    this.wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  }

  // Helper function to convert Uint8Array to hex string (from frontend)
  toHex(uint8array) {
    return '0x' + Array.from(uint8array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Step 1: Check contract state
  async checkContractState() {
    console.log('🔍 STEP 1: Checking contract state...');
    
    try {
      const contract = new ethers.Contract(this.contractAddress, [
        'function getNonce(address user) view returns (uint256)',
        'function DOMAIN_SEPARATOR() view returns (bytes32)',
        'function escrows(bytes32) view returns (address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded)'
      ], this.provider);

      const nonce = await contract.getNonce(this.userAddress);
      const domainSeparator = await contract.DOMAIN_SEPARATOR();

      console.log(`   ✅ Contract accessible at: ${this.contractAddress}`);
      console.log(`   📊 User nonce: ${nonce.toString()}`);
      console.log(`   🔒 Domain separator: ${domainSeparator}`);
      
      return { nonce: Number(nonce), domainSeparator };
    } catch (error) {
      console.log(`   ❌ Contract error: ${error.message}`);
      throw error;
    }
  }

  // Step 2: Generate escrow parameters (replicate frontend logic)
  generateEscrowParams() {
    console.log('\n🔍 STEP 2: Generating escrow parameters...');
    
    // Replicate the frontend order ID generation
    const orderNonce = Date.now().toString();
    const secretHash = ethers.keccak256(ethers.randomBytes(32));
    const sourceEscrowId = ethers.id(orderNonce + '-source-' + secretHash);
    
    const params = {
      escrowId: ethers.getBytes(sourceEscrowId),
      depositor: this.userAddress,
      beneficiary: this.resolverAddress,
      token: this.wethAddress,
      amount: '100000000000000', // 0.0001 WETH
      hashlock: ethers.getBytes(secretHash),
      timelock: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
      gaslessEscrowAddress: this.contractAddress
    };

    console.log(`   🆔 Escrow ID: ${this.toHex(params.escrowId)}`);
    console.log(`   👤 Depositor: ${params.depositor}`);
    console.log(`   🎯 Beneficiary: ${params.beneficiary}`);
    console.log(`   🪙 Token: ${params.token}`);
    console.log(`   💰 Amount: ${params.amount}`);
    console.log(`   🔐 Hashlock: ${this.toHex(params.hashlock)}`);
    console.log(`   ⏰ Timelock: ${params.timelock}`);

    return params;
  }

  // Step 3: Build meta-transaction message (replicate frontend GaslessWETHTransaction)
  async buildMetaTxMessage(params, nonce) {
    console.log('\n🔍 STEP 3: Building meta-transaction message...');
    
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const message = {
      escrowId: this.toHex(params.escrowId),
      depositor: params.depositor,
      beneficiary: params.beneficiary,
      token: params.token,
      amount: params.amount,
      hashlock: this.toHex(params.hashlock),
      timelock: params.timelock,
      nonce: nonce,
      deadline: deadline
    };

    console.log('   📝 Message structure:', JSON.stringify(message, null, 4));
    return { message, deadline };
  }

  // Step 4: Build EIP-712 domain (replicate frontend)
  buildDomain() {
    console.log('\n🔍 STEP 4: Building EIP-712 domain...');
    
    const domain = {
      name: 'FusionPlusGaslessEscrowV2',
      version: '1',
      chainId: 11155111, // Sepolia
      verifyingContract: this.contractAddress
    };

    console.log('   🌐 Domain structure:', JSON.stringify(domain, null, 4));
    return domain;
  }

  // Step 5: Build EIP-712 types
  buildTypes() {
    console.log('\n🔍 STEP 5: Building EIP-712 types...');
    
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

    console.log('   📋 Types structure:', JSON.stringify(types, null, 4));
    return types;
  }

  // Step 6: Test signature with different signing methods
  async testSigningMethods(domain, types, message) {
    console.log('\n🔍 STEP 6: Testing different signing approaches...');
    
    // Method 1: Test with a known private key that should match the user address
    console.log('\n   🔐 Method 1: Testing if we can find the right private key...');
    
    // We don't have the actual private key, but let's test the signature recovery
    // with some test signatures to see what addresses they would recover to
    
    // Let's test with the exact signature data from your recent logs
    // We'll create a signature that should work based on the domain, types, and message
    console.log('   📝 Creating test signature to verify our signing logic...');
    
    // First, let's compute what the signature SHOULD recover to
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
    console.log(`   🔍 Message hash: ${messageHash}`);
    
    // Now let's test with some known signatures from the logs
    const testSignatures = [
      {
        v: 27,
        r: '0xcd6393ec6590ef968df1966ade8d151f77fa1fa715f7839117b930220a9c6d02',
        s: '0x3ee5afbb611aa02d79d3c6215ac0ade57879275359b844e12b413aa7e32855b4',
        source: 'Frontend logs - checking if these recover correctly'
      }
    ];

    for (let i = 0; i < testSignatures.length; i++) {
      const sig = testSignatures[i];
      console.log(`\n   📝 Testing signature ${i + 1} (${sig.source}):`);
      console.log(`      v: ${sig.v}, r: ${sig.r}, s: ${sig.s}`);
      
      try {
        const fullSig = ethers.Signature.from(sig).serialized;
        const recoveredAddress = ethers.verifyTypedData(domain, types, message, fullSig);
        
        console.log(`      🔍 Recovered address: ${recoveredAddress}`);
        console.log(`      ✅ Matches user (${this.userAddress})?`, 
          recoveredAddress.toLowerCase() === this.userAddress.toLowerCase());
          
        if (recoveredAddress.toLowerCase() === this.userAddress.toLowerCase()) {
          console.log(`      🎉 FOUND MATCHING SIGNATURE!`);
          return { signature: sig, recoveredAddress };
        }
      } catch (error) {
        console.log(`      ❌ Signature verification failed: ${error.message}`);
      }
    }

    return null;
  }

  // Step 7: Test contract function call simulation
  async testContractCall(message, signature) {
    console.log('\n🔍 STEP 7: Testing contract function call...');
    
    if (!signature) {
      console.log('   ❌ No valid signature to test with');
      return;
    }

    try {
      const contract = new ethers.Contract(this.contractAddress, [
        'function createEscrowWithMetaTx(tuple(bytes32 escrowId, address depositor, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock, uint256 deadline) params, uint8 v, bytes32 r, bytes32 s) external payable'
      ], this.provider);

      const params = {
        escrowId: message.escrowId,
        depositor: message.depositor,
        beneficiary: message.beneficiary,
        token: message.token,
        amount: message.amount,
        hashlock: message.hashlock,
        timelock: message.timelock,
        deadline: message.deadline
      };

      console.log('   📞 Simulating contract call...');
      console.log('   📋 Parameters:', JSON.stringify(params, null, 4));
      console.log('   ✍️  Signature:', signature);

      // Try to estimate gas (this will fail but give us the exact error)
      try {
        const gasEstimate = await contract.createEscrowWithMetaTx.estimateGas(
          params,
          signature.v,
          signature.r,
          signature.s,
          { value: 0 } // No safety deposit for gasless
        );
        console.log('   ✅ Gas estimate successful:', gasEstimate.toString());
      } catch (error) {
        console.log('   ❌ Contract call failed:');
        console.log(`      Error: ${error.message}`);
        console.log(`      Data: ${error.data || 'No error data'}`);
        
        // Decode the error if possible
        if (error.data) {
          const errorCode = error.data.slice(0, 10);
          console.log(`      Error code: ${errorCode}`);
          
          const knownErrors = {
            '0x8baa579f': 'InvalidSignature()',
            '0x1a15a3cc': 'InvalidAmount()',
            '0x6f7eac26': 'InvalidTimelock()',
            '0x7138883f': 'EscrowAlreadyExists()',
            '0x48fee69c': 'PermitExpired()'
          };
          
          if (knownErrors[errorCode]) {
            console.log(`      Known error: ${knownErrors[errorCode]}`);
          }
        }
      }
    } catch (error) {
      console.log(`   ❌ Contract setup error: ${error.message}`);
    }
  }

  // Step 8: Analyze frontend transaction logs
  async analyzeTransactionLogs() {
    console.log('\n🔍 STEP 8: Analyzing recent transaction logs...');
    
    // Get recent transactions to this contract
    try {
      const latestBlock = await this.provider.getBlockNumber();
      console.log(`   📦 Latest block: ${latestBlock}`);
      
      // Look for recent transactions to our contract
      for (let i = 0; i < 10; i++) {
        const blockNumber = latestBlock - i;
        try {
          const block = await this.provider.getBlock(blockNumber, true);
          if (block && block.transactions) {
            const contractTxs = block.transactions.filter(tx => 
              tx.to && tx.to.toLowerCase() === this.contractAddress.toLowerCase()
            );
            
            if (contractTxs.length > 0) {
              console.log(`   📝 Found ${contractTxs.length} transaction(s) to contract in block ${blockNumber}`);
              for (const tx of contractTxs) {
                console.log(`      TX: ${tx.hash}`);
                console.log(`      From: ${tx.from}`);
                console.log(`      Value: ${tx.value?.toString() || '0'} wei`);
                
                // Try to get the receipt to see if it failed
                try {
                  const receipt = await this.provider.getTransactionReceipt(tx.hash);
                  console.log(`      Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
                  console.log(`      Gas used: ${receipt.gasUsed?.toString() || 'Unknown'}`);
                } catch (e) {
                  console.log(`      Receipt: Could not fetch`);
                }
              }
            }
          }
        } catch (e) {
          // Skip blocks we can't read
        }
      }
    } catch (error) {
      console.log(`   ❌ Block analysis error: ${error.message}`);
    }
  }

  // Main debugging flow
  async debug() {
    console.log('🚀 STARTING COMPREHENSIVE FRONTEND FLOW DEBUG');
    console.log('=' .repeat(60));

    try {
      // Step 1: Check contract state
      const contractState = await this.checkContractState();
      
      // Step 2: Generate escrow parameters
      const escrowParams = this.generateEscrowParams();
      
      // Step 3: Build meta-transaction message
      const { message, deadline } = await this.buildMetaTxMessage(escrowParams, contractState.nonce);
      
      // Step 4: Build domain
      const domain = this.buildDomain();
      
      // Step 5: Build types
      const types = this.buildTypes();
      
      // Step 6: Test signing methods
      const signatureResult = await this.testSigningMethods(domain, types, message);
      
      // Step 7: Test contract call
      await this.testContractCall(message, signatureResult?.signature);
      
      // Step 8: Analyze transaction logs
      await this.analyzeTransactionLogs();
      
      console.log('\n' + '=' .repeat(60));
      console.log('🏁 DEBUGGING COMPLETE');
      
      if (signatureResult && signatureResult.recoveredAddress.toLowerCase() === this.userAddress.toLowerCase()) {
        console.log('✅ RESULT: Signature verification is working correctly!');
        console.log('   The issue is likely in contract validation, not signature generation.');
      } else {
        console.log('❌ RESULT: Signature verification is still failing!');
        console.log('   The issue is in the signature generation process.');
      }
      
    } catch (error) {
      console.error('💥 DEBUGGING FAILED:', error.message);
      console.error(error.stack);
    }
  }
}

// Run the debugging
const flowDebugger = new FrontendFlowDebugger();
flowDebugger.debug().catch(console.error);