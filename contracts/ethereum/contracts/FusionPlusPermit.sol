// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FusionPlusPermit
 * @notice Handles gasless approvals and transfers for Fusion+ cross-chain swaps
 * @dev Uses EIP-712 typed data signing for secure, gasless permits
 */
contract FusionPlusPermit is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // Permit typehash for EIP-712
    bytes32 public constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    // Mapping from owner to nonce for replay protection
    mapping(address => uint256) public nonces;

    // Mapping to track used permits (for additional safety)
    mapping(bytes32 => bool) public usedPermits;

    // Events
    event PermitUsed(
        address indexed owner,
        address indexed spender,
        uint256 value,
        uint256 nonce
    );

    event TransferWithPermit(
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 amount
    );

    // Errors
    error PermitExpired();
    error InvalidSignature();
    error PermitAlreadyUsed();
    error InsufficientBalance();
    error TransferFailed();

    constructor() EIP712("Fusion+ Cross-Chain Swap", "1") {}

    /**
     * @notice Transfer tokens using a signed permit
     * @param owner The token owner who signed the permit
     * @param spender The address allowed to spend (should be msg.sender)
     * @param value The amount of tokens to transfer
     * @param deadline The permit expiry timestamp
     * @param v The recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     * @param token The token to transfer (address(0) for ETH)
     * @param to The recipient of the tokens
     */
    function transferWithPermit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address token,
        address to
    ) external nonReentrant {
        // Check deadline
        if (block.timestamp > deadline) revert PermitExpired();
        
        // Check spender is msg.sender
        require(spender == msg.sender, "Spender must be msg.sender");

        // Get current nonce for verification
        uint256 currentNonce = nonces[owner];

        // Create permit hash
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                owner,
                spender,
                value,
                currentNonce,
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);

        // Check if permit was already used
        if (usedPermits[hash]) revert PermitAlreadyUsed();

        // Verify signature
        address signer = ECDSA.recover(hash, v, r, s);
        if (signer != owner) revert InvalidSignature();

        // Increment nonce AFTER successful verification
        nonces[owner]++;

        // Mark permit as used
        usedPermits[hash] = true;

        // Emit permit used event
        emit PermitUsed(owner, spender, value, currentNonce);

        // Execute transfer
        if (token == address(0)) {
            // ETH transfer
            if (address(this).balance < value) revert InsufficientBalance();
            (bool success, ) = to.call{value: value}("");
            if (!success) revert TransferFailed();
        } else {
            // ERC20 transfer
            IERC20(token).safeTransferFrom(owner, to, value);
        }

        emit TransferWithPermit(owner, to, token, value);
    }

    /**
     * @notice Get the current nonce for an owner
     * @param owner The address to check
     * @return The current nonce
     */
    function getNonce(address owner) external view returns (uint256) {
        return nonces[owner];
    }

    /**
     * @notice Check if a permit has been used
     * @param owner The token owner
     * @param spender The spender
     * @param value The amount
     * @param nonce The nonce
     * @param deadline The deadline
     * @return Whether the permit has been used
     */
    function isPermitUsed(
        address owner,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                owner,
                spender,
                value,
                nonce,
                deadline
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        return usedPermits[hash];
    }

    /**
     * @notice Get the domain separator for EIP-712
     * @return The domain separator
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // Receive ETH
    receive() external payable {}
}