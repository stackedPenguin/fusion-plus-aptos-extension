import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { OrderService } from './services/OrderService';
import { createOrderRoutes } from './api/routes/orders';
import { setupOrderWebSocket } from './websocket/orderSocket';

dotenv.config();

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Services
const orderService = new OrderService();

// Routes
app.use('/api', createOrderRoutes(orderService));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket
setupOrderWebSocket(server, orderService);

// Cleanup expired orders every minute
setInterval(() => {
  orderService.cleanupExpiredOrders();
}, 60000);

server.listen(port, () => {
  console.log(`Order engine server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});