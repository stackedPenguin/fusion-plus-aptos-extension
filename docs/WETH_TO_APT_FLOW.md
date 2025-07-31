Here is the **detailed flow for a WETH (Ethereum) → APT (Aptos)** cross-chain swap using true 1inch Fusion+ architecture, showing escrow creation, fund locking, transfer, and each participant’s role:

## 1. Participants

- **Wallet A:** WETH holder on Ethereum (user; "maker"), wants to swap WETH for APT.
- **Wallet B:** Receives APT on Aptos after swap (user; may be the same or different).
- **Resolver:** Professional taker—fills the order, provides and locks funds on both chains, covers all gas fees.
- **Relayer:** Off-chain service for coordination, secret distribution, auction, and escrow status monitoring.

## 2. Step-by-Step Fusion+ Flow: WETH → APT

### **Phase 1: Order Creation & Secret Initiation**

- **Wallet A** generates a random secret $$ S $$, hashes it (using the selected cross-chain compatible hash function, e.g., Keccak256 on both chains—see prior solution).
- **Wallet A** creates and signs a Fusion+ intent: “I want to swap X WETH for Y APT, send APT to Wallet B (Aptos address), here’s secret hash H, min rate, expiry, partial fill settings.”
- The intent is submitted to the 1inch Fusion+ orderbook (relayer).

### **Phase 2: Escrow Creation and Funds Locking**

#### **A. Source Chain Escrow (WETH on Ethereum)**
- The **resolver** claims the order and creates the Ethereum escrow contract:
    - Moves **Wallet A’s WETH** from A’s wallet to the escrow,
    - Escrow is hashlocked (using H), timelocked, set with safety deposit, and specifies all swap parameters.
    - **Resolver pays all Ethereum gas costs.**

#### **B. Destination Chain Escrow (APT on Aptos)**
- The **resolver** provides Y APT on Aptos and locks them in a new escrow on Aptos (Move smart contract):
    - This escrow is hashlocked with the same secret hash H, timelocked, and sets **Wallet B as recipient**.
    - **Resolver pays all Aptos gas costs.**

- The **relayer** (off-chain service) monitors both chains and confirms that both escrows exist, are final, and match the order’s hash and terms.

### **Phase 3: Verification, Secret Reveal, and Execution**

1. Once both escrows are verified as complete, the **relayer** requests the secret $$ S $$ from **Wallet A**.
2. **Wallet A** reveals the secret (preimage).
3. **Relayer** distributes this secret to the resolver and posts it on-chain.

### **Phase 4: Withdrawal and Transfer**

#### **A. Resolver Withdraws WETH Escrow on Ethereum**
- **Resolver** uses the revealed secret to unlock the original WETH escrow and receives WETH (compensating the resolver and closing out source funds).

#### **B. Resolver (or any party) Withdraws Destination Escrow on Aptos**
- **Resolver** (or, after timelock, any party) uses secret $$ S $$ to call the Move escrow contract on Aptos.
- The contract releases APT *directly to Wallet B*, since:
    - The escrow was parameterized to only allow transfers to Wallet B,
    - No further on-chain approval or action is needed from Wallet B.

### **3. Gas & Fee Flow**

- **Resolver pays all gas**: Ethereum (lock/withdraw), Aptos (create/withdraw) — users never pay gas.
- **User compensation**: The “gasless” UX is possible because the resolver is compensated via the swap’s spread (i.e., user receives a slightly less favorable rate in exchange for not paying network gas).

### **4. Role of the Relayer**

- Coordinates auction and intent distribution.
- Verifies both escrows exist (ensuring no premature secret reveals).
- Requests and propagates the secret when both escrows are final.
- Updates off-chain orderbook, enables real-time status tracking, helps orchestrate partial fills.

## Visual Summary Table

| Step           | Who Acts?       | Chain      | Funds Locked        | Unlock Condition          | Gas Paid By   |
|----------------|-----------------|------------|---------------------|--------------------------|--------------|
| 1. Intent      | Wallet A        | Off-chain  | —                   | —                        | —            |
| 2. SrcEscrow   | Resolver        | Ethereum   | Wallet A’s WETH     | Hash + timelock          | Resolver     |
| 3. DstEscrow   | Resolver        | Aptos      | Resolver’s APT      | Hash + timelock          | Resolver     |
| 4. Verify      | Relayer         | Off-chain  | —                   | Both escrows confirmed   | —            |
| 5. Reveal      | Wallet A        | Off-chain  | —                   | —                        | —            |
| 6. RedeemSrc   | Resolver        | Ethereum   | Unlock WETH         | Secret revealed          | Resolver     |
| 7. RedeemDst   | Resolver        | Aptos      | Transfer APT to B   | Secret revealed          | Resolver     |

### **Atomicity & Security**

- **Timelocks and hashlocks** guarantee that neither user nor resolver can lose funds: if either party fails to act, assets can be reclaimed after timeout.
- **“Gasless” for user:** All contract interaction and gas is handled by the resolver.
- **Wallet B** receives APT passively, without any on-chain approval.

**In summary:**  
- The user initiates the swap and sets the recipient (Wallet B) up front.
- The resolver locks WETH and APT in separate escrows, using the same hashlock logic, and covers all gas.
- After secret revelation, the resolver collects WETH and triggers the on-chain APT release to Wallet B.
- The relayer ensures synchronization, correctness, and safe secret distribution, but never takes custody of funds.  
- This mirrors the proven, production-ready 1inch Fusion+ workflow for atomic, trustless, and gasless user experiences—even between EVM and non-EVM chains[1].

[1] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/1363211/0e7297b4-5ac0-4add-b6a2-151deac856f5/1inch-fusion-plus.pdf