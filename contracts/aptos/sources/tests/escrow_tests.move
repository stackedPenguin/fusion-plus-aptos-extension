#[test_only]
module fusion_plus::escrow_tests {
    use std::signer;
    use std::hash;
    use aptos_framework::account;
    use aptos_framework::aptos_account;
    use aptos_framework::aptos_coin::{Self, AptosCoin};
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use fusion_plus::escrow;

    fun setup_test(): (signer, signer, signer) {
        // Create test accounts
        let aptos_framework = account::create_account_for_test(@0x1);
        timestamp::set_time_has_started_for_testing(&aptos_framework);
        
        let fusion_plus = account::create_account_for_test(@fusion_plus);
        let alice = account::create_account_for_test(@0x123);
        let bob = account::create_account_for_test(@0x456);
        let resolver = account::create_account_for_test(@0x789);

        // Initialize AptosCoin
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(&aptos_framework);

        // Mint coins for testing
        aptos_account::deposit_coins(signer::address_of(&alice), coin::mint(1000000, &mint_cap));
        aptos_account::deposit_coins(signer::address_of(&resolver), coin::mint(1000000, &mint_cap));

        // Clean up capabilities
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);

        // Initialize escrow module
        escrow::initialize(&fusion_plus);

        (alice, bob, resolver)
    }

    #[test]
    fun test_create_and_withdraw_escrow() {
        let (alice, bob, resolver) = setup_test();
        
        let escrow_id = b"test_escrow_001";
        let secret = b"my_secret_123";
        let hashlock = hash::sha3_256(secret);
        let amount = 100000;
        let safety_deposit = 10000;
        let timelock = timestamp::now_seconds() + 3600; // 1 hour from now

        // Alice creates escrow for Bob
        escrow::create_escrow(
            &alice,
            escrow_id,
            signer::address_of(&bob),
            amount,
            hashlock,
            timelock,
            safety_deposit
        );

        // Check balances before withdrawal
        let bob_balance_before = coin::balance<AptosCoin>(signer::address_of(&bob));
        let resolver_balance_before = coin::balance<AptosCoin>(signer::address_of(&resolver));

        // Resolver withdraws using correct secret
        escrow::withdraw(&resolver, escrow_id, secret);

        // Check balances after withdrawal
        let bob_balance_after = coin::balance<AptosCoin>(signer::address_of(&bob));
        let resolver_balance_after = coin::balance<AptosCoin>(signer::address_of(&resolver));

        assert!(bob_balance_after == bob_balance_before + amount, 1);
        assert!(resolver_balance_after == resolver_balance_before + safety_deposit, 2);
    }

    #[test]
    #[expected_failure(abort_code = escrow::E_INVALID_SECRET)]
    fun test_withdraw_with_wrong_secret() {
        let (alice, bob, resolver) = setup_test();
        
        let escrow_id = b"test_escrow_002";
        let secret = b"my_secret_123";
        let wrong_secret = b"wrong_secret";
        let hashlock = hash::sha3_256(secret);
        let amount = 100000;
        let safety_deposit = 10000;
        let timelock = timestamp::now_seconds() + 3600;

        escrow::create_escrow(
            &alice,
            escrow_id,
            signer::address_of(&bob),
            amount,
            hashlock,
            timelock,
            safety_deposit
        );

        // Try to withdraw with wrong secret
        escrow::withdraw(&resolver, escrow_id, wrong_secret);
    }

    #[test]
    fun test_refund_after_timelock() {
        let (alice, bob, resolver) = setup_test();
        
        let escrow_id = b"test_escrow_003";
        let secret = b"my_secret_123";
        let hashlock = hash::sha3_256(secret);
        let amount = 100000;
        let safety_deposit = 10000;
        let timelock = timestamp::now_seconds() + 100; // 100 seconds from now

        // Alice creates escrow
        let alice_balance_before = coin::balance<AptosCoin>(signer::address_of(&alice));
        
        escrow::create_escrow(
            &alice,
            escrow_id,
            signer::address_of(&bob),
            amount,
            hashlock,
            timelock,
            safety_deposit
        );

        // Fast forward time
        timestamp::fast_forward_seconds(101);

        // Resolver refunds
        let resolver_balance_before = coin::balance<AptosCoin>(signer::address_of(&resolver));
        escrow::refund(&resolver, escrow_id);

        // Check balances
        let alice_balance_after = coin::balance<AptosCoin>(signer::address_of(&alice));
        let resolver_balance_after = coin::balance<AptosCoin>(signer::address_of(&resolver));

        assert!(alice_balance_after == alice_balance_before - safety_deposit, 1);
        assert!(resolver_balance_after == resolver_balance_before + safety_deposit, 2);
    }

    #[test]
    #[expected_failure(abort_code = escrow::E_TIMELOCK_NOT_EXPIRED)]
    fun test_refund_before_timelock() {
        let (alice, bob, resolver) = setup_test();
        
        let escrow_id = b"test_escrow_004";
        let secret = b"my_secret_123";
        let hashlock = hash::sha3_256(secret);
        let amount = 100000;
        let safety_deposit = 10000;
        let timelock = timestamp::now_seconds() + 3600;

        escrow::create_escrow(
            &alice,
            escrow_id,
            signer::address_of(&bob),
            amount,
            hashlock,
            timelock,
            safety_deposit
        );

        // Try to refund before timelock expires
        escrow::refund(&resolver, escrow_id);
    }

    #[test]
    #[expected_failure(abort_code = escrow::E_ESCROW_ALREADY_EXISTS)]
    fun test_duplicate_escrow_id() {
        let (alice, bob, _resolver) = setup_test();
        
        let escrow_id = b"test_escrow_005";
        let secret = b"my_secret_123";
        let hashlock = hash::sha3_256(secret);
        let amount = 100000;
        let safety_deposit = 10000;
        let timelock = timestamp::now_seconds() + 3600;

        // Create first escrow
        escrow::create_escrow(
            &alice,
            escrow_id,
            signer::address_of(&bob),
            amount,
            hashlock,
            timelock,
            safety_deposit
        );

        // Try to create another with same ID
        escrow::create_escrow(
            &alice,
            escrow_id,
            signer::address_of(&bob),
            amount,
            hashlock,
            timelock,
            safety_deposit
        );
    }
}