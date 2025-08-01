import { ethers } from 'ethers';

const ESCROW_ABI = [
  {
    "inputs": [
      {"name": "_escrowId", "type": "bytes32"},
      {"name": "_secret", "type": "bytes32"}
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "", "type": "bytes32"}],
    "name": "escrows",
    "outputs": [
      {"name": "depositor", "type": "address"},
      {"name": "beneficiary", "type": "address"},
      {"name": "token", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "hashlock", "type": "bytes32"},
      {"name": "timelock", "type": "uint256"},
      {"name": "withdrawn", "type": "bool"},
      {"name": "refunded", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

export class EscrowService {
  private contract: ethers.Contract;
  private signer: ethers.Signer;

  constructor(escrowAddress: string, signer: ethers.Signer) {
    this.signer = signer;
    this.contract = new ethers.Contract(escrowAddress, ESCROW_ABI, signer);
  }

  /**
   * Withdraw from an escrow using the secret
   */
  async withdraw(escrowId: string, secret: string): Promise<string> {
    try {
      console.log('🔓 Withdrawing from escrow:', escrowId);
      console.log('🔑 Using secret:', secret);
      
      // First check if escrow exists and is withdrawable
      const escrow = await this.contract.escrows(escrowId);
      console.log('📦 Escrow details:', {
        beneficiary: escrow.beneficiary,
        token: escrow.token,
        amount: ethers.formatEther(escrow.amount),
        withdrawn: escrow.withdrawn,
        refunded: escrow.refunded
      });

      if (escrow.withdrawn) {
        throw new Error('Escrow already withdrawn');
      }

      if (escrow.refunded) {
        throw new Error('Escrow already refunded');
      }

      // Withdraw from the escrow
      const tx = await this.contract.withdraw(escrowId, secret);
      console.log('📤 Withdrawal transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('✅ Withdrawal successful!');
      
      return receipt.hash;
    } catch (error) {
      console.error('Failed to withdraw from escrow:', error);
      throw error;
    }
  }

  /**
   * Check if an escrow can be withdrawn
   */
  async canWithdraw(escrowId: string, userAddress: string): Promise<boolean> {
    try {
      const escrow = await this.contract.escrows(escrowId);
      return escrow.beneficiary.toLowerCase() === userAddress.toLowerCase() && 
             !escrow.withdrawn && 
             !escrow.refunded &&
             escrow.amount > 0;
    } catch (error) {
      console.error('Failed to check escrow status:', error);
      return false;
    }
  }
}