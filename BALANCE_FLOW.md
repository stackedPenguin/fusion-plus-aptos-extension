# Fusion+ Balance Flow Documentation

## Current Implementation (Simplified Demo)

The current implementation demonstrates the resolver service functionality but does not yet implement the full atomic swap flow with user participation.

### What Currently Happens:

#### ETH → APT Swap (User wants to send 0.001 ETH for 0.5 APT)

1. **Order Creation**
   - User signs intent (no on-chain tx)
   - User balance: No change

2. **Resolver Execution**
   - Resolver creates Ethereum escrow with 0.001 ETH from resolver's wallet
   - Resolver creates Aptos escrow with 0.5 APT from resolver's wallet
   - Resolver pays gas on both chains

3. **Secret Reveal**
   - Resolver reveals secret and withdraws both escrows
   - Funds return to resolver

**Balance Changes:**
- User ETH: 0 (no change)
- User APT: 0 (no change)
- Resolver ETH: -gas fees
- Resolver APT: -gas fees
- Escrows: Temporary hold then released

#### APT → ETH Swap (User wants to send 1 APT for 0.002 ETH)

Similar flow - resolver creates both escrows and withdraws both.

### Why User Balances Don't Change:

The current implementation is missing:
1. User wallet integration to create source escrows
2. User monitoring of destination escrows
3. User withdrawal transactions using revealed secrets

## Expected Production Implementation

### Correct Balance Flow for ETH → APT:

1. **User Balance Changes:**
   - ETH: -0.001 (locked in escrow)
   - APT: +0.5 (withdrawn from escrow)

2. **Resolver Balance Changes:**
   - ETH: +0.001 (withdrawn from escrow) - gas fees
   - APT: -0.5 (locked in escrow) - gas fees

### Correct Balance Flow for APT → ETH:

1. **User Balance Changes:**
   - APT: -1 (locked in escrow)
   - ETH: +0.002 (withdrawn from escrow)

2. **Resolver Balance Changes:**
   - APT: +1 (withdrawn from escrow) - gas fees
   - ETH: -0.002 (locked in escrow) - gas fees

## Current System Verification

From the balance tracking test:

```
Initial State:
- User ETH: 0.05107367052831273
- User APT: 0.99715000
- Resolver ETH: 0.047963201065528868
- Resolver APT: 4.00000000

After Both Swaps:
- User ETH: 0.05107367052831273 (unchanged)
- User APT: 0.99715000 (unchanged)
- Resolver ETH: 0.037953600369964564 (-0.010010 for gas)
- Resolver APT: 4.00000000 (unchanged)
```

This confirms the resolver is only paying gas fees and moving its own funds.

## Next Steps for Full Implementation

1. **Add User Escrow Creation**
   ```javascript
   // User monitors for resolver's destination escrow
   // Then creates matching source escrow
   ```

2. **Implement Proper Secret Flow**
   ```javascript
   // Resolver reveals secret on source chain
   // User monitors and uses secret on destination chain
   ```

3. **Add Event Monitoring**
   ```javascript
   // Both parties monitor escrow events
   // Automated withdrawal when secrets are revealed
   ```

## Summary

The current implementation successfully demonstrates:
- ✅ Off-chain order creation and signing
- ✅ Resolver service monitoring and execution
- ✅ Hashlock/timelock escrow contracts
- ✅ Cross-chain coordination
- ✅ Atomic swap security model

Still needed for production:
- ❌ User wallet integration for escrow creation
- ❌ User monitoring of escrows
- ❌ Actual token transfers between users and resolvers
- ❌ Full implementation of the atomic swap protocol

The infrastructure is ready; it just needs the user-side implementation to complete the full atomic swap flow.