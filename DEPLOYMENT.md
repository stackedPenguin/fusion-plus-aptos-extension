# Deployment Guide

## Generated Test Wallets

### Ethereum (Sepolia)
- **Address**: `0x8F90dE323b5E77EB1dDa97410110d2B27892AECF`
- **Private Key**: `0x18a8c8a12601a5b7818acae7f2ac748d71f7f2309f85f0724c5455d23426b808`

### Aptos (Testnet)
- **Address**: `0xf4339b4657c83bf97bb4ab6c732dde111426c3ab4af5c19e5d933eefa4248f35`
- **Private Key**: `ed25519-priv-0xd929ea04a2d4902429444bcc83d8ff8741f2da5f677b3d8907791eceac95e35c`

## Funding Instructions

### 1. Fund Ethereum Wallet
1. Go to [Sepolia Faucet](https://sepoliafaucet.com/)
2. Enter address: `0x8F90dE323b5E77EB1dDa97410110d2B27892AECF`
3. Request 0.5 ETH

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

## Contract Addresses (will be updated after deployment)

### Ethereum (Sepolia)
- **FusionPlusEscrow**: `<pending deployment>`

### Aptos (Testnet)
- **fusion_plus::escrow**: `<pending deployment>`