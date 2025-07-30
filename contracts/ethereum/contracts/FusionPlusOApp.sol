// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { MessagingReceipt } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";

/**
 * @title FusionPlusOApp
 * @notice LayerZero V2 OApp for cross-chain secret reveals in Fusion+ protocol
 * @dev This contract enables resolvers to reveal secrets across chains using LayerZero
 */
contract FusionPlusOApp is OApp {
    // Events
    event SecretRevealSent(uint32 dstEid, bytes32 escrowId, bytes32 secret);
    event SecretRevealReceived(uint32 srcEid, bytes32 escrowId, bytes32 secret);
    
    // Struct for secret reveal messages
    struct SecretReveal {
        bytes32 escrowId;
        bytes32 secret;
        address revealer;
    }
    
    // Track revealed secrets
    mapping(bytes32 => bytes32) public revealedSecrets; // escrowId => secret
    mapping(bytes32 => address) public revealers; // escrowId => revealer address
    
    constructor(
        address _endpoint,
        address _owner
    ) OApp(_endpoint, _owner) {}
    
    /**
     * @notice Send a secret reveal to another chain
     * @param _dstEid Destination endpoint ID
     * @param _escrowId The escrow ID to reveal secret for
     * @param _secret The secret to reveal
     * @param _options LayerZero message options
     */
    function sendSecretReveal(
        uint32 _dstEid,
        bytes32 _escrowId,
        bytes32 _secret,
        bytes calldata _options
    ) external payable returns (MessagingReceipt memory receipt) {
        // Create the message
        SecretReveal memory reveal = SecretReveal({
            escrowId: _escrowId,
            secret: _secret,
            revealer: msg.sender
        });
        
        bytes memory payload = abi.encode(reveal);
        
        // Send the message
        receipt = _lzSend(
            _dstEid,
            payload,
            _options,
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );
        
        // Store locally as well
        revealedSecrets[_escrowId] = _secret;
        revealers[_escrowId] = msg.sender;
        
        emit SecretRevealSent(_dstEid, _escrowId, _secret);
    }
    
    /**
     * @notice Quote the fee for sending a secret reveal
     * @param _dstEid Destination endpoint ID
     * @param _escrowId The escrow ID
     * @param _secret The secret
     * @param _options Message options
     */
    function quoteSecretReveal(
        uint32 _dstEid,
        bytes32 _escrowId,
        bytes32 _secret,
        bytes calldata _options
    ) external view returns (MessagingFee memory fee) {
        SecretReveal memory reveal = SecretReveal({
            escrowId: _escrowId,
            secret: _secret,
            revealer: msg.sender
        });
        
        bytes memory payload = abi.encode(reveal);
        fee = _quote(_dstEid, payload, _options, false);
    }
    
    /**
     * @notice Handle incoming LayerZero messages
     * @dev Internal function called by LayerZero endpoint
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 /*_guid*/,
        bytes calldata _message,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) internal override {
        // Decode the message
        SecretReveal memory reveal = abi.decode(_message, (SecretReveal));
        
        // Store the revealed secret
        revealedSecrets[reveal.escrowId] = reveal.secret;
        revealers[reveal.escrowId] = reveal.revealer;
        
        emit SecretRevealReceived(_origin.srcEid, reveal.escrowId, reveal.secret);
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