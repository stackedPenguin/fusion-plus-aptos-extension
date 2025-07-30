import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../backend/resolver/.env') });

// Contract ABI for create_escrow function
const ESCROW_ABI = [
  {
    "inputs": [
      {"name": "_escrowId", "type": "bytes32"},
      {"name": "_beneficiary", "type": "address"},
      {"name": "_hashlock", "type": "bytes32"},
      {"name": "_timelock", "type": "uint256"},
      {"name": "_tokenAddress", "type": "address"},
      {"name": "_amount", "type": "uint256"}
    ],
    "name": "create_escrow",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

async function createSourceEscrow() {
  if (!process.argv[2] || !process.argv[3]) {
    console.log('Usage: node create-source-escrow.js <orderId> <secretHash>');
    console.log('Example: node create-source-escrow.js f8d28b50-d3a3-4aeb-b8a0-353944d1d7d3 0x4f53d70a3169dfc99494b40e26f4716dd0ce81c4fd98e2b0979ad53e434d4d3b');
    process.exit(1);
  }

  const orderId = process.argv[2];
  const secretHash = process.argv[3];

  try {
    // Connect to Ethereum
    const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const privateKey = process.env.USER_PRIVATE_KEY || process.env.ETHEREUM_PRIVATE_KEY;
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log('Creating Ethereum escrow for order:', orderId);
    console.log('Your address:', wallet.address);
    
    // Contract address
    const escrowAddress = process.env.ETHEREUM_ESCROW_CONTRACT;
    const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);
    
    // Generate escrow ID from order ID
    const escrowId = ethers.keccak256(ethers.toUtf8Bytes(orderId));
    
    // Resolver's address as beneficiary
    const beneficiary = process.env.ETHEREUM_RESOLVER_ADDRESS || '0x2d61a25DFaC21604C5EaBDa303c9CC9F367d6c17';
    
    // 30 minute timelock
    const timelock = Math.floor(Date.now() / 1000) + 1800;
    
    // ETH (zero address for native token)
    const tokenAddress = ethers.ZeroAddress;
    
    // Amount: 0.0005 ETH
    const amount = ethers.parseEther('0.0005');
    
    console.log('\nEscrow Details:');
    console.log('- Escrow ID:', escrowId);
    console.log('- Beneficiary (Resolver):', beneficiary);
    console.log('- Secret Hash:', secretHash);
    console.log('- Timelock:', new Date(timelock * 1000).toLocaleString());
    console.log('- Amount:', ethers.formatEther(amount), 'ETH');
    
    // Create escrow
    console.log('\nCreating escrow...');
    const tx = await escrowContract.create_escrow(
      escrowId,
      beneficiary,
      secretHash,
      timelock,
      tokenAddress,
      amount,
      { value: amount }
    );
    
    console.log('Transaction sent:', tx.hash);
    console.log('Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Escrow created successfully!');
    console.log('Block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());
    
    console.log('\n🎉 The resolver will now detect your escrow and complete the swap!');
    console.log('Watch the resolver logs to see the progress.');
    
  } catch (error) {
    console.error('Failed to create escrow:', error);
  }
}

createSourceEscrow();