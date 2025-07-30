import { ResolverServiceV2 } from './services/ResolverServiceV2';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

async function main() {
  console.log('Starting Fusion+ Resolver Service V2...');
  console.log('Using proper Fusion+ flow - resolver only creates destination escrow');
  
  // Start HTTP server for health checks
  const app = express();
  const port = process.env.RESOLVER_PORT || 3002;
  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'resolver-v2' });
  });
  
  app.listen(port, () => {
    console.log(`Resolver HTTP server listening on port ${port}`);
  });
  
  // Start resolver service
  const resolver = new ResolverServiceV2();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down resolver...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down resolver...');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});