# Fusion+ Cross-Chain Swap Flow: ETH → APT

## Overview
This document describes the complete flow of a Fusion+ cross-chain atomic swap from Ethereum (ETH) to Aptos (APT), implementing the 1inch Fusion+ protocol with automatic transfers.

## Key Components

### 1. **Relayer (Order Engine)**
- Off-chain coordination service
- Watches both blockchains for escrow events
- Validates escrow setups
- Coordinates secret distribution
- Never has custody of funds

### 2. **Resolver**
- Creates escrows on both chains
- Pays all gas fees
- Reveals secret to unlock funds
- Transfers APT directly to user's wallet
- Takes custody of released ETH

### 3. **User Wallets**
- **Wallet A (Ethereum)**: Signs EIP-712 permit for automatic transfer
- **Wallet B (Aptos)**: Passive recipient, receives APT automatically

## Complete Swap Flow

### Step 1: Order Creation with Permit
```javascript
// User signs EIP-712 permit for gasless transfer
const permit = {
  owner: userWalletA,
  spender: resolver,
  value: ethAmount,
  nonce: currentNonce,
  deadline: timestamp + 3600
};

const signature = await wallet.signTypedData(domain, types, permit);
```

### Step 2: Resolver Creates Destination Escrow
- Resolver evaluates order profitability
- Creates Aptos escrow with user's wallet B as beneficiary
- Locks APT with hashlock and timelock

### Step 3: Automatic Source Transfer
- Resolver executes permit to transfer ETH from user
- Creates Ethereum escrow automatically
- No manual escrow creation required by user

### Step 4: Secret Revelation
- Resolver reveals secret on Ethereum
- Withdraws ETH from source escrow
- Automatically withdraws from Aptos escrow

### Step 5: Automatic Transfer to User
```move
// Aptos contract automatically transfers to beneficiary
public entry fun withdraw(
    sender: &signer,
    escrow_id: vector<u8>,
    secret: vector<u8>
) acquires EscrowStore {
    // ... verification logic ...
    
    // Automatic transfer to beneficiary
    if (escrow.beneficiary != sender_addr) {
        coin::transfer<AptosCoin>(sender, escrow.beneficiary, escrow.amount);
    }
}
```

## Security Features

1. **Atomic Execution**: Either both transfers complete or both fail
2. **Timelock Protection**: 30-minute expiry for refunds
3. **Hash Verification**: Keccak256 on both chains
4. **Non-Custodial**: Resolver never controls user funds
5. **Gasless for User**: All fees paid by resolver

## Implementation Status

### ✅ Completed
- EIP-712 permit system for automatic transfers
- Aptos escrow with automatic beneficiary transfer
- Keccak256 hash compatibility between chains
- Real-time WebSocket updates
- 1inch-style dark theme UI

### 🚧 In Progress
- Full automatic flow testing
- Production deployment

### 📋 Future Enhancements
- Partial fills with Merkle trees
- On-chain resolver registry
- Multiple token support
- Cross-chain messaging via LayerZero

## Contract Addresses

### Ethereum (Sepolia)
- Escrow: `0xB96bBD3D5E90a76399C1fA6f94C789BEeFbaf0Cd`
- Permit: `0x1eB5f27B160Aa22D024164c80F00bD5F73dDBb1E`

### Aptos (Testnet)
- Escrow: `0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35`

## Testing the Flow

1. **Connect Wallets**
   - MetaMask for Ethereum
   - Petra for Aptos

2. **Create Swap**
   - Enter ETH amount
   - Sign EIP-712 permit
   - Watch automatic execution

3. **Monitor Progress**
   - Destination escrow creation
   - Automatic source transfer
   - Secret revelation
   - APT delivery to wallet

## Key Differences from Traditional Swaps

1. **No Manual Claiming**: APT automatically transferred to user
2. **Single Signature**: Only EIP-712 permit needed
3. **Gasless Experience**: Resolver pays all fees
4. **Trustless Execution**: Smart contracts enforce atomicity

This implementation follows the true Fusion+ protocol design where users enjoy a seamless, gasless, and automatic cross-chain swap experience.