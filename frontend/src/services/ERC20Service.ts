import { ethers } from 'ethers';
import { TOKEN_INFO } from '../config/contracts';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)'
];

export class ERC20Service {
  private contract: ethers.Contract;
  private signer: ethers.Signer;
  private tokenSymbol: string;
  private decimals: number;

  constructor(signer: ethers.Signer, tokenAddress: string, tokenSymbol: string) {
    this.signer = signer;
    this.tokenSymbol = tokenSymbol;
    this.contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    this.decimals = TOKEN_INFO[tokenSymbol as keyof typeof TOKEN_INFO]?.decimals || 18;
  }

  /**
   * Get token balance
   */
  async getBalance(address: string): Promise<string> {
    const balance = await this.contract.balanceOf(address);
    return balance.toString();
  }

  /**
   * Get token balance formatted with correct decimals
   */
  async getFormattedBalance(address: string): Promise<string> {
    const balance = await this.getBalance(address);
    return ethers.formatUnits(balance, this.decimals);
  }

  /**
   * Check allowance
   */
  async getAllowance(owner: string, spender: string): Promise<bigint> {
    return await this.contract.allowance(owner, spender);
  }

  /**
   * Approve token spending
   */
  async approve(spender: string, amount: string): Promise<string> {
    try {
      const tx = await this.contract.approve(spender, amount);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      console.error(`Failed to approve ${this.tokenSymbol}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has sufficient balance and allowance
   */
  async checkTokenReadiness(
    userAddress: string, 
    spender: string, 
    requiredAmount: string
  ): Promise<{
    hasEnoughBalance: boolean;
    hasApproval: boolean;
    balance: string;
    allowance: string;
  }> {
    const [balance, allowance] = await Promise.all([
      this.contract.balanceOf(userAddress),
      this.contract.allowance(userAddress, spender)
    ]);

    return {
      hasEnoughBalance: balance >= BigInt(requiredAmount),
      hasApproval: allowance >= BigInt(requiredAmount),
      balance: balance.toString(),
      allowance: allowance.toString()
    };
  }

  /**
   * Parse amount to smallest unit (considering decimals)
   */
  parseAmount(amount: string): string {
    return ethers.parseUnits(amount, this.decimals).toString();
  }

  /**
   * Format amount from smallest unit (considering decimals)
   */
  formatAmount(amount: string): string {
    return ethers.formatUnits(amount, this.decimals);
  }
}