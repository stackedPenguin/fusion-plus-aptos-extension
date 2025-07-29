module fusion_plus::escrow {
    use std::signer;
    use aptos_framework::timestamp;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_std::table::{Self, Table};

    /// Error codes
    const E_ESCROW_ALREADY_EXISTS: u64 = 1;
    const E_ESCROW_NOT_FOUND: u64 = 2;
    const E_INVALID_SECRET: u64 = 3;
    const E_ALREADY_WITHDRAWN: u64 = 4;
    const E_ALREADY_REFUNDED: u64 = 5;
    const E_TIMELOCK_NOT_EXPIRED: u64 = 6;
    const E_INVALID_AMOUNT: u64 = 7;
    const E_INVALID_TIMELOCK: u64 = 8;
    const E_INSUFFICIENT_SAFETY_DEPOSIT: u64 = 9;

    struct Escrow has store {
        depositor: address,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        withdrawn: bool,
        refunded: bool,
        safety_deposit: u64,
        escrowed_coin: Coin<AptosCoin>
    }

    struct EscrowStore has key {
        escrows: Table<vector<u8>, Escrow>,
        safety_deposits: Table<vector<u8>, Coin<AptosCoin>>
    }

    /// Initialize the escrow store for an account
    public entry fun initialize(account: &signer) {
        let escrow_store = EscrowStore {
            escrows: table::new(),
            safety_deposits: table::new()
        };
        move_to(account, escrow_store);
    }

    /// Create a new escrow
    public entry fun create_escrow(
        depositor: &signer,
        escrow_id: vector<u8>,
        beneficiary: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        safety_deposit_amount: u64
    ) acquires EscrowStore {
        let depositor_addr = signer::address_of(depositor);
        
        // Ensure the escrow store exists at the fusion_plus address
        assert!(exists<EscrowStore>(@fusion_plus), E_ESCROW_NOT_FOUND);

        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        // Check if escrow already exists
        assert!(!table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_ALREADY_EXISTS);
        assert!(amount > 0, E_INVALID_AMOUNT);
        assert!(timelock > timestamp::now_seconds(), E_INVALID_TIMELOCK);
        assert!(safety_deposit_amount > 0, E_INSUFFICIENT_SAFETY_DEPOSIT);

        // Transfer coins from depositor
        let escrowed_coin = coin::withdraw<AptosCoin>(depositor, amount);
        let safety_deposit = coin::withdraw<AptosCoin>(depositor, safety_deposit_amount);

        let escrow = Escrow {
            depositor: depositor_addr,
            beneficiary,
            amount,
            hashlock,
            timelock,
            withdrawn: false,
            refunded: false,
            safety_deposit: safety_deposit_amount,
            escrowed_coin
        };

        table::add(&mut escrow_store.escrows, escrow_id, escrow);
        table::add(&mut escrow_store.safety_deposits, escrow_id, safety_deposit);
    }

    /// Withdraw funds using the correct secret
    public entry fun withdraw(
        withdrawer: &signer,
        escrow_id: vector<u8>,
        secret: vector<u8>
    ) acquires EscrowStore {
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        assert!(table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_NOT_FOUND);
        
        let escrow = table::borrow_mut(&mut escrow_store.escrows, escrow_id);
        
        assert!(!escrow.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.refunded, E_ALREADY_REFUNDED);
        
        // Verify the secret
        let secret_hash = std::hash::sha3_256(secret);
        assert!(secret_hash == escrow.hashlock, E_INVALID_SECRET);
        
        escrow.withdrawn = true;
        
        // Transfer escrowed coins to beneficiary
        let amount = escrow.amount;
        let beneficiary = escrow.beneficiary;
        let coin_to_transfer = coin::extract(&mut escrow.escrowed_coin, amount);
        coin::deposit(beneficiary, coin_to_transfer);
        
        // Transfer safety deposit to withdrawer
        let safety_deposit = table::remove(&mut escrow_store.safety_deposits, escrow_id);
        coin::deposit(signer::address_of(withdrawer), safety_deposit);
    }

    /// Refund funds after timelock expires
    public entry fun refund(
        refunder: &signer,
        escrow_id: vector<u8>
    ) acquires EscrowStore {
        let escrow_store = borrow_global_mut<EscrowStore>(@fusion_plus);
        
        assert!(table::contains(&escrow_store.escrows, escrow_id), E_ESCROW_NOT_FOUND);
        
        let escrow = table::borrow_mut(&mut escrow_store.escrows, escrow_id);
        
        assert!(!escrow.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.refunded, E_ALREADY_REFUNDED);
        assert!(timestamp::now_seconds() >= escrow.timelock, E_TIMELOCK_NOT_EXPIRED);
        
        escrow.refunded = true;
        
        // Transfer escrowed coins back to depositor
        let amount = escrow.amount;
        let depositor = escrow.depositor;
        let coin_to_transfer = coin::extract(&mut escrow.escrowed_coin, amount);
        coin::deposit(depositor, coin_to_transfer);
        
        // Transfer safety deposit to refunder
        let safety_deposit = table::remove(&mut escrow_store.safety_deposits, escrow_id);
        coin::deposit(signer::address_of(refunder), safety_deposit);
    }

}