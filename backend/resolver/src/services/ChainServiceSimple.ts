import { ethers } from 'ethers';
import { AptosChainServiceV2 } from './AptosChainServiceV2';
import dotenv from 'dotenv';

dotenv.config();

export class ChainServiceSimple {
  private ethereum: {
    provider: ethers.Provider;
    signer: ethers.Wallet;
    escrowAddress: string;
    layerZeroAdapter?: string;
  };
  private aptos: AptosChainServiceV2;

  constructor() {
    // Initialize Ethereum
    const ethProvider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const ethSigner = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY!, ethProvider);
    
    this.ethereum = {
      provider: ethProvider,
      signer: ethSigner,
      escrowAddress: process.env.ETHEREUM_ESCROW_ADDRESS!,
      layerZeroAdapter: process.env.LAYERZERO_ADAPTER_ADDRESS
    };

    // Initialize Aptos with SDK-based chain service
    try {
      this.aptos = new AptosChainServiceV2();
      console.log('✅ Aptos chain service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Aptos chain service:', error);
      throw error;
    }
  }

  async createEthereumEscrow(
    escrowId: string,
    beneficiary: string,
    token: string,
    amount: string,
    hashlock: string,
    timelock: number,
    safetyDeposit: string,
    depositor?: string // Optional depositor for createEscrowFor
  ): Promise<string> {
    console.log(`\n🔄 [ChainService] Creating Ethereum Escrow`);
    console.log(`   📋 Escrow ID: ${escrowId}`);
    console.log(`   👤 Beneficiary: ${beneficiary}`);
    console.log(`   🪙 Token: ${token === ethers.ZeroAddress ? 'ETH' : token}`);
    console.log(`   💰 Amount: ${ethers.formatEther(amount)} ${token === ethers.ZeroAddress ? 'ETH' : 'tokens'}`);
    const escrowAbi = [
      'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable',
      'function createEscrowFor(bytes32 _escrowId, address _depositor, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable'
    ];
    
    const escrowContract = new ethers.Contract(
      this.ethereum.escrowAddress, 
      escrowAbi, 
      this.ethereum.signer
    );

    // Log the address that will be paying for gas
    const signerAddress = await this.ethereum.signer.getAddress();
    const signerBalance = await this.ethereum.provider.getBalance(signerAddress);
    console.log(`\n💳 Escrow creation - Gas payer details:`);
    console.log(`   Address: ${signerAddress}`);
    console.log(`   Balance: ${ethers.formatEther(signerBalance)} ETH`);
    console.log(`   Safety deposit: ${ethers.formatEther(safetyDeposit)} ETH`);
    console.log(`   Token: ${token}`);
    console.log(`   Amount: ${token === ethers.ZeroAddress ? ethers.formatEther(amount) : amount}`);
    console.log(`   Depositor: ${depositor || 'N/A'}`);
    console.log(`   Beneficiary: ${beneficiary}`);

    let tx: any;
    if (depositor) {
      // Use createEscrowFor when depositor is specified (Fusion+ flow)
      if (token === ethers.ZeroAddress) {
        // ETH escrow
        const value = ethers.getBigInt(amount) + ethers.getBigInt(safetyDeposit);
        tx = await escrowContract.createEscrowFor(
          escrowId,
          depositor,
          beneficiary,
          token,
          amount,
          hashlock,
          timelock,
          { value }
        );
      } else {
        // ERC20 escrow - still needs safety deposit in ETH
        console.log(`   💰 Creating ERC20 escrow (createEscrowFor), safety deposit required`);
        try {
          tx = await escrowContract.createEscrowFor(
            escrowId,
            depositor,
            beneficiary,
            token,
            amount,
            hashlock,
            timelock,
            { value: safetyDeposit } // Safety deposit required even for ERC20
          );
        } catch (error: any) {
          console.error(`   ❌ Transaction failed:`, error.message);
          if (error.message.includes('insufficient funds')) {
            console.error(`   💸 Insufficient funds for gas payment`);
            console.error(`   💳 Signer address: ${signerAddress}`);
            console.error(`   💰 Signer balance: ${ethers.formatEther(signerBalance)} ETH`);
          }
          throw error;
        }
      }
    } else {
      // Use regular createEscrow when no depositor specified
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
        // ERC20 escrow - still needs safety deposit in ETH
        console.log(`   💰 Creating ERC20 escrow, safety deposit required`);
        try {
          // Get current gas price and add 20% buffer
          const feeData = await this.ethereum.provider.getFeeData();
          const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : undefined;
          console.log(`   ⛽ Gas price: ${gasPrice ? ethers.formatUnits(gasPrice, 'gwei') : 'auto'} gwei`);
          
          // Check resolver's balance
          const resolverBalance = await this.ethereum.provider.getBalance(this.ethereum.signer.address);
          console.log(`   💳 Resolver ETH balance: ${ethers.formatEther(resolverBalance)} ETH`);
          
          // Check if we have enough ETH for gas + safety deposit
          const estimatedGas = ethers.parseEther('0.01'); // Rough estimate
          const totalNeeded = ethers.getBigInt(safetyDeposit) + estimatedGas;
          
          if (resolverBalance < totalNeeded) {
            console.error(`   ❌ Insufficient ETH for gas + safety deposit`);
            console.error(`   💸 Need: ${ethers.formatEther(totalNeeded)} ETH`);
            console.error(`   💰 Have: ${ethers.formatEther(resolverBalance)} ETH`);
            throw new Error(`Insufficient ETH balance`);
          }
          
          // Check WETH balance of resolver
          if (token !== ethers.ZeroAddress) {
            const tokenAbi = ['function balanceOf(address) view returns (uint256)'];
            const tokenContract = new ethers.Contract(token, tokenAbi, this.ethereum.provider);
            const tokenBalance = await tokenContract.balanceOf(this.ethereum.signer.address);
            console.log(`   💎 Resolver token balance: ${ethers.formatEther(tokenBalance)} (${token})`);
            
            if (tokenBalance < ethers.getBigInt(amount)) {
              console.error(`   ❌ Insufficient token balance`);
              console.error(`   💸 Need: ${ethers.formatEther(amount)}`);
              console.error(`   💰 Have: ${ethers.formatEther(tokenBalance)}`);
              throw new Error(`Insufficient token balance`);
            }
          }
          
          console.log(`   📝 Transaction parameters:`);
          console.log(`      - escrowId: ${escrowId}`);
          console.log(`      - beneficiary: ${beneficiary}`);
          console.log(`      - token: ${token}`);
          console.log(`      - amount: ${ethers.formatEther(amount)}`);
          console.log(`      - hashlock: ${hashlock}`);
          console.log(`      - timelock: ${new Date(timelock * 1000).toISOString()}`);
          console.log(`      - value (safety deposit): ${ethers.formatEther(safetyDeposit)} ETH`);
          
          tx = await escrowContract.createEscrow(
            escrowId,
            beneficiary,
            token,
            amount,
            hashlock,
            timelock,
            { 
              value: safetyDeposit,
              gasPrice: gasPrice
            }
          );
          console.log(`   📤 Transaction sent! Hash: ${tx.hash}`);
          console.log(`   ⏳ Waiting for confirmation...`);
          
          // Start monitoring for confirmation
          const startTime = Date.now();
          let confirmed = false;
          const checkInterval = setInterval(async () => {
            try {
              const receipt = await this.ethereum.provider.getTransactionReceipt(tx.hash);
              if (receipt) {
                clearInterval(checkInterval);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`   ✅ Transaction confirmed after ${elapsed}s`);
                console.log(`   ⛽ Gas used: ${receipt.gasUsed.toString()}`);
                console.log(`   📦 Block: ${receipt.blockNumber}`);
                confirmed = true;
              }
            } catch (e) {
              // Ignore errors during polling
            }
          }, 3000);
          
          // Timeout after 2 minutes
          setTimeout(() => {
            if (!confirmed) {
              clearInterval(checkInterval);
              console.log(`   ⚠️ Transaction confirmation timeout after 2 minutes`);
            }
          }, 120000);
        } catch (error: any) {
          console.error(`   ❌ Transaction failed:`, error.message);
          if (error.message.includes('insufficient funds')) {
            console.error(`   💸 Insufficient funds for gas payment`);
            console.error(`   💳 Signer address: ${signerAddress}`);
            console.error(`   💰 Signer balance: ${ethers.formatEther(signerBalance)} ETH`);
          }
          throw error;
        }
      }
    }

    console.log(`   ⏳ Waiting for transaction receipt...`);
    const receiptStartTime = Date.now();
    
    try {
      const receipt = await tx.wait();
      const elapsed = ((Date.now() - receiptStartTime) / 1000).toFixed(1);
      console.log(`   ✅ Transaction confirmed after ${elapsed}s!`);
      console.log(`   ⛽ Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`   📦 Block number: ${receipt.blockNumber}`);
      console.log(`   ✨ Escrow created successfully!`);
      return receipt.hash;
    } catch (error: any) {
      console.error(`   ❌ Transaction failed during confirmation:`, error.message);
      throw error;
    }
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

  async withdrawGaslessEscrow(escrowId: string, secret: string): Promise<string> {
    const gaslessEscrowAddress = process.env.ETHEREUM_GASLESS_ESCROW_ADDRESS;
    if (!gaslessEscrowAddress) {
      throw new Error('Gasless escrow contract address not configured');
    }

    const gaslessEscrowAbi = [
      'function withdraw(bytes32 _escrowId, bytes32 _secret)'
    ];
    
    const gaslessEscrowContract = new ethers.Contract(
      gaslessEscrowAddress,
      gaslessEscrowAbi, 
      this.ethereum.signer
    );

    console.log(`   🏦 Withdrawing from gasless escrow contract: ${gaslessEscrowAddress}`);
    console.log(`   🆔 Escrow ID: ${escrowId}`);
    
    const tx = await gaslessEscrowContract.withdraw(escrowId, secret);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async createEthereumEscrowFor(
    escrowId: string,
    depositor: string,
    beneficiary: string,
    token: string,
    amount: string,
    hashlock: string,
    timelock: number
  ): Promise<string> {
    const escrowAbi = [
      'function createEscrowFor(bytes32 _escrowId, address _depositor, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable'
    ];
    
    const escrowContract = new ethers.Contract(
      this.ethereum.escrowAddress, 
      escrowAbi, 
      this.ethereum.signer
    );

    // Calculate safety deposit (0.001 ETH)
    const safetyDeposit = ethers.parseEther('0.001');

    const tx = await escrowContract.createEscrowFor(
      escrowId,
      depositor,
      beneficiary,
      token,
      amount,
      hashlock,
      timelock,
      { value: safetyDeposit } // Safety deposit required
    );

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

  get aptosChainService(): AptosChainServiceV2 {
    return this.aptos;
  }

  async getAptosBalance(address: string): Promise<number> {
    const balance = await this.aptos.getBalance(address);
    return parseInt(balance);
  }

  async sendCrossChainSecretReveal(
    destinationChainId: number,
    escrowId: string,
    secret: Uint8Array
  ): Promise<string | null> {
    if (!this.ethereum.layerZeroAdapter) {
      console.log('LayerZero adapter not configured, skipping cross-chain reveal');
      return null;
    }

    try {
      const adapterAbi = [
        'function sendSecretReveal(uint32 _dstEid, bytes32 _escrowId, bytes32 _secret) payable'
      ];
      
      const adapter = new ethers.Contract(
        this.ethereum.layerZeroAdapter,
        adapterAbi,
        this.ethereum.signer
      );

      // Map chain to LayerZero endpoint ID
      const endpointIds: { [key: string]: number } = {
        'APTOS': 10108, // Aptos testnet
        'ETHEREUM': 10161 // Sepolia
      };

      const dstEid = endpointIds[destinationChainId.toString()] || destinationChainId;
      
      console.log(`Sending cross-chain secret reveal to chain ${dstEid}...`);
      
      const tx = await adapter.sendSecretReveal(
        dstEid,
        ethers.hexlify(escrowId),
        ethers.hexlify(secret),
        { value: ethers.parseEther('0.0001') } // Small fee for LayerZero
      );

      await tx.wait();
      console.log(`Cross-chain secret reveal sent: ${tx.hash}`);
      
      return tx.hash;
    } catch (error) {
      console.error('Failed to send cross-chain secret reveal:', error);
      return null;
    }
  }

  getAptosAccount(): any {
    return this.aptos.account;
  }

  async submitMultiAgentTransaction(
    rawTxn: any,
    userSignature: any,
    feePayerSignature: any
  ): Promise<any> {
    return this.aptos.aptos.transaction.submit.multiAgent({
      transaction: rawTxn,
      senderAuthenticator: userSignature,
      additionalSignersAuthenticators: [],
      feePayerAuthenticator: feePayerSignature
    });
  }
}