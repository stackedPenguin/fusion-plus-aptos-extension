import React, { useState } from 'react';
import { 
  Aptos, 
  AptosConfig, 
  Network, 
  Ed25519PrivateKey,
  Account
} from '@aptos-labs/ts-sdk';
import { CONTRACTS } from '../config/contracts';

// Helper function to safely stringify objects with BigInt
const safeStringify = (obj: any, indent?: number) => {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, indent);
};

const SponsoredTxTestSimple: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [txDetails, setTxDetails] = useState<any>(null);
  const [userAddress, setUserAddress] = useState<string>('');
  const [userPrivateKey, setUserPrivateKey] = useState<string>('');
  const [resolverPrivateKey, setResolverPrivateKey] = useState<string>('');

  const testMultiAgentTransaction = async () => {
    if (!userAddress || !userPrivateKey || !resolverPrivateKey) {
      setError('Please provide all required information');
      return;
    }

    try {
      setStatus('Setting up accounts...');
      setError('');
      
      const aptosConfig = new AptosConfig({ network: Network.TESTNET });
      const aptos = new Aptos(aptosConfig);

      // Create account objects from private keys
      const userAccount = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(userPrivateKey),
      });

      const resolverAccount = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(resolverPrivateKey),
      });

      // Verify addresses match
      if (userAccount.accountAddress.toString() !== userAddress) {
        setError('User private key does not match the provided address');
        return;
      }

      if (resolverAccount.accountAddress.toString() !== CONTRACTS.RESOLVER.APTOS) {
        setError('Resolver private key does not match the expected resolver address');
        return;
      }

      setStatus('Building multi-agent transaction...');

      // Generate test data
      const escrowId = new Uint8Array(32);
      crypto.getRandomValues(escrowId);
      
      const hashlock = new Uint8Array(32);
      crypto.getRandomValues(hashlock);
      
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      // Build the transaction payload
      const payload = {
        function: `${CONTRACTS.APTOS.ESCROW}::escrow_v2::create_escrow_multi_agent` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [
          Array.from(escrowId),
          userAddress, // beneficiary
          '1000000', // 0.01 APT
          Array.from(hashlock),
          timelock.toString(),
          '100000' // safety deposit
        ]
      };

      // Build the multi-agent transaction
      const transaction = await aptos.transaction.build.multiAgent({
        sender: userAccount.accountAddress,
        secondarySignerAddresses: [resolverAccount.accountAddress],
        data: payload,
        options: {
          maxGasAmount: 200000,
          gasUnitPrice: 100,
        },
        withFeePayer: true // Enable fee payer
      });

      console.log('Built transaction:', transaction);
      setStatus('Transaction built successfully!');

      // Display transaction details
      setTxDetails({
        transaction: {
          type: transaction.constructor.name,
          sender: userAccount.accountAddress.toString(),
          secondarySigners: [resolverAccount.accountAddress.toString()],
          feePayerAddress: transaction.feePayerAddress?.toString() || '0x0',
          payload: payload,
        },
        testData: {
          escrowId: '0x' + Buffer.from(escrowId).toString('hex'),
          hashlock: '0x' + Buffer.from(hashlock).toString('hex'),
          timelock,
        }
      });

      setStatus('Now you can test signing this transaction with the actual resolver backend!');

    } catch (err: any) {
      console.error('Error in transaction flow:', err);
      setError(err.message || 'Failed in transaction flow');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Simple Multi-Agent Transaction Test</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p>This test builds a multi-agent transaction using real addresses.</p>
        <p><strong>Resolver Address:</strong> {CONTRACTS.RESOLVER.APTOS}</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <label>Your Wallet Address:</label>
          <input
            type="text"
            value={userAddress}
            onChange={(e) => setUserAddress(e.target.value)}
            placeholder="0x..."
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '5px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label>Your Private Key (for testing only!):</label>
          <input
            type="password"
            value={userPrivateKey}
            onChange={(e) => setUserPrivateKey(e.target.value)}
            placeholder="Private key hex string (without 0x prefix)"
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '5px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label>Resolver Private Key (for testing only!):</label>
          <input
            type="password"
            value={resolverPrivateKey}
            onChange={(e) => setResolverPrivateKey(e.target.value)}
            placeholder="Resolver private key hex string (without 0x prefix)"
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '5px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>

        <button 
          onClick={testMultiAgentTransaction}
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Build Multi-Agent Transaction
        </button>
      </div>

      {status && (
        <div style={{
          padding: '10px',
          backgroundColor: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '5px',
          marginBottom: '10px',
          whiteSpace: 'pre-wrap'
        }}>
          <strong>Status:</strong> {status}
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '5px',
          marginBottom: '10px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {txDetails && (
        <div style={{
          padding: '10px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '5px',
          overflow: 'auto'
        }}>
          <h3>Transaction Details:</h3>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {safeStringify(txDetails, 2)}
          </pre>
        </div>
      )}

      <div style={{
        padding: '10px',
        backgroundColor: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '5px',
        marginTop: '20px'
      }}>
        <strong>⚠️ Security Note:</strong> This is for testing only! Never share your private keys in production.
      </div>
    </div>
  );
};

export default SponsoredTxTestSimple;