import { ethers } from 'ethers';

export class WETHService {
  private provider: ethers.Provider;
  private wethContract: ethers.Contract;
  
  private WETH_ABI = [
    {
      "inputs": [],
      "name": "deposit",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [{"name": "wad", "type": "uint256"}],
      "name": "withdraw",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{"name": "owner", "type": "address"}],
      "name": "balanceOf",
      "outputs": [{"name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
      "name": "approve",
      "outputs": [{"name": "", "type": "bool"}],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
      "name": "allowance",
      "outputs": [{"name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"}
      ],
      "name": "transferFrom",
      "outputs": [{"name": "", "type": "bool"}],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {"name": "owner", "type": "address"},
        {"name": "spender", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
        {"name": "v", "type": "uint8"},
        {"name": "r", "type": "bytes32"},
        {"name": "s", "type": "bytes32"}
      ],
      "name": "permit",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{"name": "owner", "type": "address"}],
      "name": "nonces",
      "outputs": [{"name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    }
  ];

  constructor(provider: ethers.Provider, wethAddress: string) {
    this.provider = provider;
    this.wethContract = new ethers.Contract(wethAddress, this.WETH_ABI, provider);
  }

  /**
   * Execute a WETH transfer using permit
   */
  async executePermitTransfer(
    permit: {
      owner: string;
      spender: string;
      value: string;
      nonce: string;
      deadline: number;
    },
    signature: string,
    to: string,
    signer: ethers.Wallet
  ): Promise<string> {
    try {
      const sig = ethers.Signature.from(signature);
      
      // First, execute the permit
      const wethWithSigner = this.wethContract.connect(signer) as any;
      const permitTx = await wethWithSigner.permit(
        permit.owner,
        permit.spender,
        permit.value,
        permit.deadline,
        sig.v,
        sig.r,
        sig.s
      );
      await permitTx.wait();
      console.log('WETH permit executed:', permitTx.hash);
      
      // Then transfer the WETH from owner to destination
      const transferTx = await wethWithSigner.transferFrom(
        permit.owner,
        to,
        permit.value
      );
      const receipt = await transferTx.wait();
      
      return receipt.hash;
    } catch (error) {
      console.error('Failed to execute WETH permit transfer:', error);
      throw error;
    }
  }

  /**
   * Get WETH balance
   */
  async getBalance(address: string): Promise<bigint> {
    return await this.wethContract.balanceOf(address);
  }

  /**
   * Check allowance
   */
  async getAllowance(owner: string, spender: string): Promise<bigint> {
    return await this.wethContract.allowance(owner, spender);
  }

  /**
   * Wrap ETH to WETH
   */
  async wrapETH(amount: string, signer: ethers.Wallet): Promise<string> {
    const wethWithSigner = this.wethContract.connect(signer) as any;
    const tx = await wethWithSigner.deposit({ value: amount });
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Unwrap WETH to ETH
   */
  async unwrapWETH(amount: string, signer: ethers.Wallet): Promise<string> {
    const wethWithSigner = this.wethContract.connect(signer) as any;
    const tx = await wethWithSigner.withdraw(amount);
    const receipt = await tx.wait();
    return receipt.hash;
  }
}