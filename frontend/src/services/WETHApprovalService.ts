import { ethers } from 'ethers';

export class WETHApprovalService {
  private wethContract: ethers.Contract;
  private escrowAddress: string;
  
  constructor(
    private provider: ethers.Provider,
    private wethAddress: string,
    escrowAddress: string
  ) {
    this.escrowAddress = escrowAddress;
    
    const wethAbi = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)'
    ];
    
    this.wethContract = new ethers.Contract(wethAddress, wethAbi, provider);
  }
  
  /**
   * Check if user has approved escrow contract to spend WETH
   */
  async checkApproval(userAddress: string): Promise<{
    hasApproval: boolean;
    currentAllowance: bigint;
    needsApproval: boolean;
  }> {
    try {
      const allowance = await this.wethContract.allowance(userAddress, this.escrowAddress);
      
      // Consider approved if allowance is > 1 WETH
      const minAllowance = ethers.parseEther('1');
      const hasApproval = allowance >= minAllowance;
      
      return {
        hasApproval,
        currentAllowance: allowance,
        needsApproval: !hasApproval
      };
    } catch (error) {
      console.error('Error checking WETH approval:', error);
      return {
        hasApproval: false,
        currentAllowance: BigInt(0),
        needsApproval: true
      };
    }
  }
  
  /**
   * Request user to approve escrow contract (one-time)
   */
  async requestApproval(signer: ethers.Signer): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    try {
      const wethWithSigner = this.wethContract.connect(signer);
      
      // Approve max uint256 for convenience (user won't need to approve again)
      const maxApproval = ethers.MaxUint256;
      
      console.log('🔐 Requesting WETH approval for escrow contract...');
      const tx = await (wethWithSigner as any).approve(this.escrowAddress, maxApproval);
      
      console.log('⏳ Waiting for approval confirmation...');
      const receipt = await tx.wait();
      
      console.log('✅ WETH approval granted!');
      return {
        success: true,
        txHash: receipt.hash
      };
    } catch (error: any) {
      console.error('❌ WETH approval failed:', error);
      return {
        success: false,
        error: error.message || 'Approval failed'
      };
    }
  }
  
  /**
   * Get human-readable allowance amount
   */
  formatAllowance(allowance: bigint): string {
    if (allowance === ethers.MaxUint256) {
      return 'Unlimited';
    }
    return ethers.formatEther(allowance) + ' WETH';
  }
}