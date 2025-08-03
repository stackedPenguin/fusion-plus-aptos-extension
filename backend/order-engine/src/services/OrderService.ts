import { v4 as uuidv4 } from 'uuid';
import { CreateOrderDto, Order, OrderStatus, Fill } from '../types/order';
import { validateOrderSignature } from '../utils/signature';
import { EventEmitter } from 'events';

export class OrderService extends EventEmitter {
  private orders: Map<string, Order> = new Map();
  private ordersByMaker: Map<string, Set<string>> = new Map();

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // Validate signature
    const isValid = await validateOrderSignature(dto);
    if (!isValid) {
      throw new Error('Invalid order signature');
    }

    // Check deadline
    if (Date.now() > dto.deadline * 1000) {
      throw new Error('Order deadline has passed');
    }

    const order: Order = {
      ...dto,
      id: uuidv4(),
      status: OrderStatus.PENDING,
      filledAmount: '0',
      filledPercentage: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      fills: []
    };

    this.orders.set(order.id, order);
    
    // Track orders by maker
    if (!this.ordersByMaker.has(dto.maker)) {
      this.ordersByMaker.set(dto.maker, new Set());
    }
    this.ordersByMaker.get(dto.maker)!.add(order.id);

    // Emit event for resolvers
    this.emit('newOrder', order);

    return order;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }

  async getOrdersByMaker(maker: string): Promise<Order[]> {
    const orderIds = this.ordersByMaker.get(maker) || new Set();
    return Array.from(orderIds)
      .map(id => this.orders.get(id))
      .filter((order): order is Order => order !== undefined);
  }

  async getActiveOrders(): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(
      order => order.status === OrderStatus.PENDING || order.status === OrderStatus.PARTIALLY_FILLED
    );
  }

  async createFill(orderId: string, fill: Omit<Fill, 'id' | 'orderId' | 'createdAt' | 'updatedAt'>): Promise<Fill> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED) {
      throw new Error('Order is not fillable');
    }

    const newFill: Fill = {
      ...fill,
      id: uuidv4(),
      orderId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    order.fills.push(newFill);
    order.updatedAt = new Date();

    // Update filled amount and percentage
    // For cross-chain swaps, we need to track by fill percentage, not raw amounts
    if (order.fills.length > 0) {
      // Check if this is a cross-chain swap with different token decimals
      const isCrossChain = order.fromChain !== order.toChain;
      
      if (isCrossChain && order.fills.some(f => (f as any).fillPercentage !== undefined)) {
        // Use fill percentages for cross-chain swaps
        const totalFillPercentage = order.fills.reduce((sum, f) => {
          return sum + ((f as any).fillPercentage || 0);
        }, 0);
        order.filledPercentage = Math.min(totalFillPercentage, 100);
        
        // Calculate filled amount as percentage of fromAmount
        order.filledAmount = (BigInt(order.fromAmount) * BigInt(Math.floor(order.filledPercentage)) / BigInt(100)).toString();
      } else {
        // Use raw amounts for same-chain swaps or legacy fills
        const totalFilled = order.fills.reduce((sum, f) => {
          return (BigInt(sum) + BigInt(f.amount)).toString();
        }, '0');
        order.filledAmount = totalFilled;
        
        // Calculate percentage from amounts
        const filledPercentage = Number((BigInt(totalFilled) * BigInt(100)) / BigInt(order.fromAmount));
        order.filledPercentage = filledPercentage;
      }
    } else {
      order.filledAmount = '0';
      order.filledPercentage = 0;
    }

    // Update order status
    if (order.filledAmount === order.fromAmount) {
      order.status = OrderStatus.FILLED;
    } else if (order.filledAmount !== '0') {
      order.status = OrderStatus.PARTIALLY_FILLED;
    }

    this.emit('orderFill', { order, fill: newFill });

    return newFill;
  }

  async updateFillStatus(
    orderId: string, 
    fillId: string, 
    status: Fill['status'],
    txHash?: { sourceChainTxHash?: string; destChainTxHash?: string }
  ): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const fill = order.fills.find(f => f.id === fillId);
    if (!fill) {
      throw new Error('Fill not found');
    }

    fill.status = status;
    fill.updatedAt = new Date();
    
    if (txHash?.sourceChainTxHash) {
      fill.sourceChainTxHash = txHash.sourceChainTxHash;
    }
    if (txHash?.destChainTxHash) {
      fill.destChainTxHash = txHash.destChainTxHash;
    }

    order.updatedAt = new Date();

    this.emit('fillStatusUpdate', { order, fill });
  }

  async cancelOrder(orderId: string, maker: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.maker !== maker) {
      throw new Error('Only maker can cancel order');
    }

    if (order.status === OrderStatus.FILLED) {
      throw new Error('Cannot cancel filled order');
    }

    order.status = OrderStatus.CANCELLED;
    order.updatedAt = new Date();

    this.emit('orderCancelled', order);
  }

  // Update order filled percentage (for partial fills)
  async updateOrderFilledPercentage(orderId: string, percentage: number): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    order.filledPercentage = percentage;
    order.updatedAt = new Date();

    // Update status based on percentage
    if (percentage >= 100) {
      order.status = OrderStatus.FILLED;
    } else if (percentage > 0) {
      order.status = OrderStatus.PARTIALLY_FILLED;
    }

    this.emit('orderUpdate', order);
  }

  // Cleanup expired orders
  async cleanupExpiredOrders(): Promise<void> {
    const now = Date.now();
    for (const order of this.orders.values()) {
      if (order.status === OrderStatus.PENDING && order.deadline * 1000 < now) {
        order.status = OrderStatus.EXPIRED;
        order.updatedAt = new Date();
        this.emit('orderExpired', order);
      }
    }
  }
}