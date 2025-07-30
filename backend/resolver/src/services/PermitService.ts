import { ethers } from 'ethers';

export class PermitService {
  private provider: ethers.Provider;
  private permitContract: ethers.Contract;
  private PERMIT_ABI = [
    {
      "inputs": [
        {"name": "owner", "type": "address"},
        {"name": "spender", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "deadline", "type": "uint256"},
        {"name": "v", "type": "uint8"},
        {"name": "r", "type": "bytes32"},
        {"name": "s", "type": "bytes32"},
        {"name": "token", "type": "address"},
        {"name": "to", "type": "address"}
      ],
      "name": "transferWithPermit",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{"name": "owner", "type": "address"}],
      "name": "getNonce",
      "outputs": [{"type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    }
  ];

  constructor(provider: ethers.Provider, permitAddress: string) {
    this.provider = provider;
    this.permitContract = new ethers.Contract(
      permitAddress,
      this.PERMIT_ABI,
      provider
    );
  }

  /**
   * Execute a transfer using a permit
   */
  async executePermitTransfer(
    permit: {
      owner: string;
      spender: string;
      value: string;
      deadline: number;
    },
    signature: string,
    token: string,
    to: string,
    signer: ethers.Signer
  ): Promise<string> {
    try {
      // Parse signature
      const sig = ethers.Signature.from(signature);
      
      // Connect contract with signer
      const permitWithSigner = this.permitContract.connect(signer);
      
      // Execute transfer with permit
      const tx = await (permitWithSigner as any).transferWithPermit(
        permit.owner,
        permit.spender,
        permit.value,
        permit.deadline,
        sig.v,
        sig.r,
        sig.s,
        token,
        to
      );
      
      console.log('Permit transfer transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('Permit transfer confirmed:', receipt.transactionHash);
      
      return receipt.transactionHash;
    } catch (error) {
      console.error('Failed to execute permit transfer:', error);
      throw error;
    }
  }

  /**
   * Get current nonce for an address
   */
  async getNonce(address: string): Promise<bigint> {
    return await this.permitContract.getNonce(address);
  }

  /**
   * Verify a permit signature
   */
  async verifyPermit(
    permit: {
      owner: string;
      spender: string;
      value: string;
      nonce: string;
      deadline: number;
    },
    signature: string,
    chainId: number
  ): Promise<boolean> {
    try {
      // EIP-712 domain
      const domain = {
        name: 'Fusion+ Cross-Chain Swap',
        version: '1',
        chainId: chainId,
        verifyingContract: await this.permitContract.getAddress()
      };

      // EIP-712 types
      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      };

      // Recover signer
      const recoveredAddress = ethers.verifyTypedData(
        domain,
        types,
        permit,
        signature
      );

      return recoveredAddress.toLowerCase() === permit.owner.toLowerCase();
    } catch (error) {
      console.error('Failed to verify permit:', error);
      return false;
    }
  }
}