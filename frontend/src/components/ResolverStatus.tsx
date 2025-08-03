import React, { useState, useEffect } from 'react';
import './ResolverStatus.css';

interface Resolver {
  id: string;
  name: string;
  address: string;
  port: number;
  strategy: 'aggressive' | 'patient' | 'opportunistic';
  status: 'active' | 'inactive' | 'offline';
  fills: number;
  lastActivity?: number;
  enabled: boolean;
}

interface ResolverStatusProps {
  onResolverToggle?: (resolverId: string, enabled: boolean) => void;
  onDutchAuctionToggle?: (enabled: boolean) => void;
  dutchAuctionEnabled?: boolean;
}

const ResolverStatus: React.FC<ResolverStatusProps> = ({ onResolverToggle, onDutchAuctionToggle, dutchAuctionEnabled = false }) => {
  const [resolvers, setResolvers] = useState<Resolver[]>([
    {
      id: 'resolver-1',
      name: 'Resolver-1',
      address: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
      port: 4001,
      strategy: 'aggressive',
      status: 'inactive',
      fills: 0,
      enabled: false
    },
    {
      id: 'resolver-2',
      name: 'Resolver-2',
      address: '0x3059921A0E8362110e8141f7c1d25eeC3762294b',
      port: 4002,
      strategy: 'patient',
      status: 'inactive',
      fills: 0,
      enabled: false
    },
    {
      id: 'resolver-3',
      name: 'Resolver-3',
      address: '0xF288aaC4D29092Fd7eC652357D46900a4F05425B',
      port: 4003,
      strategy: 'opportunistic',
      status: 'inactive',
      fills: 0,
      enabled: false
    }
  ]);

  const [showDetails, setShowDetails] = useState(false);

  // Check resolver health
  useEffect(() => {
    const checkResolverHealth = async () => {
      const updatedResolvers = await Promise.all(
        resolvers.map(async (resolver) => {
          if (!resolver.enabled) {
            return { ...resolver, status: 'inactive' as const };
          }

          try {
            const response = await fetch(`http://localhost:${resolver.port}/health`);
            if (response.ok) {
              return { ...resolver, status: 'active' as const };
            }
          } catch (error) {
            // Resolver is not reachable
          }
          return { ...resolver, status: 'offline' as const };
        })
      );

      setResolvers(updatedResolvers);
    };

    const interval = setInterval(checkResolverHealth, 5000);
    checkResolverHealth();

    return () => clearInterval(interval);
  }, [resolvers.map(r => r.enabled).join(',')]); // Re-run when enabled state changes

  const toggleResolver = (resolverId: string) => {
    setResolvers(prev => prev.map(resolver => {
      if (resolver.id === resolverId) {
        const newEnabled = !resolver.enabled;
        if (onResolverToggle) {
          onResolverToggle(resolverId, newEnabled);
        }
        return { ...resolver, enabled: newEnabled };
      }
      return resolver;
    }));
  };

  const getStrategyIcon = (strategy: string) => {
    switch (strategy) {
      case 'aggressive':
        return '🚀';
      case 'patient':
        return '⏳';
      case 'opportunistic':
        return '🎯';
      default:
        return '📊';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'inactive':
        return '#666';
      case 'offline':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const activeResolvers = resolvers.filter(r => r.status === 'active').length;

  return (
    <div className="resolver-status">
      <div className="resolver-header">
        <div className="resolver-title" onClick={() => setShowDetails(!showDetails)}>
          <span className="resolver-icon">🤖</span>
          <span>Resolvers</span>
          <span className="resolver-count">{activeResolvers}/{resolvers.length}</span>
          <span className={`expand-icon ${showDetails ? 'expanded' : ''}`}>▼</span>
        </div>
        
        <div className="dutch-auction-toggle">
          <label>
            <input
              type="checkbox"
              checked={dutchAuctionEnabled}
              onChange={(e) => onDutchAuctionToggle && onDutchAuctionToggle(e.target.checked)}
            />
            <span>🇳🇱 Dutch Auction</span>
          </label>
        </div>
      </div>

      {showDetails && (
        <div className="resolver-details">
          <div className="resolver-list">
            {resolvers.map(resolver => (
              <div key={resolver.id} className={`resolver-item ${resolver.enabled ? 'enabled' : ''}`}>
                <div className="resolver-info">
                  <div className="resolver-name">
                    <span className="strategy-icon">{getStrategyIcon(resolver.strategy)}</span>
                    <span>{resolver.name}</span>
                  </div>
                  <div className="resolver-address">
                    {resolver.address.slice(0, 6)}...{resolver.address.slice(-4)}
                  </div>
                  <div className="resolver-stats">
                    <span className="resolver-strategy">{resolver.strategy}</span>
                    <span className="resolver-fills">Fills: {resolver.fills}</span>
                  </div>
                </div>
                
                <div className="resolver-controls">
                  <div 
                    className="status-indicator" 
                    style={{ backgroundColor: getStatusColor(resolver.status) }}
                    title={resolver.status}
                  />
                  <label className="resolver-toggle">
                    <input
                      type="checkbox"
                      checked={resolver.enabled}
                      onChange={() => toggleResolver(resolver.id)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {dutchAuctionEnabled && (
            <div className="dutch-auction-info">
              <h4>🇳🇱 Dutch Auction Active</h4>
              <p>Resolvers compete for better rates based on timing:</p>
              <ul>
                <li><strong>Aggressive:</strong> Fills early for guaranteed execution</li>
                <li><strong>Patient:</strong> Waits for better rates</li>
                <li><strong>Opportunistic:</strong> Fills throughout the auction</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResolverStatus;