# True Gasless WETH to APT Swaps

This document explains the implementation of true gasless swaps from WETH (Ethereum) to APT (Aptos), where users don't pay any gas fees on Ethereum.

## Overview

The gasless WETH to APT swap allows users to:
- Sign a meta-transaction (off-chain) to authorize WETH transfer
- Have the resolver pay all Ethereum gas fees
- Complete cross-chain swaps without holding ETH for gas

This matches the gasless experience already implemented for APT to WETH swaps.

## Architecture

### Smart Contracts

1. **FusionPlusGaslessEscrow.sol** (`contracts/ethereum/contracts/`)
   - Implements EIP-712 meta-transactions for gasless escrow creation
   - Supports both EIP-2612 permits (for compatible tokens) and meta-transactions (for WETH)
   - Resolver pays gas fees while user's WETH is transferred to escrow

### Frontend Components

1. **GaslessWETHTransaction.ts** (`frontend/src/utils/`)
   - Handles EIP-712 signature generation for meta-transactions
   - Manages nonce tracking and message formatting
   - Prepares data for resolver execution

2. **SwapInterface.tsx** (updated)
   - Detects when gasless escrow is available
   - Guides users through meta-transaction signing
   - Falls back to regular flow if gasless contract not deployed

### Backend Services

1. **ResolverServiceV2.ts** (updated)
   - New `executeGaslessWETHEscrow()` method
   - Handles gasless order processing
   - Executes meta-transactions on behalf of users

## Implementation Flow

### 1. User Initiates Swap
```typescript
// User wants to swap 1 WETH to APT
// They only need WETH balance, no ETH for gas
```

### 2. Frontend Creates Meta-Transaction
```typescript
const gaslessTx = new GaslessWETHTransaction(provider, gaslessEscrowAddress, chainId);
const { signature, deadline } = await gaslessTx.signMetaTx(signer, escrowParams);
```

### 3. User Signs (No Gas)
- User signs an EIP-712 typed message
- This is off-chain signing, costs no gas
- Message authorizes escrow creation with specific parameters

### 4. Order Submitted with Gasless Data
```typescript
const orderData = {
  ...baseOrderData,
  gasless: true,
  gaslessData: {
    escrowId, depositor, beneficiary, token, amount,
    hashlock, timelock, deadline,
    metaTxV, metaTxR, metaTxS
  }
};
```

### 5. Resolver Executes Transaction
```typescript
// Resolver detects gasless order
if (order.gasless && order.gaslessData) {
  await this.executeGaslessWETHEscrow(order, fill);
}
```

### 6. Escrow Created Without User Gas
- Resolver calls `createEscrowWithMetaTx()` on the gasless escrow contract
- Resolver pays all gas fees
- User's WETH is transferred to escrow
- Swap continues normally

## One-Time Setup

Users need to approve the gasless escrow contract to spend their WETH (one-time only):

```javascript
// One-time approval (user pays gas for this)
await weth.approve(gaslessEscrowAddress, ethers.MaxUint256);
```

After this approval, all future swaps are gasless.

## Deployment

1. Deploy the gasless escrow contract:
```bash
cd contracts/ethereum
npx hardhat run scripts/deploy-gasless-escrow.js --network sepolia
```

2. Update environment variables:
```bash
# Frontend (.env)
REACT_APP_ETHEREUM_GASLESS_ESCROW_CONTRACT=0x...

# Backend (.env)
ETHEREUM_GASLESS_ESCROW_ADDRESS=0x...
```

3. Restart services to enable gasless functionality

## Testing

Test the gasless flow:
```bash
node scripts/test-gasless-weth.js
```

This script:
- Signs a meta-transaction as a user (no gas)
- Executes it as the resolver (pays gas)
- Verifies the escrow was created

## Security Considerations

1. **Signature Validation**: The contract validates EIP-712 signatures on-chain
2. **Nonce Management**: Prevents replay attacks
3. **Deadline Enforcement**: Meta-transactions expire
4. **Amount Verification**: Exact amounts are enforced in signatures
5. **No Additional Trust**: Users only trust the resolver as much as in regular swaps

## Limitations

1. **WETH Specific**: Standard WETH doesn't support EIP-2612 permits
2. **One-Time Approval**: Users must approve once (paying gas) before gasless swaps
3. **Resolver Gas Costs**: Resolver bears higher costs for meta-transaction execution

## Future Improvements

1. **Batch Meta-Transactions**: Allow multiple swaps in one transaction
2. **Permit2 Integration**: Use Uniswap's Permit2 for better token support
3. **Gas Optimization**: Optimize contract for lower execution costs
4. **Multi-Chain Support**: Extend pattern to other EVM chains

## Comparison with APT to WETH

| Feature | APT → WETH | WETH → APT |
|---------|------------|------------|
| User pays gas | No | No |
| Signature type | Sponsored transaction | Meta-transaction |
| Wallet support | Petra, some others | All wallets |
| One-time setup | None | WETH approval |
| Resolver complexity | Medium | High |

## Troubleshooting

### "Gasless escrow not configured"
- Ensure the gasless escrow contract is deployed
- Add the address to environment variables
- Restart the resolver service

### "Invalid signature"
- Verify the domain separator matches the deployed contract
- Check chainId is correct (11155111 for Sepolia)
- Ensure nonce hasn't been used

### "Insufficient WETH allowance"
- User needs to approve the gasless escrow contract once
- This is a one-time transaction that does require gas

## Conclusion

The gasless WETH to APT implementation provides a seamless user experience where:
- Users only need WETH, no ETH for gas
- The resolver subsidizes all transaction costs
- Security is maintained through cryptographic signatures
- The flow is transparent and trustless

This completes the vision of true gasless cross-chain swaps in both directions.