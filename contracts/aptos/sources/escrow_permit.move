module fusion_plus::escrow_permit {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_std::table::{Self, Table};
    use aptos_std::ed25519;
    use std::bcs;
    use fusion_plus::escrow_v2::{Self, EscrowStore};

    // Error codes
    const E_INVALID_SIGNATURE: u64 = 1;
    const E_EXPIRED_PERMIT: u64 = 2;
    const E_NONCE_ALREADY_USED: u64 = 3;
    const E_INSUFFICIENT_BALANCE: u64 = 4;
    const E_AMOUNT_MISMATCH: u64 = 5;

    // Store for tracking used nonces
    struct PermitNonces has key {
        used_nonces: Table<vector<u8>, bool>,
    }

    fun init_module(admin: &signer) {
        move_to(admin, PermitNonces {
            used_nonces: table::new(),
        });
    }

    /// Create escrow using user's funds with permit signature
    /// User signs off-chain, resolver submits on-chain and pays gas
    public entry fun create_escrow_from_permit(
        resolver: &signer,
        // Escrow parameters
        escrow_id: vector<u8>,
        depositor_addr: address,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit_amount: u64,
        // Permit parameters
        permit_nonce: u64,
        permit_expiry: u64,
        depositor_pubkey: vector<u8>,
        permit_signature: vector<u8>
    ) acquires PermitNonces {
        // Check permit hasn't expired
        assert!(timestamp::now_seconds() <= permit_expiry, E_EXPIRED_PERMIT);
        
        // Check nonce hasn't been used
        let nonces = borrow_global_mut<PermitNonces>(@fusion_plus);
        let nonce_key = bcs::to_bytes(&permit_nonce);
        assert!(!table::contains(&nonces.used_nonces, nonce_key), E_NONCE_ALREADY_USED);
        
        // Construct the message that was signed
        // Format: "APTOS_ESCROW_PERMIT:<escrow_id>:<amount>:<beneficiary>:<hashlock>:<timelock>:<nonce>:<expiry>"
        let message = b"APTOS_ESCROW_PERMIT:";
        vector::append(&mut message, escrow_id);
        vector::append(&mut message, b":");
        vector::append(&mut message, bcs::to_bytes(&amount));
        vector::append(&mut message, b":");
        vector::append(&mut message, bcs::to_bytes(&beneficiary));
        vector::append(&mut message, b":");
        vector::append(&mut message, hashlock);
        vector::append(&mut message, b":");
        vector::append(&mut message, bcs::to_bytes(&timelock));
        vector::append(&mut message, b":");
        vector::append(&mut message, bcs::to_bytes(&permit_nonce));
        vector::append(&mut message, b":");
        vector::append(&mut message, bcs::to_bytes(&permit_expiry));
        
        // Verify signature
        let pk = ed25519::new_unvalidated_public_key_from_bytes(depositor_pubkey);
        let sig = ed25519::new_signature_from_bytes(permit_signature);
        assert!(
            ed25519::signature_verify_strict(&sig, &pk, message),
            E_INVALID_SIGNATURE
        );
        
        // Mark nonce as used
        table::add(&mut nonces.used_nonces, nonce_key, true);
        
        // Now we need to transfer APT from the user to the escrow
        // This requires the user to have set up a resource account or
        // we need a different mechanism to pull funds
        
        // For now, we'll create the escrow with resolver funds but track
        // that it should be reimbursed from the user
        // In production, this would use resource accounts or similar
        
        // Create the escrow using the existing infrastructure
        // This still uses resolver funds but at least validates the user's intent
        escrow_v2::create_escrow_delegated(
            resolver,
            escrow_id,
            depositor_addr,
            beneficiary,
            amount,
            hashlock,
            timelock,
            permit_nonce,
            permit_expiry,
            safety_deposit_amount,
            depositor_pubkey,
            permit_signature
        );
        
        // TODO: Implement actual fund transfer from user
        // Options:
        // 1. Resource account pattern
        // 2. Pre-approval pattern  
        // 3. Delegated withdrawal pattern
    }

    /// Alternative: User pre-approves escrow contract to spend APT
    /// This is simpler but requires user to submit one transaction
    struct EscrowAllowance has key {
        allowances: Table<address, u64>, // resolver -> amount
        expiry: u64,
    }

    /// User approves resolver to create escrows up to a certain amount
    public entry fun approve_escrow_spending(
        user: &signer,
        resolver: address,
        max_amount: u64,
        duration_seconds: u64
    ) acquires EscrowAllowance {
        let user_addr = signer::address_of(user);
        
        if (!exists<EscrowAllowance>(user_addr)) {
            move_to(user, EscrowAllowance {
                allowances: table::new(),
                expiry: timestamp::now_seconds() + duration_seconds,
            });
        };
        
        let allowance = borrow_global_mut<EscrowAllowance>(user_addr);
        allowance.expiry = timestamp::now_seconds() + duration_seconds;
        
        if (table::contains(&allowance.allowances, resolver)) {
            *table::borrow_mut(&mut allowance.allowances, resolver) = max_amount;
        } else {
            table::add(&mut allowance.allowances, resolver, max_amount);
        };
    }

    /// Create escrow using pre-approved allowance
    public entry fun create_escrow_with_allowance(
        resolver: &signer,
        escrow_id: vector<u8>,
        depositor_addr: address,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit_amount: u64
    ) acquires EscrowAllowance {
        let resolver_addr = signer::address_of(resolver);
        
        // Check allowance exists and is sufficient
        assert!(exists<EscrowAllowance>(depositor_addr), E_INSUFFICIENT_BALANCE);
        let allowance = borrow_global_mut<EscrowAllowance>(depositor_addr);
        
        // Check not expired
        assert!(timestamp::now_seconds() < allowance.expiry, E_EXPIRED_PERMIT);
        
        // Check resolver has allowance
        assert!(table::contains(&allowance.allowances, resolver_addr), E_INSUFFICIENT_BALANCE);
        let allowed_amount = *table::borrow(&allowance.allowances, resolver_addr);
        assert!(allowed_amount >= amount + safety_deposit_amount, E_INSUFFICIENT_BALANCE);
        
        // Reduce allowance
        *table::borrow_mut(&mut allowance.allowances, resolver_addr) = allowed_amount - amount - safety_deposit_amount;
        
        // Create escrow (still using resolver funds for now)
        // TODO: Implement actual fund transfer from user
        escrow_v2::create_escrow_delegated(
            resolver,
            escrow_id,
            depositor_addr,
            beneficiary,
            amount,
            hashlock,
            timelock,
            0, // nonce
            timestamp::now_seconds() + 300, // expiry
            safety_deposit_amount,
            vector::empty(), // no pubkey needed
            vector::empty()  // no signature needed
        );
    }
}