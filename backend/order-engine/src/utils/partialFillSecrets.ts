import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';

export interface PartialFillSecrets {
  merkleRoot: string;
  secrets: string[];
  merkleProofs: string[][];
  fillThresholds: number[];
}

export class PartialFillSecretsManager {
  /**
   * Generate secrets and Merkle tree for partial fills
   * @param parts Number of parts to split order (default: 4 for 25% each)
   * @returns PartialFillSecrets object with tree data
   */
  static generateSecrets(parts: number = 4): PartialFillSecrets {
    // Generate N+1 secrets as per whitepaper
    const secretCount = parts + 1;
    const secrets: string[] = [];
    
    for (let i = 0; i < secretCount; i++) {
      // Generate random 32-byte secret
      const randomBytes = ethers.randomBytes(32);
      secrets.push(ethers.hexlify(randomBytes));
    }
    
    // Create fill thresholds (25%, 50%, 75%, 100% for 4 parts)
    const fillThresholds: number[] = [];
    for (let i = 1; i <= parts; i++) {
      fillThresholds.push((i * 100) / parts);
    }
    
    // Create Merkle tree from secret hashes
    const secretHashes = secrets.map(secret => ethers.keccak256(secret));
    const merkleTree = new MerkleTree(secretHashes, ethers.keccak256, {
      sortPairs: true,
      hashLeaves: false // Already hashed
    });
    
    // Generate proofs for each secret
    const merkleProofs: string[][] = [];
    for (let i = 0; i < secrets.length; i++) {
      const proof = merkleTree.getHexProof(secretHashes[i]);
      merkleProofs.push(proof);
    }
    
    return {
      merkleRoot: merkleTree.getHexRoot(),
      secrets,
      merkleProofs,
      fillThresholds
    };
  }
  
  /**
   * Determine which secret index to use for a given fill percentage
   * @param cumulativeFillPercentage Total fill percentage including this fill
   * @param fillThresholds Array of threshold percentages
   * @returns Index of secret to use
   */
  static getSecretIndex(
    cumulativeFillPercentage: number, 
    fillThresholds: number[]
  ): number {
    for (let i = 0; i < fillThresholds.length; i++) {
      if (cumulativeFillPercentage <= fillThresholds[i]) {
        return i;
      }
    }
    // If exceeds all thresholds, use the last secret (N+1)
    return fillThresholds.length;
  }
  
  /**
   * Verify a secret and its Merkle proof
   * @param secret The secret to verify
   * @param merkleRoot Root of the Merkle tree
   * @param proof Merkle proof for the secret
   * @returns True if secret is valid
   */
  static verifySecret(
    secret: string,
    merkleRoot: string,
    proof: string[]
  ): boolean {
    const secretHash = ethers.keccak256(secret);
    const merkleTree = new MerkleTree([], ethers.keccak256, {
      sortPairs: true,
      hashLeaves: false
    });
    
    return merkleTree.verify(proof, secretHash, merkleRoot);
  }
  
  /**
   * Get the appropriate secret for a partial fill
   * @param secrets Array of all secrets
   * @param currentFillPercentage Current filled percentage
   * @param newFillPercentage New fill amount to add
   * @param fillThresholds Array of threshold percentages
   * @returns Object with secret and its index
   */
  static getSecretForFill(
    secrets: string[],
    currentFillPercentage: number,
    newFillPercentage: number,
    fillThresholds: number[]
  ): { secret: string; index: number } {
    const cumulativeFill = currentFillPercentage + newFillPercentage;
    const secretIndex = this.getSecretIndex(cumulativeFill, fillThresholds);
    
    return {
      secret: secrets[secretIndex],
      index: secretIndex
    };
  }
  
  /**
   * Calculate partial escrow amount based on fill percentage
   * @param totalAmount Total order amount
   * @param fillPercentage Percentage to fill (0-100)
   * @returns Partial amount as string
   */
  static calculatePartialAmount(
    totalAmount: string,
    fillPercentage: number
  ): string {
    const total = ethers.getBigInt(totalAmount);
    const partial = (total * BigInt(Math.floor(fillPercentage * 100))) / BigInt(10000);
    return partial.toString();
  }
  
  /**
   * Generate partial escrow ID for a specific fill
   * @param baseOrderId Original order ID
   * @param fillIndex Index of this partial fill
   * @returns Unique escrow ID for this partial fill
   */
  static generatePartialEscrowId(
    baseOrderId: string,
    fillIndex: number
  ): string {
    return ethers.id(`${baseOrderId}-partial-${fillIndex}`);
  }
}

// Export utility functions for backwards compatibility
export const {
  generateSecrets,
  getSecretIndex,
  verifySecret,
  getSecretForFill,
  calculatePartialAmount,
  generatePartialEscrowId
} = PartialFillSecretsManager;