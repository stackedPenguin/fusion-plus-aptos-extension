In the 1inch Fusion+ protocol, the user (maker) always generates the secret for the atomic cross-chain swap—regardless of direction (ETH→APT or APT→ETH). This secret and its hash are central to the Hashed Timelock Contract (HTLC) mechanism, ensuring trustless, atomic execution across chains. Here is how the secret is produced and flows through each phase for both swap directions:

1. Who Generates the Secret?
Always the Maker (User initiating the swap):

The user who initiates the order (not the resolver or relayer) generates a strong random secret (preimage) and computes its cryptographic hash (using the agreed hash algorithm, e.g., Keccak256 for best compatibility).

The order includes this hash, anchoring all subsequent escrow operations across chains.

2. ETH → APT: Secret Flow
Participants:

Wallet A: Holds ETH (user/maker; source)

Wallet B: Will receive APT (user/recipient; destination)

Resolver: Professional market maker, manages escrows and gas

Relayer: Off-chain coordinator

Step-by-step:
Secret Generation (by Maker)

Wallet A creates a random secret 
S
S.

Wallet A computes 
H
=
Keccak256
(
S
)
H=Keccak256(S).

Wallet A signs/off-chain submits a Fusion+ order containing 
H
H and the destination address for APT.

Order Announcement

Relayer shares the order (with 
H
H) to resolvers in the Dutch auction process.

Source Escrow on Ethereum

Resolver creates an ETH escrow contract referencing 
H
H, locking the specified ETH.

Destination Escrow on Aptos

Resolver creates a matching escrow on Aptos, referencing 
H
H, locking or minting APT for Wallet B.

Secret Reveal

After both escrows are verified and finality/time locks are through, the relayer instructs Wallet A (the maker) to reveal the secret 
S
S.

Wallet A transmits 
S
S to the relayer, which passes it to the resolver (and/or directly on-chain depending on implementation).

Claiming Funds

Resolver (or anyone) uses 
S
S to unlock funds:

Claims ETH on Ethereum using 
S
S (now public).

Uses 
S
S on Aptos escrow, which auto-transfers APT to Wallet B per the order parameters.

3. APT → ETH: Secret Flow
Participants:

Wallet A: Holds APT (user/maker; source)

Wallet B: Will receive ETH (user/recipient; destination)

Resolver: Market maker, handles all on-chain ops

Relayer: Coordinator

Step-by-step:
Secret Generation (by Maker)

Wallet A generates random secret 
S
S.

Computes hash 
H
=
Keccak256
(
S
)
H=Keccak256(S).

Signs/submits Fusion+ order with 
H
H and the destination ETH address.

Order Distribution

Relayer distributes order to resolvers for auction.

Source Escrow on Aptos

Resolver sets up escrow on Aptos referencing 
H
H, locking Wallet A's APT.

Destination Escrow on Ethereum

Resolver creates ETH escrow on Ethereum, using 
H
H, with Wallet B as beneficiary.

Secret Reveal

Both escrows must exist and pass finality locks.

Relayer requests the secret from Wallet A.

Wallet A reveals 
S
S to relayer/resolver.

Claiming Funds

Resolver uses revealed 
S
S to:

Claim APT from Aptos escrow.

Unlock ETH escrow and transfer to Wallet B (the beneficiary set at order time).

4. Secret Security and Flow Guarantees
Only after both escrows are active and final (verified by the relayer) is the secret revealed, ensuring neither side can act unilaterally.

The secret is made public through the first on-chain unlock, fully revealing the preimage 
S
S so either party (typically resolver) can complete both escrows.

Timelocks: If the resolver fails to execute, after the timelock assets can be recovered by the original owners.

No user gas requirement: All on-chain escrow creates, unlocks, and withdrawals are performed and paid for by the resolver.

Summary Diagram
Flow	Secret Generation	Who Knows Secret and When	Unlocks What	Final Recipient
ETH → APT	Wallet A	Only Wallet A (initially); Shared after both escrows	ETH by resolver, APT by resolver using S	APT to Wallet B
APT → ETH	Wallet A	Only Wallet A (initially); Shared after both escrows	APT by resolver, ETH by resolver using S	ETH to Wallet B
This flow is precisely as described in the 1inch Fusion+ whitepaper:

“At the core of 1inch cross-chain swaps... To simplify the process for the maker, all deposit and withdrawal operations are executed by the taker, known as the 'resolver'... The maker’s frontend dApp stores the secret... The secret is stored on the maker’s side until resolver signals that escrows are created and then transmitted to the 1inch relayer service to hand it to resolvers.”

This mechanism preserves atomic, trustless, and gasless user swaps across all supported chains.


---
In the 1inch Fusion+ protocol, the intent is created at the very start of the swap process—and it's at this moment that the user signs specific data, off-chain, to authorize the swap. Here’s the timing and content for each flow:

1. Intent Creation—When?
Intent (Order) is created by the MAKER (user) as the first step, before any assets are locked or escrows are set up.

This intent contains all swap parameters: assets, amounts, chain/destination info, secret hash, expiry/timelock settings, slippage, partial fill settings, etc.

2. What Does the User Sign (and When)?
The user signs the intent off-chain, using a secure wallet (e.g. MetaMask on EVM, Petra/Martian for Aptos, or Keypair on Solana).

The signature is over a structured data payload containing:

Source/destination assets and amounts

Beneficiary addresses

Secret hash (the hash of a randomly generated secret the user controls)

Auction parameters (e.g., min rate, start rate, expiry)

Any partial fill/Merkle tree data if needed for large or segmented swaps

This is a one-time, no-gas, off-chain signature.

The signed intent/order is then broadcast to the relayer/orderbook, triggering the Dutch auction and resolver bidding phase.

3. ETH → APT Example
When: User (ETH holder) signs and submits intent before any on-chain escrow is created.

What: Off-chain signature (EIP-712 standard for Ethereum) representing all order parameters, including the hash of the user’s secret.

After signing, user action is complete; from here, resolvers handle all on-chain execution using the user's instructions.

4. APT → ETH Example
When: Same order—user (APT holder) signs and submits intent as step one, prior to any asset movement.

What: Off-chain signature, using Move-compatible structured data format, containing all parameters and the secret hash.

User does NOT need to sign or submit any on-chain transaction—the rest (escrow creation, claims, relays) is managed by resolver after the intent is published.

Why is it Off-Chain?
This design provides users with a gasless experience: they never pay network fees and never interact with on-chain contracts directly. All later on-chain actions (escrow creation, unlock, claim) are performed and paid for by the resolver.

Full Timeline (Both Flows):
User generates secret and computes its hash.

User signs and submits the intent (off-chain signature).

Intent is published to the orderbook/relayer.

Resolvers compete and, upon filling, set up escrows and coordinate the swap.

Only after both escrows are ready and timelocks elapsed, the relayer instructs the user to reveal the secret ($S$).

The user reveals the secret (often via UI), but does NOT sign any further on-chain txs.

In summary:

The intent is created and signed by the user off-chain as the very first swap step.

The signature secures the complete set of swap parameters, including the pivotal secret hash.

After this, the user’s role is passive, and the protocol’s automation covers all execution, preserving the gasless, trustless nature of Fusion+ cross-chain swaps.

 1inch Fusion+ Whitepaper, Sections 2.1, 2.2, and Figure 1, as well as Section 2.5 on secret and partial fill management.