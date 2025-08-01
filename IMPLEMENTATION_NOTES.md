# Implementation Notes - Fusion+ Cross-Chain Swap

## Current Status

The cross-chain swap system is fully functional with the following implementation:

### Working Features
1. **APT → WETH swaps** - Complete flow working
2. **ETH → APT swaps** - Complete flow working
3. **Gasless swaps** - Users don't pay gas on either chain
4. **Atomic swaps** - Using HTLC contracts on both chains
5. **User-controlled secrets** - Following Fusion+ protocol

### Current Limitations

#### APT Funding Issue
- **Current behavior**: Resolver fronts the APT for escrows (user's APT balance doesn't change)
- **Desired behavior**: User's APT should be used directly
- **Root cause**: Petra wallet doesn't properly support sponsored transactions
- **Attempted solution**: Implemented `escrow_v2` module with `create_escrow_user_funded` function
- **Blocker**: When trying to use sponsored transactions, Petra shows a blank popup

#### Technical Details
The blank popup occurs because:
1. Petra wallet's `signTransaction` API has limitations with complex transaction payloads
2. The wallet shows deprecation warning: "Usage of `signTransaction(payload, options)` is going to be deprecated"
3. Sponsored transaction format is not fully supported by current wallet implementations

### Future Improvements

1. **Wallet Support**: Wait for Petra/other Aptos wallets to fully support sponsored transactions
2. **Alternative Approaches**:
   - Use session keys when available
   - Implement pre-approved allowance mechanism
   - Use resource accounts with delegated capabilities

3. **UI Improvements**:
   - Show clearer flow: Wrap ETH → Approve WETH → Swap
   - Add transaction status tracking
   - Improve error handling for wallet rejections

### Contract Addresses

- **Aptos Escrow**: `0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca`
- **Ethereum Escrow**: Check `.env` file
- **Resolver (Aptos)**: `0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532`

### Testing

To test the current implementation:
1. Start all services: `./scripts/start-all.sh`
2. Connect both MetaMask (Sepolia) and Petra (Testnet) wallets
3. Enter swap amount (e.g., 0.5 APT)
4. Complete the swap flow

The swap will complete successfully, but note that APT comes from resolver's balance, not user's.