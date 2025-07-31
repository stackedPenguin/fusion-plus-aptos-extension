export interface PriceCache {
  rate: number;
  timestamp: number;
}

export class PriceService {
  private cache: Map<string, PriceCache> = new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private readonly COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
  private readonly API_KEY = process.env.REACT_APP_COIN_GECKO_API_KEY;
  
  // Fallback rates
  private readonly FALLBACK_RATES: Record<string, number> = {
    'ETH/APT': 500,
    'APT/ETH': 0.002
  };

  async getExchangeRate(fromToken: string, toToken: string): Promise<number> {
    const pair = `${fromToken.toUpperCase()}/${toToken.toUpperCase()}`;
    
    // Handle USDC special case (always $1)
    if (fromToken.toUpperCase() === 'USDC') {
      if (toToken.toUpperCase() === 'APT') {
        const aptPrice = await this.getUSDPrice('APT');
        return 1 / aptPrice; // $1 USD to APT
      } else if (toToken.toUpperCase() === 'ETH') {
        const ethPrice = await this.getUSDPrice('ETH');
        return 1 / ethPrice; // $1 USD to ETH
      }
    }
    
    // Check cache
    const cached = this.cache.get(pair);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.rate;
    }

    try {
      // For cross-chain rates, use CoinGecko
      if ((fromToken === 'ETH' && toToken === 'APT') || (fromToken === 'APT' && toToken === 'ETH')) {
        const rate = await this.fetchCrossChainRate(fromToken, toToken);
        this.cache.set(pair, { rate, timestamp: Date.now() });
        return rate;
      }
      
      // For same-chain rates, would use 1inch API (not implemented for demo)
      return this.FALLBACK_RATES[pair] || 1;
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
      return this.FALLBACK_RATES[pair] || 1;
    }
  }

  private async fetchCrossChainRate(fromToken: string, toToken: string): Promise<number> {
    const tokenIds: Record<string, string> = {
      'ETH': 'ethereum',
      'APT': 'aptos'
    };

    const fromId = tokenIds[fromToken.toUpperCase()];
    const toId = tokenIds[toToken.toUpperCase()];

    const url = new URL(this.COINGECKO_API);
    url.searchParams.set('ids', `${fromId},${toId}`);
    url.searchParams.set('vs_currencies', 'usd');
    if (this.API_KEY) {
      url.searchParams.set('x_cg_demo_api_key', this.API_KEY);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error('Failed to fetch prices from CoinGecko');
    }

    const data = await response.json();
    const fromPrice = data[fromId]?.usd;
    const toPrice = data[toId]?.usd;

    if (!fromPrice || !toPrice) {
      throw new Error('Invalid price data');
    }

    return fromPrice / toPrice;
  }

  async getUSDPrice(token: string): Promise<number> {
    // USDC is always $1
    if (token.toUpperCase() === 'USDC') {
      return 1;
    }

    const tokenIds: Record<string, string> = {
      'ETH': 'ethereum',
      'APT': 'aptos'
    };

    const tokenId = tokenIds[token.toUpperCase()];
    if (!tokenId) return 0;

    const cacheKey = `${token.toUpperCase()}/USD`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.rate;
    }

    try {
      const url = new URL(this.COINGECKO_API);
      url.searchParams.set('ids', tokenId);
      url.searchParams.set('vs_currencies', 'usd');
      if (this.API_KEY) {
        url.searchParams.set('x_cg_demo_api_key', this.API_KEY);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error('Failed to fetch USD price');
      }

      const data = await response.json();
      const price = data[tokenId]?.usd || 0;
      
      this.cache.set(cacheKey, { rate: price, timestamp: Date.now() });
      return price;
    } catch (error) {
      console.error('Failed to fetch USD price:', error);
      return 0;
    }
  }

  applyResolverMargin(rate: number, marginPercent: number = 1): number {
    return rate * (1 - marginPercent / 100);
  }
}