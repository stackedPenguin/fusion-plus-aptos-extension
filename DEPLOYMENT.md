# Deployment Guide

## Generated Wallets

### User Test Wallets

#### Ethereum (Sepolia)
- **Address**: `0x8F90dE323b5E77EB1dDa97410110d2B27892AECF`
- **Private Key**: `0x18a8c8a12601a5b7818acae7f2ac748d71f7f2309f85f0724c5455d23426b808`

#### Aptos (Testnet)
- **Address**: `0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35`
- **Private Key**: `ed25519-priv-0xd929ea04a2d4902429444bcc83d8ff8741f2da5f677b3d8907791eceac95e35c`

### Resolver Wallets

#### Resolver Ethereum (Sepolia)
- **Address**: `0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc`
- **Private Key**: `0xc8328296c9bae25ba49a936c8398778513cbc4f3472847f055e02a1ea6d7dd74`

#### Resolver Aptos (Testnet)
- **Address**: `0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532`
- **Private Key**: `ed25519-priv-0x17f2f2c3b35f4a1d3688c2bdc445239fb25d2e495915a15b586d7319bf751f7e`

## Funding Instructions

### 1. Fund User Wallets

#### Ethereum (Sepolia)
1. Go to [Sepolia Faucet](https://sepoliafaucet.com/)
2. Enter address: `0x8F90dE323b5E77EB1dDa97410110d2B27892AECF`
3. Request 0.5 ETH (for testing swaps)

#### Aptos (Testnet)
1. Go to [Aptos Faucet](https://aptos.dev/en/network/faucet)
2. Enter address: `0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35`
3. Request test APT

### 2. Fund Resolver Wallets

#### Resolver Ethereum
1. Enter address: `0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc`
2. Request 0.5 ETH (for gas fees)

#### Resolver Aptos
1. Enter address: `0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532`
2. Request test APT (needs more - for both gas and liquidity)

Alternative faucets:
- [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)
- [Chainlink Faucet](https://faucets.chain.link/sepolia)

### 2. Fund Aptos Wallet
1. Go to [Aptos Faucet](https://aptos.dev/en/network/faucet)
2. Select "Testnet" network
3. Enter address: `0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35`
4. Click "Fund Account"

## Deployment Commands

### Deploy Ethereum Contract (after funding)
```bash
cd contracts/ethereum
npx hardhat run scripts/deploy.js --network sepolia
```

### Deploy Aptos Contract (after funding)
```bash
cd contracts/aptos

# First, initialize Aptos account
aptos init --profile testnet \
  --private-key ed25519-priv-0xd929ea04a2d4902429444bcc83d8ff8741f2da5f677b3d8907791eceac95e35c \
  --network testnet

# Then deploy
aptos move publish \
  --named-addresses fusion_plus=0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35 \
  --profile testnet \
  --assume-yes
```

## Contract Addresses (DEPLOYED!)

### Ethereum (Sepolia)
- **FusionPlusEscrow**: `0x5D03520c42fca21159c66cA44E24f7B0c0C590d4`
- **Explorer**: https://sepolia.etherscan.io/address/0x5D03520c42fca21159c66cA44E24f7B0c0C590d4

### Aptos (Testnet)
- **fusion_plus::escrow**: `0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35`
- **Transaction**: https://explorer.aptoslabs.com/txn/0x340af5c0c8977e115022aa931ddd480d1273986f3eca1f05f39861919a124a67?network=testnet