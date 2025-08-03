const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying FusionPlusGaslessEscrowV2 to Sepolia...");

  // Get the deployer's signer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Check balance
  const balance = await deployer.getBalance();
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");

  // Deploy the contract
  const FusionPlusGaslessEscrowV2 = await ethers.getContractFactory("FusionPlusGaslessEscrowV2");
  const gaslessEscrowV2 = await FusionPlusGaslessEscrowV2.deploy();

  // Wait for deployment
  await gaslessEscrowV2.deployed();
  
  const address = gaslessEscrowV2.address;
  console.log("FusionPlusGaslessEscrowV2 deployed to:", address);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await gaslessEscrowV2.deployTransaction.wait(5);

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
  console.log("Add this to your .env files:");
  console.log(`REACT_APP_ETHEREUM_GASLESS_ESCROW_CONTRACT=${address}`);
  console.log(`ETHEREUM_GASLESS_ESCROW_ADDRESS=${address}`);
  
  // Save deployment info to a file
  const fs = require('fs');
  const deploymentInfo = {
    contract: "FusionPlusGaslessEscrowV2",
    address: address,
    network: "sepolia",
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: gaslessEscrowV2.deployTransaction.blockNumber
  };
  
  fs.writeFileSync(
    './deployments/gasless-escrow-v2-sepolia.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment info saved to deployments/gasless-escrow-v2-sepolia.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });