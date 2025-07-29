const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("FusionPlusEscrow", function () {
  let escrow;
  let token;
  let owner;
  let beneficiary;
  let resolver;
  
  const secret = ethers.encodeBytes32String("mysecret");
  const hashlock = ethers.keccak256(secret);
  const amount = ethers.parseEther("100");
  const safetyDeposit = ethers.parseEther("0.1");
  
  beforeEach(async function () {
    [owner, beneficiary, resolver] = await ethers.getSigners();
    
    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy("Test Token", "TEST");
    await token.mint(owner.address, ethers.parseEther("1000"));
    
    // Deploy escrow contract
    const FusionPlusEscrow = await ethers.getContractFactory("FusionPlusEscrow");
    escrow = await FusionPlusEscrow.deploy();
    
    // Approve escrow to spend tokens
    await token.approve(escrow.target, amount);
  });

  describe("createEscrow", function () {
    it("should create escrow with correct parameters", async function () {
      const escrowId = ethers.randomBytes(32);
      const timelock = await time.latest() + 3600; // 1 hour from now
      
      await expect(escrow.createEscrow(
        escrowId,
        beneficiary.address,
        token.target,
        amount,
        hashlock,
        timelock,
        { value: safetyDeposit }
      )).to.emit(escrow, "EscrowCreated")
        .withArgs(
          escrowId,
          owner.address,
          beneficiary.address,
          token.target,
          amount,
          hashlock,
          timelock
        );
      
      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.depositor).to.equal(owner.address);
      expect(escrowData.beneficiary).to.equal(beneficiary.address);
      expect(escrowData.amount).to.equal(amount);
      expect(escrowData.hashlock).to.equal(hashlock);
    });

    it("should fail if escrow already exists", async function () {
      const escrowId = ethers.randomBytes(32);
      const timelock = await time.latest() + 3600;
      
      await escrow.createEscrow(
        escrowId,
        beneficiary.address,
        token.target,
        amount,
        hashlock,
        timelock,
        { value: safetyDeposit }
      );
      
      await expect(escrow.createEscrow(
        escrowId,
        beneficiary.address,
        token.target,
        amount,
        hashlock,
        timelock,
        { value: safetyDeposit }
      )).to.be.revertedWith("Escrow already exists");
    });

    it("should fail without safety deposit", async function () {
      const escrowId = ethers.randomBytes(32);
      const timelock = await time.latest() + 3600;
      
      await expect(escrow.createEscrow(
        escrowId,
        beneficiary.address,
        token.target,
        amount,
        hashlock,
        timelock
      )).to.be.revertedWith("Safety deposit required");
    });
  });

  describe("withdraw", function () {
    let escrowId;
    let timelock;
    
    beforeEach(async function () {
      escrowId = ethers.randomBytes(32);
      timelock = await time.latest() + 3600;
      
      await escrow.createEscrow(
        escrowId,
        beneficiary.address,
        token.target,
        amount,
        hashlock,
        timelock,
        { value: safetyDeposit }
      );
    });

    it("should withdraw with correct secret", async function () {
      const beneficiaryBalanceBefore = await token.balanceOf(beneficiary.address);
      const resolverBalanceBefore = await ethers.provider.getBalance(resolver.address);
      
      await expect(escrow.connect(resolver).withdraw(escrowId, secret))
        .to.emit(escrow, "EscrowWithdrawn")
        .withArgs(escrowId, secret);
      
      const beneficiaryBalanceAfter = await token.balanceOf(beneficiary.address);
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(amount);
      
      const resolverBalanceAfter = await ethers.provider.getBalance(resolver.address);
      expect(resolverBalanceAfter - resolverBalanceBefore).to.be.closeTo(
        safetyDeposit,
        ethers.parseEther("0.01") // gas tolerance
      );
    });

    it("should fail with incorrect secret", async function () {
      const wrongSecret = ethers.encodeBytes32String("wrongsecret");
      
      await expect(escrow.withdraw(escrowId, wrongSecret))
        .to.be.revertedWith("Invalid secret");
    });

    it("should fail if already withdrawn", async function () {
      await escrow.connect(resolver).withdraw(escrowId, secret);
      
      await expect(escrow.withdraw(escrowId, secret))
        .to.be.revertedWith("Already withdrawn");
    });
  });

  describe("refund", function () {
    let escrowId;
    let timelock;
    
    beforeEach(async function () {
      escrowId = ethers.randomBytes(32);
      timelock = await time.latest() + 3600;
      
      await escrow.createEscrow(
        escrowId,
        beneficiary.address,
        token.target,
        amount,
        hashlock,
        timelock,
        { value: safetyDeposit }
      );
    });

    it("should refund after timelock expires", async function () {
      await time.increaseTo(timelock);
      
      const depositorBalanceBefore = await token.balanceOf(owner.address);
      
      await expect(escrow.connect(resolver).refund(escrowId))
        .to.emit(escrow, "EscrowRefunded")
        .withArgs(escrowId);
      
      const depositorBalanceAfter = await token.balanceOf(owner.address);
      expect(depositorBalanceAfter - depositorBalanceBefore).to.equal(amount);
    });

    it("should fail before timelock expires", async function () {
      await expect(escrow.refund(escrowId))
        .to.be.revertedWith("Timelock not expired");
    });

    it("should fail if already withdrawn", async function () {
      await escrow.connect(resolver).withdraw(escrowId, secret);
      
      await time.increaseTo(timelock);
      
      await expect(escrow.refund(escrowId))
        .to.be.revertedWith("Already withdrawn");
    });
  });
});