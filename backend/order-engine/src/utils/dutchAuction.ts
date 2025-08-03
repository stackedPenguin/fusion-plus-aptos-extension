import { DutchAuction } from '../types/order';

export class DutchAuctionPricing {
  /**
   * Calculate the current exchange rate based on Dutch auction parameters
   * @param auction Dutch auction configuration
   * @param currentTimestamp Current timestamp in seconds
   * @returns Current exchange rate
   */
  static getCurrentRate(auction: DutchAuction, currentTimestamp: number): number {
    // If auction hasn't started yet, return start rate
    if (currentTimestamp < auction.startTimestamp) {
      return auction.startRate;
    }
    
    // If auction has ended, return end rate
    const auctionEndTime = auction.startTimestamp + auction.duration;
    if (currentTimestamp >= auctionEndTime) {
      return auction.endRate;
    }
    
    // Calculate elapsed time and number of intervals passed
    const elapsedTime = currentTimestamp - auction.startTimestamp;
    const intervalsPassed = Math.floor(elapsedTime / auction.decrementInterval);
    
    // Calculate current rate with linear decrease
    const totalDecrease = intervalsPassed * auction.decrementAmount;
    const currentRate = auction.startRate - totalDecrease;
    
    // Ensure we don't go below end rate
    return Math.max(currentRate, auction.endRate);
  }
  
  /**
   * Calculate the rate at a specific fill percentage considering Dutch auction
   * @param auction Dutch auction configuration
   * @param fillPercentage Percentage being filled (0-100)
   * @param currentTimestamp Current timestamp
   * @returns Adjusted rate for this fill
   */
  static getRateForFill(
    auction: DutchAuction, 
    fillPercentage: number,
    currentTimestamp: number
  ): number {
    const baseRate = this.getCurrentRate(auction, currentTimestamp);
    
    // Apply bonus for larger fills (encourage resolvers to fill more)
    // 25% fill = base rate
    // 50% fill = 0.1% better rate
    // 75% fill = 0.2% better rate
    // 100% fill = 0.3% better rate
    const fillBonus = (fillPercentage - 25) * 0.001 / 75;
    
    return baseRate * (1 + Math.max(0, fillBonus));
  }
  
  /**
   * Calculate the minimum return amount based on current auction rate
   * @param fromAmount Amount being swapped
   * @param auction Dutch auction configuration
   * @param currentTimestamp Current timestamp
   * @returns Minimum amount user should receive
   */
  static calculateMinReturn(
    fromAmount: string,
    auction: DutchAuction,
    currentTimestamp: number
  ): string {
    const currentRate = this.getCurrentRate(auction, currentTimestamp);
    const fromAmountBigInt = BigInt(fromAmount);
    
    // For rate calculation, assuming rate is expressed as toToken/fromToken
    // with 6 decimal precision (1000000 = 1.0)
    const minReturn = (fromAmountBigInt * BigInt(Math.floor(currentRate * 1000000))) / BigInt(1000000);
    
    return minReturn.toString();
  }
  
  /**
   * Check if a resolver's offer meets the current auction requirements
   * @param offeredRate Rate offered by resolver
   * @param auction Dutch auction configuration  
   * @param currentTimestamp Current timestamp
   * @returns True if offer is acceptable
   */
  static isAcceptableOffer(
    offeredRate: number,
    auction: DutchAuction,
    currentTimestamp: number
  ): boolean {
    const currentMinRate = this.getCurrentRate(auction, currentTimestamp);
    return offeredRate >= currentMinRate;
  }
  
  /**
   * Get auction status information
   * @param auction Dutch auction configuration
   * @param currentTimestamp Current timestamp
   * @returns Auction status details
   */
  static getAuctionStatus(auction: DutchAuction, currentTimestamp: number): {
    isActive: boolean;
    hasStarted: boolean;
    hasEnded: boolean;
    timeRemaining: number;
    currentRate: number;
    nextRateDropIn: number;
    percentComplete: number;
  } {
    const hasStarted = currentTimestamp >= auction.startTimestamp;
    const auctionEndTime = auction.startTimestamp + auction.duration;
    const hasEnded = currentTimestamp >= auctionEndTime;
    const isActive = hasStarted && !hasEnded;
    
    const timeRemaining = Math.max(0, auctionEndTime - currentTimestamp);
    const currentRate = this.getCurrentRate(auction, currentTimestamp);
    
    // Calculate time until next rate drop
    let nextRateDropIn = 0;
    if (isActive) {
      const elapsedTime = currentTimestamp - auction.startTimestamp;
      const timeInCurrentInterval = elapsedTime % auction.decrementInterval;
      nextRateDropIn = auction.decrementInterval - timeInCurrentInterval;
    }
    
    // Calculate percent complete
    const percentComplete = hasEnded ? 100 : 
      hasStarted ? Math.min(100, ((currentTimestamp - auction.startTimestamp) / auction.duration) * 100) : 0;
    
    return {
      isActive,
      hasStarted,
      hasEnded,
      timeRemaining,
      currentRate,
      nextRateDropIn,
      percentComplete
    };
  }
  
  /**
   * Calculate resolver competition score based on fill speed and amount
   * @param resolver Resolver address
   * @param fillTimestamp When resolver submitted fill
   * @param fillPercentage Percentage resolver is filling
   * @param auction Dutch auction configuration
   * @returns Competition score (higher is better)
   */
  static calculateCompetitionScore(
    resolver: string,
    fillTimestamp: number,
    fillPercentage: number,
    auction: DutchAuction
  ): number {
    // Early fills get higher scores
    const timeScore = Math.max(0, 100 - ((fillTimestamp - auction.startTimestamp) / auction.duration) * 100);
    
    // Larger fills get bonus points
    const sizeScore = fillPercentage;
    
    // Combined score weighted 70% time, 30% size
    return (timeScore * 0.7) + (sizeScore * 0.3);
  }
}