import React, { useState, useEffect } from 'react';
import { OrderService } from '../services/OrderService';

interface TransactionPanelProps {
  ethAccount: string | null;
  aptosAccount: string | null;
  orderService: OrderService;
}

interface Transaction {
  id: string;
  fromChain: string;
  toChain: string;
  fromAmount: string;
  toAmount: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
  escrowCreated?: boolean;
  sourceEscrowId?: string;
  destEscrowId?: string;
  secret?: string;
  deadline: number;
}

const TransactionPanel: React.FC<TransactionPanelProps> = ({
  ethAccount,
  aptosAccount,
  orderService
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for order updates
  useEffect(() => {
    if (!orderService) return;

    const socket = (orderService as any).socket;
    if (!socket) return;

    // Also listen to manual order creation from our component
    const handleManualOrderCreated = (orderId: string, orderData: any) => {
      const newTx: Transaction = {
        id: orderId,
        fromChain: orderData.fromChain === 'ETHEREUM' ? 'ETH' : 'APT',
        toChain: orderData.toChain === 'ETHEREUM' ? 'ETH' : 'APT',
        fromAmount: orderData.fromAmount,
        toAmount: orderData.minToAmount,
        status: 'pending',
        timestamp: Date.now(),
        deadline: orderData.deadline * 1000 // Convert to milliseconds
      };
      setTransactions(prev => [newTx, ...prev]);
    };

    // Store the handler on the orderService so SwapInterface can call it
    (orderService as any).notifyOrderCreated = handleManualOrderCreated;

    const handleOrderCreated = (data: any) => {
      const newTx: Transaction = {
        id: data.orderId || data.id,
        fromChain: data.fromChain === 'ETHEREUM' ? 'ETH' : 'APT',
        toChain: data.toChain === 'ETHEREUM' ? 'ETH' : 'APT',
        fromAmount: data.fromAmount,
        toAmount: data.minToAmount,
        status: 'pending',
        timestamp: Date.now(),
        deadline: data.deadline * 1000 // Convert to milliseconds
      };
      setTransactions(prev => [newTx, ...prev]);
    };

    const handleEscrowCreated = (data: any) => {
      setTransactions(prev => prev.map(tx => 
        tx.id === data.orderId
          ? { ...tx, escrowCreated: true, destEscrowId: data.escrowId }
          : tx
      ));
    };

    const handleEscrowWithdrawn = (data: any) => {
      setTransactions(prev => prev.map(tx => 
        tx.id === data.orderId
          ? { ...tx, status: 'completed', secret: data.secret }
          : tx
      ));
    };

    socket.on('order:created', handleOrderCreated);
    socket.on('escrow:destination:created', handleEscrowCreated);
    socket.on('escrow:source:withdrawn', handleEscrowWithdrawn);

    return () => {
      socket.off('order:created', handleOrderCreated);
      socket.off('escrow:destination:created', handleEscrowCreated);
      socket.off('escrow:source:withdrawn', handleEscrowWithdrawn);
    };
  }, [orderService]);

  const formatAmount = (amount: string, chain: string) => {
    if (chain === 'ETH') {
      return (parseInt(amount) / 1e18).toFixed(6);
    } else {
      return (parseInt(amount) / 1e8).toFixed(4);
    }
  };

  const formatTime = (timestamp: number) => {
    const now = currentTime;
    const diff = now - timestamp;
    
    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}h ago`;
    } else {
      return new Date(timestamp).toLocaleDateString();
    }
  };

  const formatCountdown = (deadline: number) => {
    const now = currentTime / 1000; // Convert to seconds
    const timeLeft = Math.max(0, deadline - now);
    
    if (timeLeft === 0) return 'Expired';
    
    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getCountdownClass = (deadline: number) => {
    const now = currentTime / 1000;
    const timeLeft = deadline - now;
    
    if (timeLeft < 300) return 'critical'; // Less than 5 minutes
    if (timeLeft < 600) return 'warning'; // Less than 10 minutes
    return '';
  };

  const pendingTransactions = transactions.filter(tx => tx.status === 'pending');
  const completedTransactions = transactions.filter(tx => tx.status !== 'pending');

  const renderTransaction = (tx: Transaction) => (
    <div key={tx.id} className="transaction-item">
      <div className="transaction-header">
        <div className="transaction-pair">
          <span>{tx.fromChain}</span>
          <span>→</span>
          <span>{tx.toChain}</span>
        </div>
        {tx.status === 'pending' && (
          <div className={`countdown-timer ${getCountdownClass(tx.deadline / 1000)}`}>
            ⏱ {formatCountdown(tx.deadline / 1000)}
          </div>
        )}
      </div>
      
      <div className="transaction-amounts">
        <span>{formatAmount(tx.fromAmount, tx.fromChain)} {tx.fromChain}</span>
        <span>→</span>
        <span>{formatAmount(tx.toAmount, tx.toChain)} {tx.toChain}</span>
      </div>

      {tx.status === 'pending' && (
        <div className="progress-steps">
          <div className={`step-item ${tx.escrowCreated ? 'completed' : 'active'}`}>
            <div className="step-icon">{tx.escrowCreated ? '✓' : '1'}</div>
            <div className="step-text">Resolver locks {tx.toChain}</div>
            {tx.escrowCreated && <div className="step-time">{formatTime(tx.timestamp)}</div>}
          </div>
          <div className={`step-item ${tx.sourceEscrowId ? 'active' : ''}`}>
            <div className="step-icon">2</div>
            <div className="step-text">You lock {tx.fromChain}</div>
          </div>
          <div className="step-item">
            <div className="step-icon">3</div>
            <div className="step-text">Swap completes</div>
          </div>
        </div>
      )}

      <div className="transaction-footer">
        <div className="transaction-time">{formatTime(tx.timestamp)}</div>
        <div className={`transaction-status status-${tx.status}`}>
          <span className="status-dot"></span>
          <span>{tx.status === 'pending' ? 'In Progress' : tx.status}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="transaction-panel">
      <div className="panel-header">
        <div className="panel-tabs">
          <button 
            className={`panel-tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending ({pendingTransactions.length})
          </button>
          <button 
            className={`panel-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>
      </div>

      <div className="panel-content">
        {activeTab === 'pending' && (
          <div className="transaction-list">
            {pendingTransactions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⏳</div>
                <div className="empty-text">No pending transactions</div>
              </div>
            ) : (
              pendingTransactions.map(renderTransaction)
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="transaction-list">
            {completedTransactions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-text">No transaction history</div>
              </div>
            ) : (
              completedTransactions.map(renderTransaction)
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionPanel;