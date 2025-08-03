// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FusionPlusEscrowV2 {
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

    /**
     * @dev Creates an escrow where msg.sender is the depositor
     * For ETH: msg.value must be >= amount + safety deposit
     * For ERC20: msg.sender must have approved this contract for the token amount
     */
    function createEscrow(
        bytes32 _escrowId,
        address _beneficiary,
        address _token,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock
    ) external payable {
        _createEscrowInternal(
            _escrowId,
            msg.sender, // depositor is msg.sender
            _beneficiary,
            _token,
            _amount,
            _hashlock,
            _timelock
        );
    }

    /**
     * @dev Creates an escrow on behalf of another user (Fusion+ resolver flow)
     * For ETH: msg.value must be >= amount + safety deposit
     * For ERC20: _depositor must have approved this contract for the token amount
     * Only the specified depositor's tokens will be pulled
     */
    function createEscrowFor(
        bytes32 _escrowId,
        address _depositor,
        address _beneficiary,
        address _token,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock
    ) external payable {
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

    function _createEscrowInternal(
        bytes32 _escrowId,
        address _depositor,
        address _beneficiary,
        address _token,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock
    ) internal {
        require(escrows[_escrowId].depositor == address(0), "Escrow already exists");
        require(_amount > 0, "Amount must be greater than 0");
        require(_timelock > block.timestamp, "Timelock must be in the future");
        // Safety deposit is optional for gasless experience

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
            // ERC20 transfer - pull from depositor, not msg.sender
            IERC20(_token).transferFrom(_depositor, address(this), _amount);
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
            IERC20(escrow.token).transfer(escrow.beneficiary, escrow.amount);
        }
        
        // Transfer safety deposit to the withdrawer (if any)
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

        if (escrow.token == address(0)) {
            // Refund ETH to depositor
            payable(escrow.depositor).transfer(escrow.amount);
        } else {
            // Refund ERC20 to depositor
            IERC20(escrow.token).transfer(escrow.depositor, escrow.amount);
        }
        
        // Transfer safety deposit to the refunder (if any)
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
}