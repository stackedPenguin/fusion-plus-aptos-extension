import axios from 'axios';

export interface PriceCache {
  rate: number;
  timestamp: number;
}

export class PriceService {
  private cache: Map<string, PriceCache> = new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private readonly COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
  private readonly API_KEY = process.env.COINGECKO_API_KEY;
  
  // Fallback rates for testing
  private readonly FALLBACK_RATES: Record<string, number> = {
    'ETH/APT': 500,    // 1 ETH = 500 APT
    'APT/ETH': 0.002   // 1 APT = 0.002 ETH
  };

  async getExchangeRate(fromToken: string, toToken: string): Promise<number> {
    const pair = `${fromToken.toUpperCase()}/${toToken.toUpperCase()}`;
    
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

    try {
      const params: any = {
        ids: `${fromId},${toId}`,
        vs_currencies: 'usd'
      };
      
      if (this.API_KEY) {
        params.x_cg_demo_api_key = this.API_KEY;
      }

      const response = await axios.get(this.COINGECKO_API, { params });

      const data = response.data;
      const fromPrice = data[fromId]?.usd;
      const toPrice = data[toId]?.usd;

      if (!fromPrice || !toPrice) {
        throw new Error('Invalid price data');
      }

      const rate = fromPrice / toPrice;
      console.log(`📊 Exchange rate ${fromToken}/${toToken}: ${rate.toFixed(4)}`);
      console.log(`   ${fromToken} USD price: $${fromPrice}`);
      console.log(`   ${toToken} USD price: $${toPrice}`);
      
      return rate;
    } catch (error: any) {
      console.error('CoinGecko API error, using fallback rate:', error.message);
      const fallbackKey = `${fromToken}/${toToken}`;
      return this.FALLBACK_RATES[fallbackKey] || 1;
    }
  }

  async getUSDPrice(token: string): Promise<number> {
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
      const params: any = {
        ids: tokenId,
        vs_currencies: 'usd'
      };
      
      if (this.API_KEY) {
        params.x_cg_demo_api_key = this.API_KEY;
      }

      const response = await axios.get(this.COINGECKO_API, { params });

      const price = response.data[tokenId]?.usd || 0;
      
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

  // Calculate output amount based on input and exchange rate
  calculateOutputAmount(inputAmount: string, rate: number, applyMargin: boolean = true): string {
    const input = parseFloat(inputAmount);
    const effectiveRate = applyMargin ? this.applyResolverMargin(rate) : rate;
    const output = input * effectiveRate;
    return output.toString();
  }
}