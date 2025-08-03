import React, { useState, useEffect } from 'react';
import './DutchAuctionProgress.css';

interface DutchAuctionConfig {
  enabled: boolean;
  startTimestamp: number;
  duration: number;
  startRate: number;
  endRate: number;
  decrementInterval: number;
  decrementAmount: number;
}

interface DutchAuctionProgressProps {
  auction?: DutchAuctionConfig;
  isActive: boolean;
  partialFills?: any[];
}

const DutchAuctionProgress: React.FC<DutchAuctionProgressProps> = ({ 
  auction, 
  isActive,
  partialFills = []
}) => {
  const [currentTime, setCurrentTime] = useState(Date.now() / 1000);
  const [auctionStatus, setAuctionStatus] = useState({
    percentComplete: 0,
    currentRate: 0,
    nextRateDropIn: 0,
    isActive: false
  });

  useEffect(() => {
    if (!auction || !isActive) return;

    const updateAuctionStatus = () => {
      const now = Date.now() / 1000;
      setCurrentTime(now);

      const elapsed = now - auction.startTimestamp;
      const percentComplete = Math.min((elapsed / auction.duration) * 100, 100);
      
      // Calculate current rate
      const rateDrops = Math.floor(elapsed / auction.decrementInterval);
      const currentRate = Math.max(
        auction.startRate - (rateDrops * auction.decrementAmount),
        auction.endRate
      );
      
      // Calculate time until next rate drop
      const nextDropTime = auction.startTimestamp + ((rateDrops + 1) * auction.decrementInterval);
      const nextRateDropIn = Math.max(0, nextDropTime - now);
      
      setAuctionStatus({
        percentComplete,
        currentRate,
        nextRateDropIn: Math.ceil(nextRateDropIn),
        isActive: elapsed < auction.duration
      });
    };

    updateAuctionStatus();
    const interval = setInterval(updateAuctionStatus, 1000);
    return () => clearInterval(interval);
  }, [auction, isActive]);

  if (!auction || !isActive || !auctionStatus.isActive) {
    return null;
  }

  const formatRate = (rate: number) => {
    // For very small numbers, use more decimal places
    if (rate < 0.001) {
      return rate.toFixed(6);
    } else if (rate < 0.01) {
      return rate.toFixed(4);
    } else {
      return rate.toFixed(2);
    }
  };
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Determine which resolvers should be active based on progress
  const resolverStatuses = [
    {
      name: 'Resolver-1',
      strategy: 'Aggressive',
      fillRange: '0-33%',
      activeCondition: '< 40% auction',
      isActive: auctionStatus.percentComplete < 40,
      hasFilled: partialFills.some(f => f.resolver?.toLowerCase() === '0x4718eafbbdc0ddaafeB520ff641c6aecba8042fc'.toLowerCase())
    },
    {
      name: 'Resolver-2',
      strategy: 'Patient',
      fillRange: '33-66%',
      activeCondition: '> 60% auction',
      isActive: auctionStatus.percentComplete > 60,
      hasFilled: partialFills.some(f => f.resolver?.toLowerCase() === '0x3059921a0e8362110e8141f7c1d25eec3762294b'.toLowerCase())
    },
    {
      name: 'Resolver-3',
      strategy: 'Opportunistic',
      fillRange: '66-100%',
      activeCondition: '30-80% auction',
      isActive: auctionStatus.percentComplete > 30 && auctionStatus.percentComplete < 80,
      hasFilled: partialFills.some(f => f.resolver?.toLowerCase() === '0xf288aac4d29092fd7ec652357d46900a4f05425b'.toLowerCase())
    }
  ];

  return (
    <div className="dutch-auction-progress">
      <div className="auction-header">
        <h3>🇳🇱 Dutch Auction Progress</h3>
        <div className="auction-timer">
          {formatTime(Math.floor(auction.duration - (currentTime - auction.startTimestamp)))} remaining
        </div>
      </div>

      <div className="auction-metrics">
        <div className="metric">
          <span className="metric-label">Current Rate</span>
          <span className="metric-value rate-value">
            1 WETH = {formatRate(auctionStatus.currentRate)} APT
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Next Drop In</span>
          <span className="metric-value">{formatTime(auctionStatus.nextRateDropIn)}</span>
        </div>
      </div>

      <div className="auction-progress-bar">
        <div 
          className="progress-fill auction-fill"
          style={{ width: `${auctionStatus.percentComplete}%` }}
        />
        <div className="progress-label">
          {auctionStatus.percentComplete.toFixed(1)}%
        </div>
      </div>

      <div className="resolver-criteria">
        <h4>Resolver Competition Status</h4>
        <div className="resolver-list">
          {resolverStatuses.map((resolver, index) => (
            <div 
              key={index} 
              className={`resolver-status-item ${resolver.isActive ? 'active' : ''} ${resolver.hasFilled ? 'filled' : ''}`}
            >
              <div className="resolver-info">
                <div className="resolver-header">
                  <span className="resolver-name">{resolver.name}</span>
                  <span className={`status-badge ${resolver.hasFilled ? 'filled' : resolver.isActive ? 'ready' : 'waiting'}`}>
                    {resolver.hasFilled ? '✅ Filled' : resolver.isActive ? '🎯 Ready' : '⏳ Waiting'}
                  </span>
                </div>
                <div className="resolver-details">
                  <span className="strategy">{resolver.strategy}</span>
                  <span className="fill-range">Fills: {resolver.fillRange}</span>
                  <span className="condition">Active: {resolver.activeCondition}</span>
                </div>
              </div>
              <div className="resolver-progress">
                <div 
                  className="resolver-progress-bar"
                  style={{ 
                    opacity: resolver.isActive ? 1 : 0.3,
                    background: resolver.hasFilled ? '#4caf50' : '#1dc872'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="auction-explanation">
        <p>📊 Rate decreases by {formatRate(auction.decrementAmount)} APT every {auction.decrementInterval}s</p>
        <p>🎯 Final rate: 1 WETH = {formatRate(auction.endRate)} APT</p>
      </div>
    </div>
  );
};

export default DutchAuctionProgress;