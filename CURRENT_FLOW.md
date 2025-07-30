# Current Fusion+ Implementation Flow

## Overview
This implementation demonstrates the Fusion+ atomic swap protocol between Ethereum and Aptos. Currently, it requires manual escrow creation on the source chain (the full Fusion+ uses permit/approval for automatic transfers).

## Current Flow (ETH → APT)

1. **User Creates Order**
   - Connect both MetaMask (Sepolia) and Petra (Testnet) wallets
   - Enter amount to swap (e.g., 0.0005 ETH)
   - Click "Swap" button
   - Sign the order with MetaMask

2. **Resolver Creates Destination Escrow**
   - Resolver evaluates profitability
   - Creates Aptos escrow with APT locked for the user
   - Frontend shows "Resolver locked X.XXXX APT on Aptos!"

3. **User Creates Source Escrow** (Manual step)
   - Currently requires running a script:
   ```bash
   cd scripts
   node create-source-escrow.js <orderId> <secretHash>
   ```
   - The orderId and secretHash are shown in the frontend

4. **Automatic Completion**
   - Resolver detects the Ethereum escrow
   - Reveals the secret and withdraws ETH
   - Automatically withdraws from Aptos escrow, sending APT to user
   - User receives APT directly in their wallet

## Missing Features for Full Fusion+

1. **Permit/Approval Flow**: In the real Fusion+, users sign a permit that allows the resolver to transfer funds directly, eliminating the need for manual escrow creation.

2. **Transaction Panel Updates**: The pending transactions should show up in the side panel with countdown timers.

3. **Automatic Source Transfer**: After signing the intent, funds should be automatically locked without manual intervention.

## Test the Current Implementation

1. Start all services:
   ```bash
   ./scripts/start-all.sh
   ```

2. Open http://localhost:3000

3. Connect wallets and create a swap

4. Note the order ID and secret hash from the UI

5. Run the escrow creation script:
   ```bash
   cd scripts
   node create-source-escrow.js <orderId> <secretHash>
   ```

6. Watch the resolver logs to see the automatic completion

## Technical Notes

- The UI now has a 1inch-style dark theme
- 30-minute timelock for all swaps
- Automatic fund transfer to user (no manual claiming)
- Uses Keccak256 for hash compatibility between chains