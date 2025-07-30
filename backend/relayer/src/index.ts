import { RelayerServiceSimple } from './services/RelayerServiceSimple';

async function main() {
  const relayer = new RelayerServiceSimple();
  
  // Start the relayer service
  await relayer.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down relayer service...');
    relayer.stop();
    process.exit(0);
  });
}

main().catch(console.error);