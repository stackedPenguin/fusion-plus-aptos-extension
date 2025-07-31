import { 
  Account, 
  Aptos, 
  AptosConfig, 
  Network,
  Ed25519PrivateKey,
  AccountAddress,
  U64,
  U8,
  Hex
} from '@aptos-labs/ts-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

export class AptosChainServiceV2 {
  public aptos: Aptos;
  public account: Account;
  private escrowAddress: string;

  constructor() {
    // Initialize Aptos client for testnet
    const config = new AptosConfig({ network: Network.TESTNET });
    this.aptos = new Aptos(config);
    
    // Parse escrow module address
    this.escrowAddress = process.env.APTOS_ESCROW_MODULE || '0x38ddbe7b5d233e541d2e37490a40af10b8586acc7c7ccd142262c8cd6784bac0';
    
    // Parse private key
    const rawPrivateKey = process.env.APTOS_PRIVATE_KEY!;
    const cleanKey = rawPrivateKey
      .replace('ed25519-priv-', '')
      .replace('0x', '');
    
    // Handle both 32-byte and 64-byte formats
    let privateKeyHex: string;
    if (cleanKey.length === 128) {
      // Use only the first 32 bytes as the private key
      privateKeyHex = cleanKey.substring(0, 64);
    } else if (cleanKey.length === 64) {
      privateKeyHex = cleanKey;
    } else {
      throw new Error(`Invalid private key length: ${cleanKey.length}`);
    }
    
    // Create account from private key
    const privateKey = new Ed25519PrivateKey(privateKeyHex);
    this.account = Account.fromPrivateKey({ privateKey });
    
    console.log('Account address:', this.account.accountAddress.toString());
    console.log('Resolver address from env:', process.env.APTOS_RESOLVER_ADDRESS);
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
      console.log('Creating Aptos escrow with official SDK...');
      
      // Build the transaction
      const transaction = await this.aptos.transaction.build.simple({
        sender: this.account.accountAddress,
        data: {
          function: `${this.escrowAddress}::escrow::create_escrow`,
          typeArguments: [],
          functionArguments: [
            Array.from(escrowId),
            AccountAddress.fromString(beneficiary),
            new U64(BigInt(amount)),
            Array.from(hashlock),
            new U64(BigInt(timelock)),
            new U64(BigInt(safetyDeposit))
          ],
        },
      });

      // Sign the transaction
      const senderAuthenticator = this.aptos.transaction.sign({
        signer: this.account,
        transaction,
      });

      // Submit the transaction
      const pendingTransaction = await this.aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator,
      });

      console.log(`Aptos escrow transaction submitted: ${pendingTransaction.hash}`);
      
      // Wait for transaction confirmation
      const executedTransaction = await this.aptos.waitForTransaction({
        transactionHash: pendingTransaction.hash
      });
      
      if (!executedTransaction.success) {
        throw new Error(`Transaction failed: ${executedTransaction.vm_status}`);
      }
      
      console.log(`Aptos escrow created successfully: ${pendingTransaction.hash}`);
      return pendingTransaction.hash;
      
    } catch (error: any) {
      console.error('Failed to create Aptos escrow:', error.message || error);
      throw error;
    }
  }

  async withdrawEscrow(escrowId: Uint8Array, secret: Uint8Array): Promise<string> {
    try {
      console.log('Withdrawing from Aptos escrow...');
      console.log('  Escrow ID:', ethers.hexlify(escrowId));
      console.log('  Secret:', ethers.hexlify(secret));
      console.log('  Secret length:', secret.length);
      
      // First check if the escrow exists
      try {
        const escrowExists = await this.aptos.view({
          payload: {
            function: `${this.escrowAddress}::escrow::escrow_exists`,
            typeArguments: [],
            functionArguments: [Array.from(escrowId)]
          }
        });
        console.log('  Escrow exists check:', escrowExists);
      } catch (checkError) {
        console.log('  Failed to check escrow existence:', checkError);
      }
      
      // Submit with retry on sequence number conflicts
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          // Refresh account info to get latest sequence number
          const accountInfo = await this.aptos.account.getAccountInfo({
            accountAddress: this.account.accountAddress
          });
          console.log(`  Current sequence number: ${accountInfo.sequence_number}`);
          
          // Build the transaction fresh each time to get updated sequence number
          const transaction = await this.aptos.transaction.build.simple({
            sender: this.account.accountAddress,
            data: {
              function: `${this.escrowAddress}::escrow::withdraw`,
              typeArguments: [],
              functionArguments: [
                Array.from(escrowId),
                Array.from(secret)
              ],
            },
            options: {
              accountSequenceNumber: BigInt(accountInfo.sequence_number)
            }
          });

          // Sign the transaction
          const senderAuthenticator = this.aptos.transaction.sign({
            signer: this.account,
            transaction,
          });

          // Submit the transaction
          const pendingTransaction = await this.aptos.transaction.submit.simple({
            transaction,
            senderAuthenticator,
          });

          console.log(`Aptos withdrawal transaction submitted: ${pendingTransaction.hash}`);
          
          // Wait for transaction confirmation with retries
          let executedTransaction;
          let retries = 0;
          const maxRetries = 10;
          
          while (retries < maxRetries) {
            try {
              executedTransaction = await this.aptos.waitForTransaction({
                transactionHash: pendingTransaction.hash,
                options: {
                  timeoutSecs: 30,
                  checkSuccess: false
                }
              });
              break;
            } catch (error: any) {
              if (error.message?.includes('transaction_not_found') && retries < maxRetries - 1) {
                console.log(`   ⏳ Transaction not found yet, retrying in 2 seconds... (${retries + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                retries++;
              } else {
                throw error;
              }
            }
          }
          
          if (!executedTransaction) {
            throw new Error('Transaction confirmation timeout');
          }
          
          if (!executedTransaction.success) {
            throw new Error(`Transaction failed: ${executedTransaction.vm_status}`);
          }
          
          console.log(`Aptos withdrawal successful: ${pendingTransaction.hash}`);
          return pendingTransaction.hash;
          
        } catch (error: any) {
          // Handle sequence number conflicts
          if (error.message?.includes('Transaction already in mempool') && attempts < maxAttempts - 1) {
            console.log(`   ⚠️ Sequence number conflict, waiting before retry... (${attempts + 1}/${maxAttempts})`);
            // Wait for the conflicting transaction to clear
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
            continue;
          }
          throw error;
        }
      }
      
      throw new Error('Failed to submit transaction after all attempts');
      
    } catch (error: any) {
      console.error('Failed to withdraw from Aptos escrow:', error.message || error);
      throw error;
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.aptos.getAccountCoinAmount({
        accountAddress: address,
        coinType: '0x1::aptos_coin::AptosCoin'
      });
      
      return balance.toString();
    } catch (error) {
      console.error('Failed to get Aptos balance:', error);
      return '0';
    }
  }
}