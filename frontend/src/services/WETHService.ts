import { ethers } from 'ethers';
import { CONTRACTS } from '../config/contracts';

const WETH_ABI = [
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
    "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}, {"name": "value", "type": "uint256"}, {"name": "deadline", "type": "uint256"}],
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
  },
  {
    "inputs": [],
    "name": "DOMAIN_SEPARATOR",
    "outputs": [{"name": "", "type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
  }
];

export class WETHService {
  private contract: ethers.Contract;
  private signer: ethers.Signer;
  private contractAddress: string;
  private abi: any[];

  constructor(signer: ethers.Signer, contractAddress?: string) {
    this.signer = signer;
    this.contractAddress = contractAddress || CONTRACTS.ETHEREUM.WETH;
    this.abi = WETH_ABI;
    this.contract = new ethers.Contract(this.contractAddress, this.abi, signer);
  }

  /**
   * Wrap ETH to WETH
   */
  async wrapETH(amount: string): Promise<string> {
    try {
      const tx = await this.contract.deposit({ value: amount });
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      console.error('Failed to wrap ETH:', error);
      throw error;
    }
  }

  /**
   * Unwrap WETH to ETH
   */
  async unwrapWETH(amount: string): Promise<string> {
    try {
      const tx = await this.contract.withdraw(amount);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      console.error('Failed to unwrap WETH:', error);
      throw error;
    }
  }

  /**
   * Get WETH balance
   */
  async getBalance(address: string): Promise<string> {
    // Force fresh data by creating a new contract instance
    const provider = await this.signer.provider;
    if (!provider) throw new Error('No provider available');
    
    // Use a static call with blockTag 'latest' to ensure fresh data
    const freshContract = new ethers.Contract(this.contractAddress, this.abi, provider);
    const balance = await freshContract.balanceOf(address, { blockTag: 'latest' });
    
    // Also log for debugging
    console.log(`[WETHService] Fresh balance for ${address}: ${ethers.formatEther(balance)} WETH`);
    
    return balance;
  }

  /**
   * Check if user has sufficient WETH and allowance
   */
  async checkWETHReadiness(
    userAddress: string, 
    spender: string, 
    requiredAmount: string
  ): Promise<{
    hasEnoughWETH: boolean;
    hasApproval: boolean;
    wethBalance: string;
    allowance: string;
  }> {
    const [balance, allowance] = await Promise.all([
      this.contract.balanceOf(userAddress),
      this.contract.allowance(userAddress, spender)
    ]);

    return {
      hasEnoughWETH: balance >= BigInt(requiredAmount),
      hasApproval: allowance >= BigInt(requiredAmount),
      wethBalance: balance.toString(),
      allowance: allowance.toString()
    };
  }

  /**
   * Get WETH allowance
   */
  async getAllowance(owner: string, spender: string): Promise<bigint> {
    return await this.contract.allowance(owner, spender);
  }

  /**
   * Approve WETH spending
   */
  async approve(spender: string, amount: string): Promise<string> {
    try {
      const tx = await this.contract.approve(spender, amount);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      console.error('Failed to approve WETH:', error);
      throw error;
    }
  }

  /**
   * Get permit nonce for WETH
   */
  async getPermitNonce(owner: string): Promise<string> {
    const nonce = await this.contract.nonces(owner);
    return nonce.toString();
  }

  /**
   * Get WETH domain separator for permit
   */
  async getDomainSeparator(): Promise<string> {
    return await this.contract.DOMAIN_SEPARATOR();
  }

  /**
   * Create permit signature for WETH
   */
  async createPermitSignature(
    owner: string,
    spender: string,
    value: string,
    deadline: number
  ): Promise<{
    v: number;
    r: string;
    s: string;
  }> {
    const nonce = await this.getPermitNonce(owner);
    const chainId = await this.signer.provider!.getNetwork().then(n => n.chainId);
    
    // EIP-712 domain for WETH
    const domain = {
      name: 'Wrapped Ether',
      version: '1',
      chainId: Number(chainId),
      verifyingContract: CONTRACTS.ETHEREUM.WETH
    };

    // EIP-712 types for permit
    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const message = {
      owner,
      spender,
      value,
      nonce,
      deadline
    };

    const signature = await this.signer.signTypedData(domain, types, message);
    const sig = ethers.Signature.from(signature);
    
    return {
      v: sig.v,
      r: sig.r,
      s: sig.s
    };
  }
}