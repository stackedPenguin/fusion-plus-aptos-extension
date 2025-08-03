// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FusionPlusGaslessEscrow
 * @notice Enables true gasless cross-chain swaps from WETH to APT
 * @dev Supports both EIP-2612 permits and meta-transactions for WETH
 */
contract FusionPlusGaslessEscrow is EIP712, ReentrancyGuard {
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

    // EIP-712 typehash for meta-transaction escrow creation
    bytes32 public constant CREATE_ESCROW_TYPEHASH = keccak256(
        "CreateEscrow(bytes32 escrowId,address depositor,address beneficiary,address token,uint256 amount,bytes32 hashlock,uint256 timelock,uint256 nonce,uint256 deadline)"
    );

    mapping(bytes32 => Escrow) public escrows;
    mapping(address => uint256) public nonces;
    
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
    
    event EscrowWithdrawn(bytes32 indexed escrowId, bytes32 secret);
    event EscrowRefunded(bytes32 indexed escrowId);

    error PermitExpired();
    error InvalidSignature();
    error InsufficientBalance();
    error EscrowAlreadyExists();
    error InvalidAmount();
    error InvalidTimelock();

    constructor() EIP712("FusionPlusGaslessEscrow", "1") {}

    /**
     * @notice Create escrow using EIP-2612 permit for tokens that support it
     * @dev Resolver pays gas, user only signs permit
     */
    function createEscrowWithPermit(
        bytes32 _escrowId,
        address _depositor,
        address _beneficiary,
        address _token,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock,
        uint256 _deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant {
        if (escrows[_escrowId].depositor != address(0)) revert EscrowAlreadyExists();
        if (_amount == 0) revert InvalidAmount();
        if (_timelock <= block.timestamp) revert InvalidTimelock();
        if (block.timestamp > _deadline) revert PermitExpired();
        
        // For tokens that support EIP-2612 (not WETH)
        if (_token != WETH && _token != address(0)) {
            // Use permit to get approval
            IERC20Permit(_token).permit(_depositor, address(this), _amount, _deadline, v, r, s);
        }
        
        _createEscrowInternal(
            _escrowId,
            _depositor,
            _beneficiary,
            _token,
            _amount,
            _hashlock,
            _timelock
        );
    }

    // Struct for meta-tx parameters to avoid stack too deep
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

    /**
     * @notice Create escrow using meta-transaction for WETH and other tokens
     * @dev Supports WETH which doesn't have permit functionality
     */
    function createEscrowWithMetaTx(
        MetaTxParams calldata params,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant {
        _validateAndExecuteMetaTx(params, v, r, s);
    }

    function _validateAndExecuteMetaTx(
        MetaTxParams calldata params,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        if (escrows[params.escrowId].depositor != address(0)) revert EscrowAlreadyExists();
        if (params.amount == 0) revert InvalidAmount();
        if (params.timelock <= block.timestamp) revert InvalidTimelock();
        if (block.timestamp > params.deadline) revert PermitExpired();

        // Verify meta-transaction signature
        uint256 currentNonce = nonces[params.depositor];
        
        bytes32 structHash = keccak256(
            abi.encode(
                CREATE_ESCROW_TYPEHASH,
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

        // For WETH, we need pre-approval
        _createEscrowInternal(
            params.escrowId,
            params.depositor,
            params.beneficiary,
            params.token,
            params.amount,
            params.hashlock,
            params.timelock
        );
    }


    function _createEscrowInternal(
        bytes32 _escrowId,
        address _depositor,
        address _beneficiary,
        address _token,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock
    ) internal {
        require(msg.value > 0, "Safety deposit required");

        if (_token == address(0)) {
            // ETH transfer
            require(msg.value >= _amount, "Insufficient ETH sent");
            escrows[_escrowId] = Escrow({
                depositor: _depositor,
                beneficiary: _beneficiary,
                token: _token,
                amount: _amount,
                hashlock: _hashlock,
                timelock: _timelock,
                withdrawn: false,
                refunded: false,
                safetyDeposit: msg.value - _amount
            });
        } else {
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
                safetyDeposit: msg.value
            });
        }

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

        if (escrow.token == address(0)) {
            // Transfer ETH
            payable(escrow.beneficiary).transfer(escrow.amount);
        } else {
            // Transfer ERC20
            IERC20(escrow.token).safeTransfer(escrow.beneficiary, escrow.amount);
        }
        
        // Transfer safety deposit to the withdrawer
        payable(msg.sender).transfer(escrow.safetyDeposit);

        emit EscrowWithdrawn(_escrowId, _secret);
    }

    function refund(bytes32 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];
        require(escrow.depositor != address(0), "Escrow does not exist");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.refunded, "Already refunded");
        require(block.timestamp >= escrow.timelock, "Timelock not expired");

        escrow.refunded = true;

        if (escrow.token == address(0)) {
            // Refund ETH to depositor
            payable(escrow.depositor).transfer(escrow.amount);
        } else {
            // Refund ERC20 to depositor
            IERC20(escrow.token).safeTransfer(escrow.depositor, escrow.amount);
        }
        
        // Transfer safety deposit to the refunder (incentive)
        payable(msg.sender).transfer(escrow.safetyDeposit);

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
}