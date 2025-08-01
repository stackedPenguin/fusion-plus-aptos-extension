# Petra Wallet Limitations with Sponsored Transactions

## Current Issue
When attempting to use Aptos sponsored transactions (fee payer model), Petra wallet shows a blank popup and cannot sign the transaction. This is because Petra doesn't yet support the transaction format created with `withFeePayer: true`.

## What Happens
1. Frontend builds a sponsored transaction using Aptos SDK with `withFeePayer: true`
2. Attempts to get user signature via `window.aptos.signTransaction(transaction)`
3. Petra shows a blank popup - it doesn't understand the transaction format
4. Code falls back to the old method where resolver fronts the APT

## Current Workaround
The implementation includes automatic fallback:
```typescript
try {
  // Try sponsored transaction (user's APT, resolver pays gas)
  const transaction = await sponsoredTx.buildSponsoredEscrowTransaction(...);
  const signResult = await window.aptos.signTransaction(transaction);
  // ... send to resolver
} catch (error) {
  // Fallback to old method (resolver fronts APT)
  socket.emit('order:signed', ...);
}
```

## Future Solutions

### Option 1: Wait for Wallet Support
- Petra and other wallets need to update to support fee payer transactions
- This is the cleanest solution but requires waiting for wallet updates

### Option 2: Use Regular Transaction + Reimbursement
1. User creates and signs a regular transaction paying both APT and gas
2. Resolver monitors the transaction
3. Resolver reimburses the gas fees to the user
4. More complex but works with current wallets

### Option 3: Use Delegate Function
Instead of using the standard `create_escrow` function, use `create_escrow_delegated`:
1. User signs only the intent/parameters (not a full transaction)
2. Resolver constructs and submits the transaction
3. Smart contract validates the user's signature on-chain
4. This is what we're currently doing as the fallback

## Testing Other Wallets
To test if other wallets support sponsored transactions:
1. Martian Wallet
2. Pontem Wallet
3. Fewcha Wallet
4. Rise Wallet

## Technical Details
The sponsored transaction format includes:
- `rawTransaction` with the transaction data
- `feePayerAddress` field (can be 0x0 in newer versions)
- Requires multiple signatures (sender + fee payer)

Petra's current implementation doesn't recognize this format, resulting in the blank popup.