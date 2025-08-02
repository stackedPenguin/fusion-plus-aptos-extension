import { ethers } from 'ethers';

// Simple implementation for frontend - in production you'd want to use a proper Merkle tree library
export interface PartialFillSecrets {
  merkleRoot: string;
  secrets: string[];
  merkleProofs: string[][];
  fillThresholds: number[];
}

export class PartialFillSecretsManager {
  /**
   * Generate secrets for partial fills (simplified version for frontend)
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
    
    // Simple mock implementation for demo - in production use proper Merkle tree
    const secretHashes = secrets.map(secret => ethers.keccak256(secret));
    const merkleRoot = ethers.keccak256(ethers.concat(secretHashes));
    
    // Mock proofs for demo
    const merkleProofs: string[][] = secrets.map((_, i) => [
      ethers.keccak256(ethers.toUtf8Bytes(`proof_${i}_0`)),
      ethers.keccak256(ethers.toUtf8Bytes(`proof_${i}_1`))
    ]);
    
    return {
      merkleRoot,
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
  calculatePartialAmount,
  generatePartialEscrowId
} = PartialFillSecretsManager;