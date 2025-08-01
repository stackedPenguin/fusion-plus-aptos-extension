export const CONTRACTS = {
  ETHEREUM: {
    ESCROW: process.env.REACT_APP_ETHEREUM_ESCROW_CONTRACT || '0x5Ea57C2Fb5f054E9bdBdb3449135f823439E1338',
    PERMIT: process.env.REACT_APP_ETHEREUM_PERMIT_CONTRACT || '0x1eB5f27B160Aa22D024164c80F00bD5F73dDBb1E',
    WETH: process.env.REACT_APP_WETH_CONTRACT || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' // Sepolia WETH
  },
  APTOS: {
    ESCROW: process.env.REACT_APP_APTOS_ESCROW_MODULE || '0x9835a69eb93fd4d86c975429a511ed3b2900becbcbb4258f7da57cc253ab9fca'
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