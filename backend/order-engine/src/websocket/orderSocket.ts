import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { OrderService } from '../services/OrderService';
import { Order, Fill } from '../types/order';

export function setupOrderWebSocket(server: HttpServer, orderService: OrderService): SocketServer {
  const io = new SocketServer(server, {
    cors: {
      origin: '*', // Allow all origins for testing
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

    socket.on('order:failed', (data: any) => {
      console.log('Relaying order:failed event:', data);
      io.emit('order:failed', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:failed', data);
      }
    });

    socket.on('order:signed', (data: any) => {
      console.log('Relaying order:signed event:', data);
      io.emit('order:signed', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:signed', data);
      }
    });

    // Relay sponsored transaction event (Aptos fee payer model)
    socket.on('order:signed:sponsored:v2', (data: any) => {
      console.log('Relaying order:signed:sponsored:v2 event:', data);
      io.emit('order:signed:sponsored:v2', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:signed:sponsored:v2', data);
      }
    });

    // Relay sponsored transaction V3 event (Shinami pattern)
    socket.on('order:signed:sponsored:v3', (data: any) => {
      console.log('Relaying order:signed:sponsored:v3 event:', data);
      io.emit('order:signed:sponsored:v3', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:signed:sponsored:v3', data);
      }
    });

    // Relay permit-based order (user funds with permit signature)
    socket.on('order:signed:with:permit', (data: any) => {
      console.log('Relaying order:signed:with:permit event:', data);
      io.emit('order:signed:with:permit', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('order:signed:with:permit', data);
      }
    });
    
    // Relay secret request/reveal events for Fusion+ protocol
    socket.on('secret:request', (data: any) => {
      console.log('Relaying secret:request event:', data);
      io.emit('secret:request', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('secret:request', data);
      }
    });
    
    socket.on('secret:reveal', (data: any) => {
      console.log('Relaying secret:reveal event:', data);
      io.emit('secret:reveal', data);
      if (data.orderId) {
        io.to(`order:${data.orderId}`).emit('secret:reveal', data);
      }
    });
    
    // Relay partial fill events
    socket.on('partial:fill:created', async (data: any) => {
      console.log('Relaying partial:fill:created event:', data);
      
      // Update order filled percentage when partial fill is created
      if (data.orderId && data.cumulativePercentage !== undefined) {
        try {
          await orderService.updateOrderFilledPercentage(data.orderId, data.cumulativePercentage);
          console.log(`Updated order ${data.orderId} to ${data.cumulativePercentage}% filled`);
        } catch (error) {
          console.error('Failed to update order filled percentage:', error);
        }
      }
      
      // Only emit to all clients, not to specific room to avoid duplicates
      io.emit('partial:fill:created', data);
    });
    
    socket.on('partial:fill:completed', (data: any) => {
      console.log('Relaying partial:fill:completed event:', data);
      // Only emit to all clients, not to specific room to avoid duplicates
      io.emit('partial:fill:completed', data);
    });
    
    socket.on('order:update', (data: any) => {
      console.log('Relaying order:update event:', data);
      // Only emit to all clients, not to specific room to avoid duplicates
      io.emit('order:update', data);
    });

    // Handle new order submissions
    socket.on('order:new', async (order: Order) => {
      console.log('Received order:new from client:', order);
      try {
        const createdOrder = await orderService.createOrder(order);
        socket.emit('order:created', { orderId: createdOrder.id });
      } catch (error: any) {
        console.error('Failed to create order:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}