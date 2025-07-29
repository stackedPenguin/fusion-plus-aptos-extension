// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FusionPlusEscrow {
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

    mapping(bytes32 => Escrow) public escrows;
    
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

    function createEscrow(
        bytes32 _escrowId,
        address _beneficiary,
        address _token,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock
    ) external payable {
        require(escrows[_escrowId].depositor == address(0), "Escrow already exists");
        require(_amount > 0, "Amount must be greater than 0");
        require(_timelock > block.timestamp, "Timelock must be in the future");
        require(msg.value > 0, "Safety deposit required");

        if (_token == address(0)) {
            // ETH transfer
            require(msg.value >= _amount, "Insufficient ETH sent");
            escrows[_escrowId] = Escrow({
                depositor: msg.sender,
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
            // ERC20 transfer
            IERC20(_token).transferFrom(msg.sender, address(this), _amount);
            escrows[_escrowId] = Escrow({
                depositor: msg.sender,
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
            msg.sender,
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
            IERC20(escrow.token).transfer(escrow.beneficiary, escrow.amount);
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
            // Transfer ETH
            payable(escrow.depositor).transfer(escrow.amount);
        } else {
            // Transfer ERC20
            IERC20(escrow.token).transfer(escrow.depositor, escrow.amount);
        }
        
        // Transfer safety deposit to the refunder
        payable(msg.sender).transfer(escrow.safetyDeposit);

        emit EscrowRefunded(_escrowId);
    }

    function getEscrow(bytes32 _escrowId) external view returns (Escrow memory) {
        return escrows[_escrowId];
    }
}