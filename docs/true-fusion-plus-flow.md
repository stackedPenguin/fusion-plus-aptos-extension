# True Fusion+ Implementation Flow

## Overview
True Fusion+ enables completely gasless swaps where users only sign messages/transactions, never paying gas.

## Complete Flow

### 1. One-Time Setup (Ethereum)
- User approves WETH to escrow contract ONCE
- This is the only transaction user ever pays gas for
- After this, all swaps are gasless

### 2. Swap Flow

#### Step 1: User Signs Intent
```javascript
// User signs swap intent (FREE - no gas)
const intent = await user.signMessage({
  fromChain: 'APTOS',
  toChain: 'ETHEREUM',
  amount: '1000000', // 0.01 APT
  minOutput: '100000000000000', // 0.0001 WETH
  secretHash: hash(secret)
});
```

#### Step 2: Resolver Creates Destination Escrow
```javascript
// Resolver creates WETH escrow on Ethereum (resolver pays gas)
await escrowContract.createEscrowFor(
  user.address,        // depositor (user)
  resolver.address,    // beneficiary
  WETH_ADDRESS,       // token
  amount,             // amount
  secretHash,         // hash
  timelock            // expiry
);
```

#### Step 3: User Signs APT Transaction (Sponsored)
```javascript
// User signs transaction to lock APT (FREE - no gas)
const aptosTransaction = await buildSponsoredTransaction({
  function: 'create_escrow_user_funded',
  arguments: [escrowId, resolver, amount, hash, timelock, safety, resolver]
});

const userSignature = await wallet.signTransaction(aptosTransaction);
// Send to resolver for fee payer signature
```

#### Step 4: Resolver Submits APT Escrow
```javascript
// Resolver adds fee payer signature and submits (resolver pays gas)
const feePayerSig = resolver.signAsFeePayer(aptosTransaction);
await aptos.submitTransaction({
  transaction: aptosTransaction,
  senderAuth: userSignature,
  feePayerAuth: feePayerSig
});
```

#### Step 5: User Reveals Secret
```javascript
// User reveals secret after both escrows confirmed (FREE)
socket.emit('secret:reveal', { orderId, secret });
```

#### Step 6: Resolver Completes Swap
```javascript
// Resolver withdraws from both escrows (resolver pays gas)
// 1. Withdraw user's APT from Aptos
await aptosEscrow.withdraw(escrowId, secret);

// 2. Send WETH to user on Ethereum  
await ethEscrow.withdraw(escrowId, secret);
```

## Gas Summary

### User Pays:
- One-time WETH approval (setup only)
- NOTHING for swaps

### Resolver Pays:
- Creating destination escrow
- Submitting source escrow (as fee payer)
- Withdrawing from source
- Sending to user on destination

## Key Components

### 1. Ethereum: Pre-Approval Pattern
- User pre-approves escrow contract
- Escrow uses `transferFrom` to pull WETH
- No permits needed, works with standard WETH

### 2. Aptos: Native Sponsored Transactions
- User signs transaction as sender
- Resolver signs as fee payer
- Both signatures submitted together

### 3. Secret Management
- Frontend generates and stores secret
- Only revealed after escrows confirmed
- Ensures atomicity

## Implementation Checklist

- [x] WETH approval service and UI
- [x] Sponsored transaction builder for Aptos
- [ ] Update frontend to only collect signatures
- [ ] Resolver handles all on-chain transactions
- [ ] Test complete gasless flow