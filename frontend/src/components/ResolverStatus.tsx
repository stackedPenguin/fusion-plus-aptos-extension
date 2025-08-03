import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getAptBalance } from '../utils/aptosClient';
import './ResolverStatus.css';

interface ResolverBalance {
  eth: string;
  weth: string;
  apt: string;
}

interface Resolver {
  id: string;
  name: string;
  address: string;
  aptosAddress?: string;
  port: number;
  strategy: 'aggressive' | 'patient' | 'opportunistic';
  status: 'active' | 'inactive' | 'offline';
  fills: number;
  lastActivity?: number;
  enabled: boolean;
  balances?: ResolverBalance;
}

interface ResolverStatusProps {
  onResolverToggle?: (resolverId: string, enabled: boolean) => void;
  onDutchAuctionToggle?: (enabled: boolean) => void;
  onPartialFillToggle?: (enabled: boolean) => void;
  dutchAuctionEnabled?: boolean;
  partialFillEnabled?: boolean;
  isSwapping?: boolean;
}

const ResolverStatus: React.FC<ResolverStatusProps> = ({ 
  onResolverToggle, 
  onDutchAuctionToggle, 
  onPartialFillToggle,
  dutchAuctionEnabled = false, 
  partialFillEnabled = false,
  isSwapping = false 
}) => {
  const [resolvers, setResolvers] = useState<Resolver[]>([
    {
      id: 'resolver-1',
      name: 'Resolver-1',
      address: '0x4718eAfbbDC0DdaAfeB520fF641c6aeCbA8042Fc',
      aptosAddress: '0x2d61a25dfac21604c5eabda303c9cc9f367d6c17b9c18df424d57fee4b4a9532',
      port: 8081,
      strategy: 'aggressive',
      status: 'inactive',
      fills: 0,
      enabled: false
    },
    {
      id: 'resolver-2',
      name: 'Resolver-2',
      address: '0x3059921A0E8362110e8141f7c1d25eeC3762294b',
      aptosAddress: '0x2edf35335bc13bb9ab9a8a7eb3145dae745db2951ede41ac2206f48f1cd83015',
      port: 8082,
      strategy: 'patient',
      status: 'inactive',
      fills: 0,
      enabled: false
    },
    {
      id: 'resolver-3',
      name: 'Resolver-3',
      address: '0xF288aaC4D29092Fd7eC652357D46900a4F05425B',
      aptosAddress: '0x3f2f1a3d325df4561b8216251aec6dc6c1a6bb3ee8d0ed9004a51c73a857d9a8',
      port: 8083,
      strategy: 'opportunistic',
      status: 'inactive',
      fills: 0,
      enabled: false
    }
  ]);

  // Always show details in sidebar - no accordion behavior

  // Fetch resolver balances
  const fetchResolverBalances = async (resolver: Resolver): Promise<ResolverBalance> => {
    const balances: ResolverBalance = { eth: '0', weth: '0', apt: '0' };
    
    try {
      // Fetch Ethereum balances
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      // ETH balance
      const ethBalance = await provider.getBalance(resolver.address);
      balances.eth = ethers.formatEther(ethBalance);
      
      // WETH balance
      const wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
      const wethContract = new ethers.Contract(
        wethAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const wethBalance = await wethContract.balanceOf(resolver.address);
      balances.weth = ethers.formatEther(wethBalance);
      
      // APT balance (via Aptos SDK with API key)
      if (resolver.aptosAddress) {
        try {
          balances.apt = await getAptBalance(resolver.aptosAddress);
        } catch (error: any) {
          if (error.message === 'Rate limited') {
            console.warn('APT balance fetch rate limited for', resolver.name);
            balances.apt = 'Rate limited';
          } else {
            console.error('Failed to fetch APT balance:', error);
            balances.apt = 'Error';
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch balances for', resolver.name, error);
    }
    
    return balances;
  };

  // Check resolver health
  useEffect(() => {
    const checkResolverHealth = async () => {
      const updatedResolvers = await Promise.all(
        resolvers.map(async (resolver) => {
          const updatedResolver = { ...resolver };
          
          if (!resolver.enabled) {
            updatedResolver.status = 'inactive' as const;
          } else {
            try {
              const response = await fetch(`http://localhost:${resolver.port}/health`);
              if (response.ok) {
                updatedResolver.status = 'active' as const;
              } else {
                updatedResolver.status = 'offline' as const;
              }
            } catch (error) {
              updatedResolver.status = 'offline' as const;
            }
          }
          
          return updatedResolver;
        })
      );

      setResolvers(updatedResolvers);
    };

    const interval = setInterval(checkResolverHealth, 5000);
    checkResolverHealth();

    return () => clearInterval(interval);
  }, [resolvers.map(r => r.enabled).join(',')]); // Re-run when enabled state changes
  
  // Fetch balances separately with a slower interval to avoid rate limits
  useEffect(() => {
    const updateBalances = async () => {
      const activeResolvers = resolvers.filter(r => r.status === 'active');
      if (activeResolvers.length === 0) return;
      
      const balanceUpdates = await Promise.all(
        activeResolvers.map(async (resolver) => ({
          id: resolver.id,
          balances: await fetchResolverBalances(resolver)
        }))
      );
      
      setResolvers(prev => prev.map(resolver => {
        const update = balanceUpdates.find(u => u.id === resolver.id);
        return update ? { ...resolver, balances: update.balances } : resolver;
      }));
    };
    
    // Initial balance fetch
    updateBalances();
    
    // Update balances every 30 seconds instead of 5 seconds
    const interval = setInterval(updateBalances, 30000);
    
    return () => clearInterval(interval);
  }, [resolvers.filter(r => r.status === 'active').map(r => r.id).join(',')]); // Re-run when active resolvers change

  const toggleResolver = (resolverId: string) => {
    const resolver = resolvers.find(r => r.id === resolverId);
    if (resolver) {
      const newEnabled = !resolver.enabled;
      setResolvers(prev => prev.map(r => 
        r.id === resolverId ? { ...r, enabled: newEnabled } : r
      ));
      // Call the callback after state update using setTimeout to avoid the warning
      setTimeout(() => {
        if (onResolverToggle) {
          onResolverToggle(resolverId, newEnabled);
        }
      }, 0);
    }
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
        <div className="resolver-title">
          <span className="resolver-icon">🤖</span>
          <span>Resolvers</span>
          <span className="resolver-count">{activeResolvers}/{resolvers.length}</span>
        </div>
      </div>

      <div className="resolver-details">
        {/* Toggle Controls */}
        <div className="toggle-controls">
          <div className="toggle-item">
            <span className="toggle-label">🧩 Partial Fills</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={partialFillEnabled}
                onChange={(e) => onPartialFillToggle && onPartialFillToggle(e.target.checked)}
                disabled={isSwapping}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          
          <div className="toggle-item">
            <span className="toggle-label">🇳🇱 Dutch Auction</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={dutchAuctionEnabled}
                onChange={(e) => onDutchAuctionToggle && onDutchAuctionToggle(e.target.checked)}
                disabled={isSwapping || !partialFillEnabled}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {isSwapping && (
          <div className="resolver-warning">
            ⚠️ Settings locked during swaps
          </div>
        )}

        {!partialFillEnabled && (
          <div className="resolver-info-message">
            ℹ️ Enable partial fills to select resolvers
          </div>
        )}

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
                <div className="balance-info">
                  ℹ️
                  <div className="balance-tooltip">
                    <strong>{resolver.name} Balances</strong>
                    <div className="balance-row">
                      <span>ETH:</span>
                      <span>{resolver.balances?.eth || '...'}</span>
                    </div>
                    <div className="balance-row">
                      <span>WETH:</span>
                      <span>{resolver.balances?.weth || '...'}</span>
                    </div>
                    <div className="balance-row">
                      <span>APT:</span>
                      <span>{resolver.balances?.apt || '...'}</span>
                    </div>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={resolver.enabled}
                    onChange={() => toggleResolver(resolver.id)}
                    disabled={isSwapping || !partialFillEnabled}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          ))}
        </div>

        {dutchAuctionEnabled && partialFillEnabled && isSwapping && (
          <div className="dutch-auction-info">
            <h4>🇳🇱 Dutch Auction Active</h4>
            <p>Resolvers compete for better rates based on timing:</p>
            <ul>
              <li><strong>Aggressive:</strong> Fills early for guaranteed execution</li>
              <li><strong>Patient:</strong> Waits for better rates</li>
              <li><strong>Opportunistic:</strong> Adapts based on timing</li>
            </ul>
          </div>
        )}
        
        {dutchAuctionEnabled && partialFillEnabled && !isSwapping && (
          <div className="resolver-info-message">
            🇳🇱 Dutch Auction enabled - Competition will start when you initiate a swap
          </div>
        )}
      </div>
    </div>
  );
};

export default ResolverStatus;