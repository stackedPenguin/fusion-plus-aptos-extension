export const CONTRACTS = {
  ETHEREUM: {
    ESCROW: process.env.REACT_APP_ETHEREUM_ESCROW_CONTRACT || '0x5Ea57C2Fb5f054E9bdBdb3449135f823439E1338',
    PERMIT: process.env.REACT_APP_ETHEREUM_PERMIT_CONTRACT || '0x1eB5f27B160Aa22D024164c80F00bD5F73dDBb1E',
    WETH: process.env.REACT_APP_WETH_CONTRACT || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia WETH
    GASLESS_ESCROW: process.env.REACT_APP_ETHEREUM_GASLESS_ESCROW_CONTRACT || '0x704EBa209E391FEBa4F1FCfdFdb852760D068d18' // V2 Fixed with correct nonce handling
  },
  APTOS: {
    ESCROW: process.env.REACT_APP_APTOS_ESCROW_MODULE || '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8'
  },
  RESOLVER: {
    ETHEREUM: process.env.REACT_APP_ETHEREUM_RESOLVER_ADDRESS || '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
    APTOS: process.env.REACT_APP_APTOS_RESOLVER_ADDRESS || '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532'
  }
};

// Token metadata
export const TOKEN_INFO = {
  'ETH': { decimals: 18, symbol: 'ETH', name: 'Ethereum' },
  'WETH': { decimals: 18, symbol: 'WETH', name: 'Wrapped Ethereum' },
  'APT': { decimals: 8, symbol: 'APT', name: 'Aptos' }
};