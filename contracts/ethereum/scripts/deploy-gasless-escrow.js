const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying FusionPlusGaslessEscrow to Sepolia...");

  // Get the deployer's signer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Check balance
  const balance = await deployer.getBalance();
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");

  // Deploy the contract
  const FusionPlusGaslessEscrow = await ethers.getContractFactory("FusionPlusGaslessEscrow");
  const gaslessEscrow = await FusionPlusGaslessEscrow.deploy();

  // Wait for deployment
  await gaslessEscrow.deployed();
  
  const address = gaslessEscrow.address;
  console.log("FusionPlusGaslessEscrow deployed to:", address);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await gaslessEscrow.deployTransaction.wait(5);

  // Verify the contract on Etherscan
  console.log("Verifying contract on Etherscan...");
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: [],
    });
    console.log("Contract verified on Etherscan!");
  } catch (error) {
    console.log("Verification failed:", error.message);
    console.log("You can verify manually using:");
    console.log(`npx hardhat verify --network sepolia ${address}`);
  }

  console.log("\n🎉 Deployment complete!");
  console.log("Add this to your .env file:");
  console.log(`REACT_APP_ETHEREUM_GASLESS_ESCROW_CONTRACT=${address}`);
  console.log(`ETHEREUM_GASLESS_ESCROW_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });