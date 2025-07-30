// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LayerZeroAdapter
 * @notice Adapter for cross-chain secret reveals using LayerZero V2
 * @dev Simplified implementation for Fusion+ protocol
 */
contract LayerZeroAdapter is Ownable {
    // Events
    event SecretRevealSent(uint32 dstEid, bytes32 escrowId, bytes32 secret, address revealer);
    event SecretRevealReceived(uint32 srcEid, bytes32 escrowId, bytes32 secret, address revealer);
    
    // Track revealed secrets
    mapping(bytes32 => bytes32) public revealedSecrets; // escrowId => secret
    mapping(bytes32 => address) public revealers; // escrowId => revealer address
    
    // LayerZero endpoint (to be set)
    address public lzEndpoint;
    
    // Trusted remote addresses (chainId => trustedRemote)
    mapping(uint32 => bytes32) public trustedRemotes;
    
    constructor(address _owner) Ownable(_owner) {}
    
    /**
     * @notice Set the LayerZero endpoint
     * @param _endpoint The LayerZero endpoint address
     */
    function setLzEndpoint(address _endpoint) external onlyOwner {
        lzEndpoint = _endpoint;
    }
    
    /**
     * @notice Set trusted remote for a chain
     * @param _remoteChainId The remote chain ID
     * @param _remoteAddress The trusted remote address
     */
    function setTrustedRemote(uint32 _remoteChainId, bytes32 _remoteAddress) external onlyOwner {
        trustedRemotes[_remoteChainId] = _remoteAddress;
    }
    
    /**
     * @notice Send a secret reveal to another chain
     * @param _dstEid Destination endpoint ID  
     * @param _escrowId The escrow ID to reveal secret for
     * @param _secret The secret to reveal
     */
    function sendSecretReveal(
        uint32 _dstEid,
        bytes32 _escrowId,
        bytes32 _secret
    ) external payable {
        require(lzEndpoint != address(0), "LZ endpoint not set");
        
        // Store locally
        revealedSecrets[_escrowId] = _secret;
        revealers[_escrowId] = msg.sender;
        
        emit SecretRevealSent(_dstEid, _escrowId, _secret, msg.sender);
        
        // In production, this would call LayerZero endpoint
        // For now, we just emit the event
    }
    
    /**
     * @notice Receive a secret reveal from another chain
     * @dev This would be called by LayerZero endpoint in production
     * @param _srcEid Source endpoint ID
     * @param _escrowId The escrow ID
     * @param _secret The revealed secret
     * @param _revealer The address that revealed the secret
     */
    function receiveSecretReveal(
        uint32 _srcEid,
        bytes32 _escrowId,
        bytes32 _secret,
        address _revealer
    ) external {
        // In production, verify msg.sender is LZ endpoint
        // and message is from trusted remote
        
        // Store the revealed secret
        revealedSecrets[_escrowId] = _secret;
        revealers[_escrowId] = _revealer;
        
        emit SecretRevealReceived(_srcEid, _escrowId, _secret, _revealer);
    }
    
    /**
     * @notice Check if a secret has been revealed for an escrow
     * @param _escrowId The escrow ID to check
     * @return hasSecret Whether a secret has been revealed
     * @return secret The revealed secret (or 0x0 if not revealed)
     */
    function getRevealedSecret(bytes32 _escrowId) 
        external 
        view 
        returns (bool hasSecret, bytes32 secret) 
    {
        secret = revealedSecrets[_escrowId];
        hasSecret = (secret != bytes32(0));
    }
}