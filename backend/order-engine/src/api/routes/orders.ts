import { Router, Request, Response } from 'express';
import { OrderService } from '../../services/OrderService';
import { CreateOrderSchema } from '../../types/order';
import { z } from 'zod';

export function createOrderRoutes(orderService: OrderService): Router {
  const router = Router();

  // Create new order
  router.post('/orders', async (req: Request, res: Response) => {
    try {
      console.log('Received order:', JSON.stringify(req.body, null, 2));
      const orderDto = CreateOrderSchema.parse(req.body);
      const order = await orderService.createOrder(orderDto);
      res.json({ success: true, data: order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', error.errors);
        res.status(400).json({ 
          success: false, 
          error: 'Validation error', 
          details: error.errors 
        });
      } else if (error instanceof Error) {
        console.error('Order creation error:', error.message);
        res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      } else {
        console.error('Unknown error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  });

  // Get order by ID
  router.get('/orders/:orderId', async (req: Request, res: Response) => {
    try {
      const order = await orderService.getOrder(req.params.orderId);
      if (!order) {
        res.status(404).json({ 
          success: false, 
          error: 'Order not found' 
        });
        return;
      }
      res.json({ success: true, data: order });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // Get orders by maker
  router.get('/orders/maker/:maker', async (req: Request, res: Response) => {
    try {
      const orders = await orderService.getOrdersByMaker(req.params.maker);
      res.json({ success: true, data: orders });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // Get active orders
  router.get('/orders', async (req: Request, res: Response) => {
    try {
      const orders = await orderService.getActiveOrders();
      res.json({ success: true, data: orders });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // Cancel order
  router.post('/orders/:orderId/cancel', async (req: Request, res: Response) => {
    try {
      const { maker } = req.body;
      if (!maker) {
        res.status(400).json({ 
          success: false, 
          error: 'Maker address required' 
        });
        return;
      }
      
      await orderService.cancelOrder(req.params.orderId, maker);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  });

  // Create fill (for resolvers)
  router.post('/orders/:orderId/fills', async (req: Request, res: Response) => {
    try {
      const fill = await orderService.createFill(req.params.orderId, req.body);
      res.json({ success: true, data: fill });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  });

  // Update fill status
  router.patch('/orders/:orderId/fills/:fillId', async (req: Request, res: Response) => {
    try {
      const { status, sourceChainTxHash, destChainTxHash } = req.body;
      await orderService.updateFillStatus(
        req.params.orderId,
        req.params.fillId,
        status,
        { sourceChainTxHash, destChainTxHash }
      );
      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  });

  return router;
}