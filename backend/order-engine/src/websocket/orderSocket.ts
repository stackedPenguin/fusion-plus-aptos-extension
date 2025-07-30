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

    // Relay escrow events from resolver to frontend
    socket.on('escrow:destination:created', (data: any) => {
      console.log('Relaying escrow:destination:created event:', data);
      // Broadcast to all connected clients
      io.emit('escrow:destination:created', data);
      // Also emit to specific order room
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:escrowCreated', data);
      }
    });

    socket.on('escrow:source:created', (data: any) => {
      console.log('Relaying escrow:source:created event:', data);
      io.emit('escrow:source:created', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:sourceEscrowCreated', data);
      }
    });

    socket.on('escrow:secretRevealed', (data: any) => {
      console.log('Relaying escrow:secretRevealed event:', data);
      io.emit('escrow:secretRevealed', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:secretRevealed', data);
      }
    });

    socket.on('escrow:source:withdrawn', (data: any) => {
      console.log('Relaying escrow:source:withdrawn event:', data);
      io.emit('escrow:source:withdrawn', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:sourceWithdrawn', data);
      }
    });

    socket.on('swap:completed', (data: any) => {
      console.log('Relaying swap:completed event:', data);
      io.emit('swap:completed', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:completed', data);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}