import { OrderService } from '../OrderService';
import { CreateOrderDto, Chain, OrderStatus } from '../../types/order';

// Mock the signature validation
jest.mock('../../utils/signature', () => ({
  validateOrderSignature: jest.fn().mockResolvedValue(true)
}));

describe('OrderService', () => {
  let orderService: OrderService;
  
  const mockOrder: CreateOrderDto = {
    fromChain: Chain.ETHEREUM,
    toChain: Chain.APTOS,
    fromToken: '0x0000000000000000000000000000000000000000',
    toToken: '0x1::aptos_coin::AptosCoin',
    fromAmount: '1000000000000000000', // 1 ETH
    minToAmount: '100000000', // 1 APT (8 decimals)
    maker: '0x1234567890123456789012345678901234567890',
    receiver: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    nonce: '1',
    signature: '0xmocksignature',
    partialFillAllowed: true,
    secretHashes: ['0xhash1', '0xhash2', '0xhash3']
  };

  beforeEach(() => {
    orderService = new OrderService();
  });

  describe('createOrder', () => {
    it('should create a new order', async () => {
      const order = await orderService.createOrder(mockOrder);
      
      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.filledAmount).toBe('0');
      expect(order.fills).toEqual([]);
      expect(order.fromAmount).toBe(mockOrder.fromAmount);
      expect(order.maker).toBe(mockOrder.maker);
    });

    it('should reject expired orders', async () => {
      const expiredOrder = {
        ...mockOrder,
        deadline: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      };

      await expect(orderService.createOrder(expiredOrder)).rejects.toThrow('Order deadline has passed');
    });
  });

  describe('getOrder', () => {
    it('should retrieve an order by ID', async () => {
      const created = await orderService.createOrder(mockOrder);
      const retrieved = await orderService.getOrder(created.id);
      
      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent order', async () => {
      const order = await orderService.getOrder('non-existent-id');
      expect(order).toBeNull();
    });
  });

  describe('createFill', () => {
    it('should create a fill for an order', async () => {
      const order = await orderService.createOrder(mockOrder);
      
      const fill = await orderService.createFill(order.id, {
        resolver: '0xresolver',
        amount: '500000000000000000', // 0.5 ETH
        fillPercentage: 50,
        cumulativePercentage: 50,
        secretHash: '0xhash1',
        secretIndex: 0,
        status: 'PENDING'
      });

      expect(fill).toBeDefined();
      expect(fill.id).toBeDefined();
      expect(fill.orderId).toBe(order.id);
      expect(fill.amount).toBe('500000000000000000');
      
      const updatedOrder = await orderService.getOrder(order.id);
      expect(updatedOrder?.status).toBe(OrderStatus.PARTIALLY_FILLED);
      expect(updatedOrder?.filledAmount).toBe('500000000000000000');
    });

    it('should fully fill an order', async () => {
      const order = await orderService.createOrder(mockOrder);
      
      await orderService.createFill(order.id, {
        resolver: '0xresolver',
        amount: mockOrder.fromAmount,
        fillPercentage: 100,
        cumulativePercentage: 100,
        secretHash: '0xhash1',
        secretIndex: 0,
        status: 'PENDING'
      });

      const updatedOrder = await orderService.getOrder(order.id);
      expect(updatedOrder?.status).toBe(OrderStatus.FILLED);
      expect(updatedOrder?.filledAmount).toBe(mockOrder.fromAmount);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel a pending order', async () => {
      const order = await orderService.createOrder(mockOrder);
      
      await orderService.cancelOrder(order.id, mockOrder.maker);
      
      const cancelled = await orderService.getOrder(order.id);
      expect(cancelled?.status).toBe(OrderStatus.CANCELLED);
    });

    it('should reject cancellation by non-maker', async () => {
      const order = await orderService.createOrder(mockOrder);
      
      await expect(
        orderService.cancelOrder(order.id, '0xwrongmaker')
      ).rejects.toThrow('Only maker can cancel order');
    });
  });
});