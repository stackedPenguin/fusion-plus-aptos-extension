module escrow_v2::escrow_sponsored {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account;
    use aptos_framework::timestamp;
    use escrow_v2::escrow;

    /// Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INVALID_SIGNATURE: u64 = 2;

    /// Resource to track authorized sponsors
    struct AuthorizedSponsors has key {
        sponsors: vector<address>
    }

    /// Initialize the module
    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @escrow_v2, E_NOT_AUTHORIZED);
        
        move_to(admin, AuthorizedSponsors {
            sponsors: vector::empty<address>()
        });
    }

    /// Add a sponsor to the whitelist
    public entry fun add_sponsor(admin: &signer, sponsor: address) acquires AuthorizedSponsors {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @escrow_v2, E_NOT_AUTHORIZED);
        
        let sponsors = borrow_global_mut<AuthorizedSponsors>(@escrow_v2);
        vector::push_back(&mut sponsors.sponsors, sponsor);
    }

    /// Create escrow with sponsor paying gas (user provides signature)
    /// This function can be called by the sponsor, not the user
    public entry fun create_escrow_sponsored(
        sponsor: &signer,
        user_address: address,
        escrow_id: vector<u8>,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit: u64,
        user_signature: vector<u8> // User's signature of the escrow parameters
    ) acquires AuthorizedSponsors {
        // Verify sponsor is authorized
        let sponsor_addr = signer::address_of(sponsor);
        let sponsors = borrow_global<AuthorizedSponsors>(@escrow_v2);
        assert!(vector::contains(&sponsors.sponsors, &sponsor_addr), E_NOT_AUTHORIZED);
        
        // TODO: Verify user signature
        // In production, this would verify that user_signature is a valid signature
        // of the escrow parameters by user_address
        
        // Transfer APT from user's account to escrow
        // This requires the user to have pre-approved the escrow module
        // or we need to use a different mechanism
        
        // For now, we'll use the existing delegated mechanism
        // In a real implementation, we'd need proper signature verification
        escrow::create_escrow_delegated(
            sponsor,
            escrow_id,
            user_address, // depositor
            beneficiary,
            amount,
            hashlock,
            timelock,
            safety_deposit,
            0, // nonce
            timestamp::now_seconds() + 300, // expiry
            user_signature // This would be the actual signature
        );
    }

    /// Alternative: Create escrow with user's pre-approval
    /// User must call approve_sponsor first
    struct SponsorApproval has key {
        approved_sponsors: vector<address>,
        max_amount: u64,
        expiry: u64
    }

    /// User approves a sponsor to create escrows on their behalf
    public entry fun approve_sponsor(
        user: &signer,
        sponsor: address,
        max_amount: u64,
        duration_seconds: u64
    ) {
        let user_addr = signer::address_of(user);
        let expiry = timestamp::now_seconds() + duration_seconds;
        
        if (!exists<SponsorApproval>(user_addr)) {
            move_to(user, SponsorApproval {
                approved_sponsors: vector::empty<address>(),
                max_amount,
                expiry
            });
        };
        
        let approval = borrow_global_mut<SponsorApproval>(user_addr);
        vector::push_back(&mut approval.approved_sponsors, sponsor);
        approval.max_amount = max_amount;
        approval.expiry = expiry;
    }

    /// Create escrow using pre-approval
    public entry fun create_escrow_with_approval(
        sponsor: &signer,
        user_address: address,
        escrow_id: vector<u8>,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit: u64
    ) acquires SponsorApproval {
        let sponsor_addr = signer::address_of(sponsor);
        
        // Check if sponsor has approval from user
        assert!(exists<SponsorApproval>(user_address), E_NOT_AUTHORIZED);
        let approval = borrow_global<SponsorApproval>(user_address);
        assert!(vector::contains(&approval.approved_sponsors, &sponsor_addr), E_NOT_AUTHORIZED);
        assert!(amount <= approval.max_amount, E_NOT_AUTHORIZED);
        assert!(timestamp::now_seconds() < approval.expiry, E_NOT_AUTHORIZED);
        
        // Use existing delegated mechanism
        // In production, this would directly transfer from user's account
        escrow::create_escrow_delegated(
            sponsor,
            escrow_id,
            user_address, // depositor
            beneficiary,
            amount,
            hashlock,
            timelock,
            safety_deposit,
            0, // nonce
            timestamp::now_seconds() + 300, // expiry
            vector::empty<u8>() // No signature needed with pre-approval
        );
    }
}