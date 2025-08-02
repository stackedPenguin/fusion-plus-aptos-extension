# Partial Fill Implementation Design

## Overview
Implementation of Fusion+ partial fills using Merkle tree of secrets as specified in the whitepaper.

## Key Requirements from Whitepaper

1. **Merkle Tree Structure**: Split order into N equal parts with N+1 secrets
2. **Fill Percentage Mapping**: Secret index corresponds to cumulative fill percentage
3. **Multiple Resolvers**: Different resolvers can fill different portions
4. **Sequential Completion**: Next resolver must complete leftover + at least one new piece
5. **Secret Management**: Prevent premature secret exposure while allowing partial reveals

## Implementation Design

### 1. Secret Generation
```typescript
interface PartialFillSecrets {
  merkleRoot: string;          // Root of secrets Merkle tree
  secrets: string[];           // Array of N+1 secrets
  merkleProofs: string[][];    // Proofs for each secret
  fillThresholds: number[];    // [25, 50, 75, 100] for 4-part split
}
```

### 2. Order Schema Updates
```typescript
interface PartialFillOrder extends Order {
  partialFillAllowed: true;
  maxParts: number;            // Default: 4 (25% each)
  fillThresholds: number[];    // [25, 50, 75, 100]
  merkleRoot: string;          // Root of secrets tree
  currentFillPercentage: number; // Track progress
  fills: PartialFill[];        // Array of completed fills
}

interface PartialFill {
  resolver: string;
  fillPercentage: number;      // New fill amount
  cumulativePercentage: number; // Total filled so far
  secretIndex: number;         // Which secret was used
  txHash: string;
  timestamp: number;
}
```

### 3. Resolver Logic
```typescript
class PartialFillResolver {
  async fillOrder(
    orderId: string, 
    desiredFillPercentage: number
  ) {
    const order = await this.getOrder(orderId);
    const currentFill = order.currentFillPercentage;
    const newCumulative = currentFill + desiredFillPercentage;
    
    // Determine which secret to use
    const secretIndex = this.getSecretIndex(newCumulative, order.fillThresholds);
    
    // Request secret from relayer
    const secret = await this.requestPartialSecret(orderId, secretIndex);
    
    // Create partial escrows
    await this.createPartialEscrows(order, desiredFillPercentage, secret);
  }
  
  private getSecretIndex(cumulative: number, thresholds: number[]): number {
    return thresholds.findIndex(threshold => cumulative <= threshold);
  }
}
```

### 4. Escrow Modifications
```solidity
// Ethereum Escrow Updates
contract FusionPlusEscrow {
    struct PartialEscrow {
        bytes32 baseEscrowId;
        uint256 fillIndex;
        uint256 partialAmount;
        uint256 cumulativeAmount;
    }
    
    mapping(bytes32 => PartialEscrow) public partialEscrows;
    
    function createPartialEscrow(
        bytes32 _baseEscrowId,
        uint256 _fillIndex,
        uint256 _partialAmount,
        bytes32 _hashlock,
        uint256 _timelock
    ) external payable {
        bytes32 partialEscrowId = keccak256(
            abi.encodePacked(_baseEscrowId, _fillIndex)
        );
        // Create escrow logic...
    }
}
```

### 5. Frontend Updates
```typescript
// Partial Fill UI Component
function PartialFillProgress({ order }: { order: PartialFillOrder }) {
  return (
    <div className="partial-fill-progress">
      <div className="progress-bar">
        <div 
          className="filled" 
          style={{ width: `${order.currentFillPercentage}%` }}
        />
      </div>
      <div className="fills-list">
        {order.fills.map((fill, i) => (
          <div key={i} className="fill-item">
            Resolver {fill.resolver.slice(0,6)}... filled {fill.fillPercentage}%
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Implementation Steps

1. **Create Merkle Tree Utilities**: Generate secrets tree and proofs
2. **Update Order Schema**: Add partial fill fields to Order type
3. **Modify Escrow Contracts**: Support partial escrow creation
4. **Update Resolver Service**: Handle partial fill logic
5. **Frontend Integration**: Show partial fill progress
6. **Testing**: End-to-end partial fill scenarios

## Example Flow

**Order**: 1 WETH → APT, split into 4 parts (25% each)

1. **Resolver A**: Fills 20% (using secret #1 for 0-25% range)
2. **Resolver B**: Fills 40% more (using secret #3 for 0-75% range)
3. **Resolver C**: Fills remaining 40% (using secret #4 for 100% completion)

Each resolver creates separate escrows with the appropriate secret, ensuring no resolver can claim more than their earned portion.

## Benefits

- **Better Rates**: Competition between resolvers drives better prices
- **Faster Execution**: Large orders don't wait for single resolver
- **Capital Efficiency**: Resolvers can fill portions they can afford
- **User Experience**: Orders complete faster with multiple fills