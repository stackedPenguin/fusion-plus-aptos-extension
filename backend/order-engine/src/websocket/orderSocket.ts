import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { OrderService } from '../services/OrderService';
import { Order, Fill } from '../types/order';

export function setupOrderWebSocket(server: HttpServer, orderService: OrderService): SocketServer {
  const io = new SocketServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST']
    }
  });

  // Listen to order service events
  orderService.on('newOrder', (order: Order) => {
    io.emit('order:new', order);
  });

  orderService.on('orderFill', ({ order, fill }: { order: Order; fill: Fill }) => {
    io.emit('order:fill', { order, fill });
  });

  orderService.on('fillStatusUpdate', ({ order, fill }: { order: Order; fill: Fill }) => {
    io.emit('fill:statusUpdate', { order, fill });
  });

  orderService.on('orderCancelled', (order: Order) => {
    io.emit('order:cancelled', order);
  });

  orderService.on('orderExpired', (order: Order) => {
    io.emit('order:expired', order);
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Subscribe to specific order updates
    socket.on('subscribe:order', (orderId: string) => {
      socket.join(`order:${orderId}`);
    });

    socket.on('unsubscribe:order', (orderId: string) => {
      socket.leave(`order:${orderId}`);
    });

    // Subscribe to maker's orders
    socket.on('subscribe:maker', (maker: string) => {
      socket.join(`maker:${maker}`);
    });

    socket.on('unsubscribe:maker', (maker: string) => {
      socket.leave(`maker:${maker}`);
    });

    // Subscribe to all active orders (for resolvers)
    socket.on('subscribe:active', () => {
      socket.join('active:orders');
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}