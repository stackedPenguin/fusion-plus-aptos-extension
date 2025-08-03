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
    
    // Generate hierarchical secrets where each is derived from the previous
    // This creates a chain: secret[i] = hash(secret[i-1] || nonce)
    const rootSecret = ethers.randomBytes(32);
    secrets.push(ethers.hexlify(rootSecret));
    
    for (let i = 1; i < secretCount; i++) {
      // Each secret is derived from the previous one
      const prevSecret = secrets[i - 1];
      const nonce = ethers.randomBytes(16);
      const combined = ethers.concat([prevSecret, nonce]);
      const childSecret = ethers.keccak256(combined);
      secrets.push(childSecret);
    }
    
    // Create fill thresholds (25%, 50%, 75%, 100% for 4 parts)
    const fillThresholds: number[] = [];
    for (let i = 1; i <= parts; i++) {
      fillThresholds.push((i * 100) / parts);
    }
    
    // Build simple Merkle tree structure for frontend
    // Create leaf nodes by hashing each secret
    const leaves = secrets.map(secret => ethers.keccak256(secret));
    
    // Build tree bottom-up
    const tree: string[][] = [leaves];
    let currentLevel = leaves;
    
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          // Hash pair of nodes
          const combined = ethers.concat([currentLevel[i], currentLevel[i + 1]]);
          nextLevel.push(ethers.keccak256(combined));
        } else {
          // Odd node, promote to next level
          nextLevel.push(currentLevel[i]);
        }
      }
      tree.push(nextLevel);
      currentLevel = nextLevel;
    }
    
    const merkleRoot = tree[tree.length - 1][0];
    
    // Generate proofs for each secret
    const merkleProofs: string[][] = [];
    for (let i = 0; i < secrets.length; i++) {
      const proof: string[] = [];
      let index = i;
      
      // Build proof from bottom to top
      for (let level = 0; level < tree.length - 1; level++) {
        const levelNodes = tree[level];
        const isRightNode = index % 2 === 1;
        const siblingIndex = isRightNode ? index - 1 : index + 1;
        
        if (siblingIndex < levelNodes.length) {
          proof.push(levelNodes[siblingIndex]);
        }
        
        index = Math.floor(index / 2);
      }
      
      merkleProofs.push(proof);
    }
    
    console.log('🌳 Generated Merkle tree for partial fills:');
    console.log(`   Root: ${merkleRoot}`);
    console.log(`   Secrets: ${secretCount} (for ${parts} parts)`);
    
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