const { AptosClient } = require('aptos');
const { ethers } = require('ethers');

async function checkEscrowExists() {
  const client = new AptosClient('https://fullnode.testnet.aptoslabs.com');
  
  const escrowId = '0x0ae655b5fb0015879ff87f61869e38ffc1d74dd0af2ba0b967e39be574429eac';
  const escrowModule = '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532';
  
  console.log('Checking if escrow exists...');
  console.log('Escrow ID:', escrowId);
  
  try {
    const viewPayload = {
      function: `${escrowModule}::escrow::escrow_exists`,
      type_arguments: [],
      arguments: [escrowId]
    };
    
    const response = await fetch('https://fullnode.testnet.aptoslabs.com/v1/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(viewPayload)
    });
    
    const result = await response.json();
    console.log('Response:', result);
    
    if (result.error) {
      console.error('Error:', result.error);
    } else if (result[0]) {
      console.log('Escrow exists:', result[0]);
    } else {
      console.log('Escrow does not exist');
    }
    
  } catch (error) {
    console.error('Failed to check escrow:', error.message);
  }
}

checkEscrowExists().catch(console.error);