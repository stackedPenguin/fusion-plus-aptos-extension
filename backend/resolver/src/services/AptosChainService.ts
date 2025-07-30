import axios from 'axios';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import * as nacl from 'tweetnacl';

dotenv.config();

export class AptosChainService {
  private aptosNodeUrl: string;
  private escrowAddress: string;
  private privateKeyHex: string;
  private publicKeyHex: string;
  private address: string;

  constructor() {
    this.aptosNodeUrl = process.env.APTOS_NODE_URL || 'https://fullnode.testnet.aptoslabs.com';
    this.escrowAddress = process.env.APTOS_ESCROW_MODULE || '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0::escrow';
    
    // Parse private key and derive public key
    const rawPrivateKey = process.env.APTOS_PRIVATE_KEY!;
    console.log('Raw private key format:', rawPrivateKey.substring(0, 20) + '...');
    
    // Remove prefix and 0x
    const cleanKey = rawPrivateKey
      .replace('ed25519-priv-', '')
      .replace('0x', '');
    
    console.log('Clean key hex length:', cleanKey.length);
    
    // Check if this is a 64-byte key (32-byte private + 32-byte public)
    if (cleanKey.length === 128) {
      // Use only the first 32 bytes as the private key seed
      this.privateKeyHex = cleanKey.substring(0, 64);
      console.log('Using first 32 bytes as seed');
    } else if (cleanKey.length === 64) {
      // This is already a 32-byte key
      this.privateKeyHex = cleanKey;
    } else {
      throw new Error(`Invalid private key length: ${cleanKey.length}. Expected 64 or 128 hex characters.`);
    }
    
    const privateKeyBytes = Buffer.from(this.privateKeyHex, 'hex');
    console.log('Private key seed bytes length:', privateKeyBytes.length);
    
    // Generate key pair from 32-byte seed
    const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
    
    this.publicKeyHex = '0x' + Buffer.from(keyPair.publicKey).toString('hex');
    this.address = process.env.APTOS_RESOLVER_ADDRESS!;
    
    // Store the full secret key (64 bytes: private + public) for signing
    this.privateKeyHex = Buffer.from(keyPair.secretKey).toString('hex');
    
    console.log('Public key:', this.publicKeyHex);
    console.log('Address:', this.address);
  }

  async createEscrow(
    escrowId: Uint8Array,
    beneficiary: string,
    amount: string,
    hashlock: Uint8Array,
    timelock: number,
    safetyDeposit: string
  ): Promise<string> {
    try {
      console.log('Creating Aptos escrow...');
      
      // Get sequence number
      const account = await this.getAccount();
      const sequenceNumber = account.sequence_number;
      
      // Create transaction payload
      const payload = {
        type: 'entry_function_payload',
        function: `${this.escrowAddress}::escrow::create_escrow`,
        type_arguments: [],
        arguments: [
          Array.from(escrowId),
          beneficiary,
          amount,
          Array.from(hashlock),
          timelock.toString()
        ]
      };

      // Create raw transaction
      const expirationTime = Math.floor(Date.now() / 1000) + 600; // 10 minutes
      const rawTxn = {
        sender: this.address,
        sequence_number: sequenceNumber,
        max_gas_amount: '100000',
        gas_unit_price: '100',
        expiration_timestamp_secs: expirationTime.toString(),
        payload: payload,
        chain_id: 2 // Testnet
      };

      // Generate signing message
      const signingMessage = await this.generateSigningMessage(rawTxn);
      
      // Sign transaction
      const signature = this.signTransaction(signingMessage);
      
      // Submit transaction
      const signedTxn = {
        ...rawTxn,
        signature: {
          type: 'ed25519_signature',
          public_key: this.publicKeyHex,
          signature: signature
        }
      };

      const response = await axios.post(
        `${this.aptosNodeUrl}/v1/transactions`,
        signedTxn,
        { headers: { 'Content-Type': 'application/json' } }
      );

      const txHash = response.data.hash;
      console.log(`Aptos escrow created: ${txHash}`);
      
      // Wait for transaction confirmation
      await this.waitForTransaction(txHash);
      
      return txHash;
    } catch (error: any) {
      console.error('Failed to create Aptos escrow:', error.response?.data || error.message);
      throw error;
    }
  }

  async withdrawEscrow(escrowId: Uint8Array, secret: Uint8Array): Promise<string> {
    try {
      console.log('Withdrawing from Aptos escrow...');
      
      const account = await this.getAccount();
      const sequenceNumber = account.sequence_number;
      
      const payload = {
        type: 'entry_function_payload',
        function: `${this.escrowAddress}::escrow::withdraw`,
        type_arguments: [],
        arguments: [
          Array.from(escrowId),
          Array.from(secret)
        ]
      };

      const expirationTime = Math.floor(Date.now() / 1000) + 600;
      const rawTxn = {
        sender: this.address,
        sequence_number: sequenceNumber,
        max_gas_amount: '100000',
        gas_unit_price: '100',
        expiration_timestamp_secs: expirationTime.toString(),
        payload: payload,
        chain_id: 2
      };

      const signingMessage = await this.generateSigningMessage(rawTxn);
      const signature = this.signTransaction(signingMessage);
      
      const signedTxn = {
        ...rawTxn,
        signature: {
          type: 'ed25519_signature',
          public_key: this.publicKeyHex,
          signature: signature
        }
      };

      const response = await axios.post(
        `${this.aptosNodeUrl}/v1/transactions`,
        signedTxn,
        { headers: { 'Content-Type': 'application/json' } }
      );

      const txHash = response.data.hash;
      console.log(`Aptos escrow withdrawn: ${txHash}`);
      
      await this.waitForTransaction(txHash);
      
      return txHash;
    } catch (error: any) {
      console.error('Failed to withdraw from Aptos escrow:', error.response?.data || error.message);
      throw error;
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.aptosNodeUrl}/v1/view`,
        {
          function: '0x1::coin::balance',
          type_arguments: ['0x1::aptos_coin::AptosCoin'],
          arguments: [address]
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      return response.data[0] || '0';
    } catch (error) {
      console.error('Failed to get Aptos balance:', error);
      return '0';
    }
  }

  private async getAccount() {
    const response = await axios.get(
      `${this.aptosNodeUrl}/v1/accounts/${this.address}`
    );
    return response.data;
  }

  private async generateSigningMessage(rawTxn: any): Promise<Uint8Array> {
    // Simplified BCS encoding for the signing message
    // In production, use proper BCS encoding library
    const encoder = new TextEncoder();
    
    // Create a simplified signing message
    const message = `${rawTxn.chain_id}::${rawTxn.sender}::${rawTxn.sequence_number}::${rawTxn.expiration_timestamp_secs}`;
    
    return encoder.encode(message);
  }

  private signTransaction(message: Uint8Array): string {
    const privateKeyBytes = Buffer.from(this.privateKeyHex, 'hex');
    const signature = nacl.sign.detached(message, privateKeyBytes);
    return '0x' + Buffer.from(signature).toString('hex');
  }

  private async waitForTransaction(txHash: string, timeout = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(
          `${this.aptosNodeUrl}/v1/transactions/by_hash/${txHash}`
        );
        
        if (response.data.success !== undefined) {
          if (!response.data.success) {
            throw new Error(`Transaction failed: ${response.data.vm_status}`);
          }
          return;
        }
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw error;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Transaction confirmation timeout');
  }
}