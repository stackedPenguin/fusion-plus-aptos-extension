import { ethers } from 'ethers';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import dotenv from 'dotenv';

dotenv.config();

export interface ChainConfig {
  ethereum: {
    provider: ethers.Provider;
    signer: ethers.Wallet;
    escrowAddress: string;
  };
  aptos: {
    client: Aptos;
    escrowAddress: string;
    privateKey: string;
  };
}

export class ChainService {
  private ethereum: ChainConfig['ethereum'];
  private aptos: ChainConfig['aptos'];

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
    const aptosConfig = new AptosConfig({ 
      network: Network.TESTNET,
      fullnode: process.env.APTOS_NODE_URL
    });
    const aptosClient = new Aptos(aptosConfig);
    
    this.aptos = {
      client: aptosClient,
      escrowAddress: process.env.APTOS_ESCROW_ADDRESS!,
      privateKey: process.env.APTOS_PRIVATE_KEY!
    };
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
      'function createEscrow(bytes32 escrowId, address beneficiary, address token, uint256 amount, bytes32 hashlock, uint256 timelock) payable'
    ];
    
    const escrowContract = new ethers.Contract(
      this.ethereum.escrowAddress,
      escrowAbi,
      this.ethereum.signer
    );

    const tx = await escrowContract.createEscrow(
      escrowId,
      beneficiary,
      token,
      amount,
      hashlock,
      timelock,
      { value: safetyDeposit }
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  async withdrawEthereumEscrow(escrowId: string, secret: string): Promise<string> {
    const escrowAbi = [
      'function withdraw(bytes32 escrowId, bytes32 secret)'
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
    // TODO: Implement Aptos escrow creation
    // This will use the Aptos SDK to call the Move module
    console.log('Creating Aptos escrow...');
    return '0x' + Buffer.from(escrowId).toString('hex');
  }

  async withdrawAptosEscrow(escrowId: Uint8Array, secret: Uint8Array): Promise<string> {
    // TODO: Implement Aptos escrow withdrawal
    console.log('Withdrawing from Aptos escrow...');
    return '0x' + Buffer.from(escrowId).toString('hex');
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
    // TODO: Implement Aptos balance check
    return 0;
  }

  async approveTokenIfNeeded(token: string, spender: string, amount: string): Promise<void> {
    const erc20Abi = [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount)'
    ];
    
    const tokenContract = new ethers.Contract(token, erc20Abi, this.ethereum.signer);
    const currentAllowance = await tokenContract.allowance(
      this.ethereum.signer.address,
      spender
    );

    if (currentAllowance < BigInt(amount)) {
      const tx = await tokenContract.approve(spender, amount);
      await tx.wait();
    }
  }
}