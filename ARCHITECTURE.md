# Fusion+ Extension Architecture

## Overview

This implementation extends 1inch Fusion+ to support cross-chain atomic swaps between Ethereum (EVM) and Aptos (non-EVM), following the proper Fusion+ architecture with both **Resolvers** and **Relayers**.

## Key Components

### 1. **Order Engine** (Port 3001)
- Manages off-chain swap intents
- WebSocket for real-time order updates
- REST API for order submission and status

### 2. **Relayer Service** (Port 3003)
- Submits transactions on behalf of users (gasless)
- Pays all gas fees on both chains
- Validates user signatures before relaying
- Supports both Ethereum and Aptos transactions

### 3. **Resolver Service** (Port 3002)
- Market makers who provide liquidity
- Creates destination escrows only
- Monitors for source escrow creation
- Reveals secrets to complete swaps

### 4. **Smart Contracts**
- **Ethereum**: Hashlock/Timelock escrow (Solidity)
- **Aptos**: Hashlock/Timelock escrow (Move)
- Both support atomic swaps with secret reveal

### 5. **Frontend** (Port 3000)
- React UI with wallet integration
- Uses FusionPlusClient SDK for gasless operations
- Real-time order tracking via WebSocket

## Swap Flow (Correct Fusion+ Implementation)

### ETH → APT Example

1. **User Signs Intent** (Off-chain)
   ```javascript
   // User signs swap intent - NO GAS NEEDED
   const orderId = await client.createSwapIntent({
     fromChain: 'ETHEREUM',
     toChain: 'APTOS',
     fromAmount: '0.001',
     minToAmount: '0.5'
   });
   ```

2. **Resolver Creates Destination Escrow**
   - Resolver evaluates profitability
   - Creates Aptos escrow with user as beneficiary
   - Locks 0.5 APT with hashlock

3. **User Creates Source Escrow** (Via Relayer - Gasless)
   ```javascript
   // User creates escrow without paying gas
   const txHash = await client.createSourceEscrow(
     destinationEscrowInfo,
     '0.001' // ETH amount
   );
   ```
   - Relayer submits transaction
   - Relayer pays gas fees
   - User's ETH locked with resolver as beneficiary

4. **Resolver Reveals Secret**
   - Monitors for source escrow creation
   - Reveals secret on Ethereum
   - Withdraws 0.001 ETH

5. **User Claims Destination**
   ```javascript
   // User withdraws APT using revealed secret
   await client.withdrawFromEscrow(
     escrowId,
     revealedSecret,
     'APTOS'
   );
   ```
   - Relayer submits withdrawal
   - User receives 0.5 APT

## Key Differences from Simplified Demo

### Old (Incorrect) Flow:
- Resolver created both escrows
- Resolver withdrew from both escrows
- User balances never changed
- No relayer involvement

### New (Correct) Flow:
- Resolver creates destination escrow only
- User creates source escrow (gasless via relayer)
- Both parties withdraw using atomic swap
- Relayer handles all gas payments
- User balances actually change

## Wallet Distribution

| Role | Ethereum Wallet | Aptos Wallet | Pays Gas? |
|------|----------------|--------------|-----------|
| User | Source of ETH | Receives APT | No (gasless) |
| Resolver | Receives ETH | Source of APT | No (uses relayer) |
| Relayer | Pays ETH gas | Pays APT gas | Yes (all gas) |

## Security Model

1. **Atomic Swaps**: Hashlock ensures both sides execute or neither
2. **Timelocks**: Prevent funds being locked forever
3. **No Trust Required**: Mathematical guarantees via HTLC
4. **Gasless for Users**: Better UX, relayers handle complexity

## Future Enhancements

1. **LayerZero V2**: For cross-chain message verification
2. **Partial Fills**: Using Merkle tree of secrets
3. **Resolver Registry**: On-chain whitelisting and staking
4. **Production Signatures**: Full EIP-712 implementation