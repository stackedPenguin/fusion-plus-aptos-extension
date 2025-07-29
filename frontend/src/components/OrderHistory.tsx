import React, { useState, useEffect } from 'react';
import { OrderService } from '../services/OrderService';

interface OrderHistoryProps {
  ethAccount: string | null;
  aptosAccount: string | null;
  orderService: OrderService;
}

interface Order {
  id: string;
  fromChain: string;
  toChain: string;
  fromAmount: string;
  minToAmount: string;
  status: string;
  createdAt: string;
  filledAmount: string;
}

const OrderHistory: React.FC<OrderHistoryProps> = ({
  ethAccount,
  aptosAccount,
  orderService
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (ethAccount || aptosAccount) {
      loadOrders();
    }
  }, [ethAccount, aptosAccount]);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const allOrders: Order[] = [];
      
      if (ethAccount) {
        const ethOrders = await orderService.getOrdersByMaker(ethAccount);
        allOrders.push(...ethOrders);
      }
      
      if (aptosAccount) {
        const aptosOrders = await orderService.getOrdersByMaker(aptosAccount);
        allOrders.push(...aptosOrders);
      }
      
      // Sort by creation date (newest first)
      allOrders.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      setOrders(allOrders);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmount = (amount: string, decimals: number = 18): string => {
    try {
      const value = Number(amount) / Math.pow(10, decimals);
      return value.toFixed(4);
    } catch {
      return '0.0000';
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'status-badge status-pending';
      case 'filled':
        return 'status-badge status-filled';
      case 'cancelled':
        return 'status-badge status-cancelled';
      default:
        return 'status-badge';
    }
  };

  return (
    <div className="order-history">
      <h2>Order History</h2>
      
      {isLoading ? (
        <p>Loading orders...</p>
      ) : orders.length === 0 ? (
        <p>No orders found. Create your first swap order above!</p>
      ) : (
        <div className="order-list">
          {orders.map(order => (
            <div key={order.id} className="order-item">
              <h4>Order #{order.id.slice(0, 8)}</h4>
              <span className={getStatusBadgeClass(order.status)}>
                {order.status}
              </span>
              
              <div className="order-details">
                <p><strong>From:</strong> {order.fromChain}</p>
                <p><strong>To:</strong> {order.toChain}</p>
                <p><strong>Amount:</strong> {formatAmount(order.fromAmount)}</p>
                <p><strong>Min Receive:</strong> {formatAmount(order.minToAmount)}</p>
                <p><strong>Filled:</strong> {formatAmount(order.filledAmount)}</p>
                <p><strong>Created:</strong> {new Date(order.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderHistory;