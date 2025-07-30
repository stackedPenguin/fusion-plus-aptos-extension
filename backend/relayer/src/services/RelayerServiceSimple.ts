import { ethers } from 'ethers';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

interface RelayRequest {
  chain: 'ETHEREUM' | 'APTOS';
  type: 'CREATE_ESCROW' | 'WITHDRAW_ESCROW';
  params: any;
  signature: string;
  nonce: string;
}

export class RelayerServiceSimple {
  private ethereumProvider: ethers.Provider;
  private ethereumWallet: ethers.Wallet;
  private app: express.Application;
  private port: number;
  
  // Track nonces to prevent replay attacks
  private usedNonces: Set<string> = new Set();

  constructor() {
    // Initialize Ethereum connection
    this.ethereumProvider = new ethers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
    );
    
    // Use a test private key if none provided
    const privateKey = process.env.RELAYER_PRIVATE_KEY_ETH || 
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    
    this.ethereumWallet = new ethers.Wallet(
      privateKey,
      this.ethereumProvider
    );

    // Initialize Express server
    this.app = express();
    this.app.use(express.json());
    this.port = parseInt(process.env.RELAYER_PORT || '3003');

    this.setupRoutes();
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', relayer: 'active' });
    });

    // Submit relay request
    this.app.post('/relay', async (req, res) => {
      try {
        const request: RelayRequest = req.body;
        
        // Validate request
        if (!this.validateRequest(request)) {
          return res.status(400).json({ error: 'Invalid request' });
        }

        // Check nonce
        if (this.usedNonces.has(request.nonce)) {
          return res.status(400).json({ error: 'Nonce already used' });
        }

        // For now, only support Ethereum
        if (request.chain !== 'ETHEREUM') {
          return res.status(400).json({ error: 'Only Ethereum supported in simple mode' });
        }

        // Execute relay based on request type
        const txHash = await this.executeRelay(request);
        
        // Mark nonce as used
        this.usedNonces.add(request.nonce);

        res.json({ 
          success: true, 
          txHash,
          message: 'Transaction relayed successfully'
        });

      } catch (error: any) {
        console.error('Relay error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get relayer info
    this.app.get('/info', (req, res) => {
      res.json({
        ethereumAddress: this.ethereumWallet.address,
        aptosAddress: process.env.RELAYER_ADDRESS_APTOS || 'Not configured',
        supportedChains: ['ETHEREUM'],
        supportedActions: ['CREATE_ESCROW', 'WITHDRAW_ESCROW']
      });
    });
  }

  private validateRequest(request: RelayRequest): boolean {
    // Basic validation
    if (!request.chain || !request.type || !request.params || !request.signature || !request.nonce) {
      return false;
    }

    // TODO: Implement proper signature verification
    // For development, accept any request
    
    return true;
  }

  private async executeRelay(request: RelayRequest): Promise<string> {
    console.log(`Executing relay: ${request.type} on ${request.chain}`);

    switch (request.type) {
      case 'CREATE_ESCROW':
        return await this.relayCreateEscrow(request);
      
      case 'WITHDRAW_ESCROW':
        return await this.relayWithdrawEscrow(request);
      
      default:
        throw new Error(`Unsupported relay type: ${request.type}`);
    }
  }

  private async relayCreateEscrow(request: RelayRequest): Promise<string> {
    const { params } = request;

    // Deploy escrow contract interaction
    const escrowAddress = process.env.ETHEREUM_ESCROW_ADDRESS!;
    const escrowAbi = [
      'function createEscrow(bytes32 _escrowId, address _beneficiary, address _token, uint256 _amount, bytes32 _hashlock, uint256 _timelock) payable'
    ];

    const escrowContract = new ethers.Contract(escrowAddress, escrowAbi, this.ethereumWallet);
    
    // Calculate total value (amount + safety deposit for ETH)
    const value = params.token === ethers.ZeroAddress 
      ? ethers.getBigInt(params.amount) + ethers.getBigInt(params.safetyDeposit || '0')
      : 0;

    const tx = await escrowContract.createEscrow(
      params.escrowId,
      params.beneficiary,
      params.token,
      params.amount,
      params.hashlock,
      params.timelock,
      { value }
    );

    await tx.wait();
    console.log(`Ethereum escrow created: ${tx.hash}`);
    return tx.hash;
  }

  private async relayWithdrawEscrow(request: RelayRequest): Promise<string> {
    const { params } = request;

    const escrowAddress = process.env.ETHEREUM_ESCROW_ADDRESS!;
    const escrowAbi = [
      'function withdraw(bytes32 _escrowId, bytes32 _secret)'
    ];

    const escrowContract = new ethers.Contract(escrowAddress, escrowAbi, this.ethereumWallet);
    
    const tx = await escrowContract.withdraw(
      params.escrowId,
      params.secret
    );

    await tx.wait();
    console.log(`Ethereum escrow withdrawn: ${tx.hash}`);
    return tx.hash;
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`Relayer service (simple mode) listening on port ${this.port}`);
      console.log(`Ethereum relayer address: ${this.ethereumWallet.address}`);
      console.log(`Note: Aptos support temporarily disabled due to SDK issues`);
    });
  }

  stop() {
    // Cleanup if needed
  }
}