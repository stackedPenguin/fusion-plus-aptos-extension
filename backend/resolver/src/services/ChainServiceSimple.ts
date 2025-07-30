import { ethers } from 'ethers';
import { AptosChainService } from './AptosChainService';
import dotenv from 'dotenv';

dotenv.config();

export class ChainServiceSimple {
  private ethereum: {
    provider: ethers.Provider;
    signer: ethers.Wallet;
    escrowAddress: string;
  };
  private aptos: AptosChainService;

  constructor() {
    // Initialize Ethereum
    const ethProvider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const ethSigner = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY!, ethProvider);
    
    this.ethereum = {
      provider: ethProvider,
      signer: ethSigner,
      escrowAddress: process.env.ETHEREUM_ESCROW_ADDRESS!
    };

    // Initialize Aptos
    this.aptos = new AptosChainService();
  }

  async createEthereumEscrow(
    escrowId: string,
    beneficiary: string,
    token: string,
    amount: string,
    hashlock: string,
    timelock: number,
    safetyDeposit: string
  ): Promise<string> {
    const escrowAbi = [
      'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable'
    ];
    
    const escrowContract = new ethers.Contract(
      this.ethereum.escrowAddress, 
      escrowAbi, 
      this.ethereum.signer
    );

    let tx;
    if (token === ethers.ZeroAddress) {
      // ETH escrow
      const value = ethers.getBigInt(amount) + ethers.getBigInt(safetyDeposit);
      tx = await escrowContract.createEscrow(
        escrowId,
        beneficiary,
        token,
        amount,
        hashlock,
        timelock,
        { value }
      );
    } else {
      // ERC20 escrow
      tx = await escrowContract.createEscrow(
        escrowId,
        beneficiary,
        token,
        amount,
        hashlock,
        timelock
      );
    }

    const receipt = await tx.wait();
    return receipt.hash;
  }

  async withdrawEthereumEscrow(escrowId: string, secret: string): Promise<string> {
    const escrowAbi = [
      'function withdraw(bytes32 _escrowId, bytes32 _secret)'
    ];
    
    const escrowContract = new ethers.Contract(
      this.ethereum.escrowAddress, 
      escrowAbi, 
      this.ethereum.signer
    );

    const tx = await escrowContract.withdraw(escrowId, secret);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async createAptosEscrow(
    escrowId: Uint8Array,
    beneficiary: string,
    amount: string,
    hashlock: Uint8Array,
    timelock: number,
    safetyDeposit: string
  ): Promise<string> {
    return this.aptos.createEscrow(escrowId, beneficiary, amount, hashlock, timelock, safetyDeposit);
  }

  async withdrawAptosEscrow(escrowId: Uint8Array, secret: Uint8Array): Promise<string> {
    return this.aptos.withdrawEscrow(escrowId, secret);
  }

  async getEthereumBalance(address: string, token?: string): Promise<bigint> {
    if (!token || token === ethers.ZeroAddress) {
      return await this.ethereum.provider.getBalance(address);
    } else {
      const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
      const tokenContract = new ethers.Contract(token, erc20Abi, this.ethereum.provider);
      return await tokenContract.balanceOf(address);
    }
  }

  async getAptosBalance(address: string): Promise<number> {
    const balance = await this.aptos.getBalance(address);
    return parseInt(balance);
  }
}