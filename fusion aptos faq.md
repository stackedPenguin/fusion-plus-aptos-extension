In a true 1inch Fusion+ cross-chain swap—such as swapping WETH (Ethereum) to APT (Aptos)—the process is automated, trustless, and atomic using hashlock and timelock escrows, involving three key parties: Wallet A (user, source asset holder), the Resolver, and Wallet B (user’s destination wallet).

Below is a detailed, step-by-step demonstration of the flow and role of escrows:

1. Preparation: Parties Involved
Wallet A: Holds WETH (wrapped ETH) on Ethereum. Initiates the swap.

Resolver: Professional/certified entity who facilitates order fulfillment, locks funds, and pays gas on both chains.

Wallet B: Target wallet on Aptos to receive APT.

2. Flow: WETH (Ethereum) → APT (Aptos)
Step 1: User (Wallet A) Creates Swap Intent
Wallet A signs an off-chain Fusion+ order with secret hash (using, e.g., Keccak256), specifying:

Amount of WETH to swap.

Target (Wallet B’s address on Aptos).

Minimum return and other constraints.

Reveals only the hash, not the secret.

Step 2: Resolver Locks Source Funds (WETH) in Escrow on Ethereum
Resolver picks the order (via relayer/backend and Dutch auction).

Resolver creates the source escrow contract on Ethereum:

Deposits WETH from Wallet A into escrow (using user’s signature and allowance or pulls from smart wallet).

Escrow is “hashlocked” with secretHash; has a timelock.

Funds locked: WETH now held by Ethereum escrow contract.

Step 3: Resolver Locks Destination Funds (APT) in Escrow on Aptos
Resolver creates the destination escrow on Aptos:

Deposits (or mints/unlocks) the equivalent APT (its own inventory for swap).

Escrow “hashlocked” with the same secretHash, target = Wallet B, timelock set.

Funds locked: APT now held by Aptos escrow.

Step 4: Relayer Confirms Both Escrows Are Set
1inch’s relayer confirms:

Source and target escrows exist and are correctly set (matching hashes, amounts, addresses).

No funds can move yet—awaiting secret.

Relayer prompts user (or backend) to reveal the secret (the preimage) when safe (to avoid race).

Step 5: User Reveals Secret (or Relayer Transmits)
Wallet A (user) or relayer submits the secret to the network (via backend or UI).

Revealing the secret: Now, anyone with the secret can unlock the HTLCs on both chains.

Step 6: Resolver Unlocks & Transfers Funds
On Ethereum: Resolver uses the secret to claim the WETH from Ethereum escrow. It’s transferred to the resolver (compensation for swap).

On Aptos: Resolver submits the same secret to the Aptos escrow contract,

The contract validates the preimage against secretHash and the beneficiary (Wallet B).

Contract transfers or mints APT directly to Wallet B.

Wallet B requires no action or approval—it simply receives the freshly unlocked/minted funds.

3. Funds Flow by Party
Party	Fund Locked Where	Who Can Withdraw	When/How
Wallet A	WETH in ETH Escrow	Resolver	After secret is revealed (Step 6)
Resolver	APT in Aptos Escrow	Wallet B	Resolver submits secret; contract sends APT directly to Wallet B
Wallet B	Receives APT	—	No interaction needed; auto receive
4. Atomicity, Security & Recovery
If secret isn’t revealed before timelocks expire, funds are refunded to original owners by anyone (or by safety deposit incentive).

Partial fills are supported by splitting into multiple secrets/escrows.

Summary Table: WETH to APT Swap via Fusion+
Step	Action & Escrow Location	Who Acts	End State
1. Intent	Off-chain order signed	Wallet A	Order broadcast (hash locked)
2. Source Escrow	Lock WETH on Ethereum	Resolver	WETH locked (HTLC #1)
3. Dest Escrow	Lock APT on Aptos	Resolver	APT locked (HTLC #2)
4. Secret Reveal	Reveal preimage	Wallet A/Relayer	Hash unlocked (both chains)
5. Unlock	Withdraws/claims on both	Resolver	WETH to resolver, APT to Wallet B
Key Principle:

Resolvers create and control both escrows—locking and unlocking tokens.

User’s funds (WETH) are never at risk, as secret is only revealed after both escrows exist.

Resolves atomicity with hashlock and timelock contracts per Fusion+ white paper.

End result: WETH from Wallet A, APT to Wallet B, both transfers handled by resolver, all actions enforced on-chain by contracts, and no approval is needed from recipient at the unlock stage.

This demonstrates the full “Fusion+” compliant flow for a WETH-to-APT swap across Ethereum and Aptos, from locking to atomic transfer.