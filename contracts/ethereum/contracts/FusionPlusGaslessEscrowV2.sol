// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FusionPlusGaslessEscrowV2
 * @notice Enables gasless cross-chain swaps with support for partial fills using Merkle tree of secrets
 * @dev Uses a single signature for multiple partial fills via Merkle tree validation
 */
contract FusionPlusGaslessEscrowV2 is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct Escrow {
        address depositor;
        address beneficiary;
        address token;
        uint256 amount;
        bytes32 hashlock;
        uint256 timelock;
        bool withdrawn;
        bool refunded;
        uint256 safetyDeposit;
    }

    struct PartialFillOrder {
        bytes32 baseOrderId;      // Base order ID from which partial escrows are derived
        address depositor;        // The user who created the order
        address beneficiary;      // The beneficiary of the order
        uint256 totalAmount;      // Total amount that can be filled
        uint256 filledAmount;     // Amount already filled
        bytes32 merkleRoot;       // Root of the Merkle tree of secret hashes
        uint256 numFills;         // Maximum number of partial fills allowed
    }

    // Updated EIP-712 typehash for partial fill support
    bytes32 public constant CREATE_PARTIAL_FILL_ORDER_TYPEHASH = keccak256(
        "CreatePartialFillOrder(bytes32 baseOrderId,address depositor,address beneficiary,address token,uint256 totalAmount,bytes32 merkleRoot,uint256 numFills,uint256 timelock,uint256 nonce,uint256 deadline)"
    );

    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => PartialFillOrder) public partialFillOrders;
    mapping(address => uint256) public nonces;
    
    // Track which Merkle tree indices have been used for each order
    mapping(bytes32 => mapping(uint256 => bool)) public usedMerkleIndices;
    
    // WETH address (sepolia)
    address public constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed depositor,
        address indexed beneficiary,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );
    
    event PartialFillOrderCreated(
        bytes32 indexed baseOrderId,
        address indexed depositor,
        address indexed beneficiary,
        uint256 totalAmount,
        bytes32 merkleRoot,
        uint256 numFills
    );
    
    event EscrowWithdrawn(bytes32 indexed escrowId, bytes32 secret);
    event EscrowRefunded(bytes32 indexed escrowId);

    error PermitExpired();
    error InvalidSignature();
    error InsufficientBalance();
    error EscrowAlreadyExists();
    error InvalidAmount();
    error InvalidTimelock();
    error ExceedsTotalAmount();
    error InvalidMerkleIndex();
    error MerkleIndexAlreadyUsed();
    error OrderDoesNotExist();

    constructor() EIP712("FusionPlusGaslessEscrowV2", "1") {}

    // Struct for partial fill meta-tx parameters
    struct PartialFillMetaTxParams {
        bytes32 baseOrderId;
        address depositor;
        address beneficiary;
        address token;
        uint256 totalAmount;
        bytes32 merkleRoot;
        uint256 numFills;
        uint256 timelock;
        uint256 deadline;
    }

    /**
     * @notice Create a partial fill order that allows multiple escrows with a single signature
     * @dev User signs once for the total amount and Merkle root of all possible secret hashes
     */
    function createPartialFillOrder(
        PartialFillMetaTxParams calldata params,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (params.totalAmount == 0) revert InvalidAmount();
        if (params.timelock <= block.timestamp) revert InvalidTimelock();
        if (block.timestamp > params.deadline) revert PermitExpired();
        if (partialFillOrders[params.baseOrderId].depositor != address(0)) revert EscrowAlreadyExists();

        // Verify meta-transaction signature
        uint256 currentNonce = nonces[params.depositor];
        
        bytes32 structHash = keccak256(
            abi.encode(
                CREATE_PARTIAL_FILL_ORDER_TYPEHASH,
                params.baseOrderId,
                params.depositor,
                params.beneficiary,
                params.token,
                params.totalAmount,
                params.merkleRoot,
                params.numFills,
                params.timelock,
                currentNonce,
                params.deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        
        if (signer != params.depositor) revert InvalidSignature();

        // Increment nonce AFTER successful verification
        nonces[params.depositor]++;

        // Store the partial fill order
        partialFillOrders[params.baseOrderId] = PartialFillOrder({
            baseOrderId: params.baseOrderId,
            depositor: params.depositor,
            beneficiary: params.beneficiary,
            totalAmount: params.totalAmount,
            filledAmount: 0,
            merkleRoot: params.merkleRoot,
            numFills: params.numFills
        });

        emit PartialFillOrderCreated(
            params.baseOrderId,
            params.depositor,
            params.beneficiary,
            params.totalAmount,
            params.merkleRoot,
            params.numFills
        );
    }

    /**
     * @notice Create an escrow for a partial fill using a hash from the Merkle tree
     * @param baseOrderId The base order ID from the signed message
     * @param fillIndex The index in the Merkle tree (determines which secret hash to use)
     * @param amount The amount for this partial fill
     * @param hashlock The hash of the secret for this specific fill (must be in Merkle tree)
     * @param merkleProof Proof that this hashlock is part of the signed Merkle tree
     */
    function createPartialFillEscrow(
        bytes32 baseOrderId,
        uint256 fillIndex,
        uint256 amount,
        bytes32 hashlock,
        bytes32[] calldata merkleProof
    ) external payable nonReentrant {
        PartialFillOrder storage order = partialFillOrders[baseOrderId];
        if (order.depositor == address(0)) revert OrderDoesNotExist();
        if (fillIndex >= order.numFills) revert InvalidMerkleIndex();
        if (usedMerkleIndices[baseOrderId][fillIndex]) revert MerkleIndexAlreadyUsed();
        if (order.filledAmount + amount > order.totalAmount) revert ExceedsTotalAmount();
        
        // Verify the hashlock is part of the Merkle tree
        require(
            verifyMerkleProof(merkleProof, order.merkleRoot, hashlock, fillIndex),
            "Invalid Merkle proof"
        );
        
        // Mark this index as used
        usedMerkleIndices[baseOrderId][fillIndex] = true;
        
        // Update filled amount
        order.filledAmount += amount;
        
        // Generate unique escrow ID for this partial fill
        bytes32 escrowId = keccak256(abi.encodePacked(baseOrderId, fillIndex));
        
        // Get order details from the original signed data
        // Note: In production, you'd store these details in the PartialFillOrder struct
        // For now, we'll use msg.sender as resolver (caller)
        address beneficiary = msg.sender; // Resolver creating the escrow
        
        // Safety deposit required from resolver
        require(msg.value > 0, "Safety deposit required");
        
        // Create the actual escrow
        _createEscrowInternal(
            escrowId,
            order.depositor,
            beneficiary,
            WETH, // Token is always WETH for gasless
            amount,
            hashlock,
            block.timestamp + 3600, // 1 hour timelock for partial fills
            msg.value
        );
    }

    /**
     * @notice Verify a Merkle proof for a hashlock at a specific index
     * @dev Uses standard Merkle tree verification
     */
    function verifyMerkleProof(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf,
        uint256 index
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (index % 2 == 0) {
                // Hash(current, proof)
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                // Hash(proof, current)
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
            
            index = index / 2;
        }
        
        return computedHash == root;
    }

    /**
     * @notice Create escrow with backwards compatibility (for non-partial fills)
     */
    function createEscrowWithMetaTx(
        MetaTxParams calldata params,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant {
        if (params.amount == 0) revert InvalidAmount();
        if (params.timelock <= block.timestamp) revert InvalidTimelock();
        if (block.timestamp > params.deadline) revert PermitExpired();
        if (escrows[params.escrowId].depositor != address(0)) revert EscrowAlreadyExists();

        // Verify meta-transaction signature
        uint256 currentNonce = nonces[params.depositor];
        
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("CreateEscrow(bytes32 escrowId,address depositor,address beneficiary,address token,uint256 amount,bytes32 hashlock,uint256 timelock,uint256 nonce,uint256 deadline)"),
                params.escrowId,
                params.depositor,
                params.beneficiary,
                params.token,
                params.amount,
                params.hashlock,
                params.timelock,
                currentNonce,
                params.deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        
        if (signer != params.depositor) revert InvalidSignature();

        // Increment nonce AFTER successful verification
        nonces[params.depositor]++;

        // Create the escrow using internal function
        _createEscrowInternal(
            params.escrowId,
            params.depositor,
            params.beneficiary,
            params.token,
            params.amount,
            params.hashlock,
            params.timelock,
            msg.value // Use msg.value as safety deposit
        );
    }

    // Struct for meta-tx parameters (backwards compatibility)
    struct MetaTxParams {
        bytes32 escrowId;
        address depositor;
        address beneficiary;
        address token;
        uint256 amount;
        bytes32 hashlock;
        uint256 timelock;
        uint256 deadline;
    }


    function _createEscrowInternal(
        bytes32 _escrowId,
        address _depositor,
        address _beneficiary,
        address _token,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock,
        uint256 _safetyDeposit
    ) internal {
        if (escrows[_escrowId].depositor != address(0)) revert EscrowAlreadyExists();
        
        // ERC20 transfer - pull from depositor
        uint256 balanceBefore = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransferFrom(_depositor, address(this), _amount);
        uint256 balanceAfter = IERC20(_token).balanceOf(address(this));
        
        // Verify the exact amount was transferred
        require(balanceAfter - balanceBefore >= _amount, "Insufficient transfer");
        
        escrows[_escrowId] = Escrow({
            depositor: _depositor,
            beneficiary: _beneficiary,
            token: _token,
            amount: _amount,
            hashlock: _hashlock,
            timelock: _timelock,
            withdrawn: false,
            refunded: false,
            safetyDeposit: _safetyDeposit
        });

        emit EscrowCreated(
            _escrowId,
            _depositor,
            _beneficiary,
            _token,
            _amount,
            _hashlock,
            _timelock
        );
    }

    function withdraw(bytes32 _escrowId, bytes32 _secret) external {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.depositor != address(0), "Escrow does not exist");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.refunded, "Already refunded");
        require(keccak256(abi.encodePacked(_secret)) == escrow.hashlock, "Invalid secret");

        escrow.withdrawn = true;

        // Transfer ERC20
        IERC20(escrow.token).safeTransfer(escrow.beneficiary, escrow.amount);
        
        // Transfer safety deposit to the withdrawer
        if (escrow.safetyDeposit > 0) {
            payable(msg.sender).transfer(escrow.safetyDeposit);
        }

        emit EscrowWithdrawn(_escrowId, _secret);
    }

    function refund(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.depositor != address(0), "Escrow does not exist");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.refunded, "Already refunded");
        require(block.timestamp >= escrow.timelock, "Timelock not expired");

        escrow.refunded = true;

        // Refund ERC20 to depositor
        IERC20(escrow.token).safeTransfer(escrow.depositor, escrow.amount);
        
        // Transfer safety deposit to the refunder (incentive)
        if (escrow.safetyDeposit > 0) {
            payable(msg.sender).transfer(escrow.safetyDeposit);
        }

        emit EscrowRefunded(_escrowId);
    }

    function getEscrow(bytes32 _escrowId) external view returns (
        address depositor,
        address beneficiary,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        bool withdrawn,
        bool refunded,
        uint256 safetyDeposit
    ) {
        Escrow memory escrow = escrows[_escrowId];
        return (
            escrow.depositor,
            escrow.beneficiary,
            escrow.token,
            escrow.amount,
            escrow.hashlock,
            escrow.timelock,
            escrow.withdrawn,
            escrow.refunded,
            escrow.safetyDeposit
        );
    }

    function getPartialFillOrder(bytes32 _baseOrderId) external view returns (
        uint256 totalAmount,
        uint256 filledAmount,
        bytes32 merkleRoot,
        uint256 numFills
    ) {
        PartialFillOrder memory order = partialFillOrders[_baseOrderId];
        return (
            order.totalAmount,
            order.filledAmount,
            order.merkleRoot,
            order.numFills
        );
    }

    /**
     * @notice Get the current nonce for meta-transactions
     */
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    /**
     * @notice Get the domain separator for EIP-712
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Simple gasless partial fill - individual signature per fill (no merkle tree)
     * @dev Each partial fill is signed individually, just like regular escrows
     */
    function createGaslessPartialFillEscrow(
        MetaTxParams calldata params,
        bytes32 baseOrderId,
        uint256 fillIndex,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant {
        // Basic validations
        if (params.amount == 0) revert InvalidAmount();
        if (params.timelock <= block.timestamp) revert InvalidTimelock();
        if (block.timestamp > params.deadline) revert PermitExpired();
        
        // Calculate the actual partial fill escrow ID
        bytes32 actualEscrowId = keccak256(abi.encodePacked(baseOrderId, fillIndex));
        if (escrows[actualEscrowId].depositor != address(0)) revert EscrowAlreadyExists();
        
        // Verify signature and increment nonce
        _verifySignatureAndUpdateNonce(params, v, r, s);

        // Create the escrow using the ACTUAL escrow ID (baseOrderId + fillIndex)
        _createEscrowInternal(
            actualEscrowId,
            params.depositor,
            params.beneficiary,
            params.token,
            params.amount,
            params.hashlock,
            params.timelock,
            msg.value
        );

        emit EscrowCreated(
            actualEscrowId,
            params.depositor,
            params.beneficiary,
            params.token,
            params.amount,
            params.hashlock,
            params.timelock
        );
    }

    /**
     * @notice Internal function to verify signature and update nonce (to reduce stack depth)
     */
    function _verifySignatureAndUpdateNonce(
        MetaTxParams calldata params,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        uint256 currentNonce = nonces[params.depositor];
        
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("CreateEscrow(bytes32 escrowId,address depositor,address beneficiary,address token,uint256 amount,bytes32 hashlock,uint256 timelock,uint256 nonce,uint256 deadline)"),
                params.escrowId,
                params.depositor,
                params.beneficiary,
                params.token,
                params.amount,
                params.hashlock,
                params.timelock,
                currentNonce,
                params.deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);
        
        if (signer != params.depositor) revert InvalidSignature();
        nonces[params.depositor]++;
    }
}