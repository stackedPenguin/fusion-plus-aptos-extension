#!/usr/bin/env node

const { ethers } = require('ethers');

async function debugTransaction() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  
  // Transaction hash from the error logs
  const txHash = '0x72fe8027c6fc31e01d15c1837f3bb5acfc86f24a6f566c1bb97c28e3b12cecc1';
  
  try {
    // Get transaction details
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      console.log('Transaction not found');
      return;
    }
    
    console.log('\n📋 Transaction Details:');
    console.log('From:', tx.from);
    console.log('To:', tx.to);
    console.log('Value:', ethers.formatEther(tx.value), 'ETH');
    console.log('Data:', tx.data);
    
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
      console.log('\n📄 Receipt:');
      console.log('Status:', receipt.status === 1 ? '✅ Success' : '❌ Failed');
      console.log('Gas Used:', receipt.gasUsed.toString());
      
      if (receipt.status === 0) {
        // Try to get revert reason
        try {
          const code = await provider.call({
            to: tx.to,
            data: tx.data,
            from: tx.from,
            value: tx.value
          }, tx.blockNumber - 1);
          console.log('Call result:', code);
        } catch (error) {
          console.log('\n❌ Revert reason:', error.message);
          
          // Extract custom error if any
          if (error.data) {
            console.log('Error data:', error.data);
            
            // Try to decode known errors
            const errorSignatures = {
              '0xb12d13eb': 'InvalidSignature()',
              '0x7c1f8113': 'InsufficientBalance()',
              '0x23369fa6': 'EscrowAlreadyExists()',
              '0x2c5211c6': 'InvalidAmount()',
              '0xf0b4e88f': 'InvalidTimelock()',
              '0x0819bdcd': 'PermitExpired()'
            };
            
            const errorSig = error.data.slice(0, 10);
            if (errorSignatures[errorSig]) {
              console.log('Custom error:', errorSignatures[errorSig]);
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugTransaction().catch(console.error);