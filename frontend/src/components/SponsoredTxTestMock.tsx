import React, { useState } from 'react';
import { 
  Aptos, 
  AptosConfig, 
  Network
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

const SponsoredTxTestMock: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [txDetails, setTxDetails] = useState<any>(null);
  const [userAddress, setUserAddress] = useState<string>('');

  const buildMockTransaction = async () => {
    if (!userAddress) {
      setError('Please provide your wallet address');
      return;
    }

    try {
      setStatus('Building mock multi-agent transaction...');
      setError('');
      
      const aptosConfig = new AptosConfig({ network: Network.TESTNET });
      const aptos = new Aptos(aptosConfig);

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

      setStatus('Building transaction structure...');

      // Build the multi-agent transaction
      const transaction = await aptos.transaction.build.multiAgent({
        sender: userAddress,
        secondarySignerAddresses: [CONTRACTS.RESOLVER.APTOS],
        data: payload,
        options: {
          maxGasAmount: 200000,
          gasUnitPrice: 100,
        },
        withFeePayer: true // Enable fee payer
      });

      console.log('Built transaction:', transaction);

      // Display transaction details
      setTxDetails({
        transactionStructure: {
          type: 'MultiAgentRawTransaction',
          sender: userAddress,
          secondarySigners: [CONTRACTS.RESOLVER.APTOS],
          feePayerAddress: '0x0 (will be set by resolver)',
          rawTransactionHex: transaction.bcsToHex(),
        },
        payload: payload,
        testData: {
          escrowId: '0x' + Array.from(escrowId).map(b => b.toString(16).padStart(2, '0')).join(''),
          hashlock: '0x' + Array.from(hashlock).map(b => b.toString(16).padStart(2, '0')).join(''),
          timelock,
        },
        signingFlow: {
          step1: 'User signs transaction (you)',
          step2: 'Resolver signs as secondary signer',
          step3: 'Resolver signs as fee payer',
          step4: 'Submit to chain'
        }
      });

      setStatus('✅ Mock transaction built successfully! This shows what would be sent to the wallet.');

    } catch (err: any) {
      console.error('Error building transaction:', err);
      setError(err.message || 'Failed to build transaction');
    }
  };

  const testAccountInfo = async () => {
    if (!userAddress) {
      setError('Please provide your wallet address');
      return;
    }

    try {
      setStatus('Fetching account info...');
      setError('');
      
      const aptosConfig = new AptosConfig({ network: Network.TESTNET });
      const aptos = new Aptos(aptosConfig);

      // Get account info
      const accountInfo = await aptos.getAccountInfo({ accountAddress: userAddress });
      const balance = await aptos.getAccountCoinAmount({ 
        accountAddress: userAddress,
        coinType: '0x1::aptos_coin::AptosCoin'
      });

      setStatus('✅ Account info fetched successfully!');
      setTxDetails({
        accountInfo: {
          address: userAddress,
          sequenceNumber: accountInfo.sequence_number,
          authenticationKey: accountInfo.authentication_key,
          balance: `${balance / 100_000_000} APT`
        }
      });

    } catch (err: any) {
      console.error('Error fetching account info:', err);
      setError(err.message || 'Failed to fetch account info');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Mock Multi-Agent Transaction Builder</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p>This builds a mock multi-agent transaction to show the structure without needing private keys.</p>
        <p><strong>Resolver Address:</strong> {CONTRACTS.RESOLVER.APTOS}</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <label>Your Wallet Address (from Petra/Pontem):</label>
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

        <button 
          onClick={testAccountInfo}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Check Account Info
        </button>

        <button 
          onClick={buildMockTransaction}
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Build Mock Transaction
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
    </div>
  );
};

export default SponsoredTxTestMock;