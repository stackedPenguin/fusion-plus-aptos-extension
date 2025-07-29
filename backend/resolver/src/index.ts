import { ResolverService } from './services/ResolverService';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('Starting Fusion+ Resolver Service...');
  
  const resolver = new ResolverService();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down resolver...');
    resolver.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down resolver...');
    resolver.stop();
    process.exit(0);
  });

  // Start the resolver
  resolver.start();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});