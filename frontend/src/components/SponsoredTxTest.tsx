import React, { useState } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network, Ed25519PublicKey, AccountAuthenticatorEd25519, Ed25519Signature } from '@aptos-labs/ts-sdk';
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

const SponsoredTxTest: React.FC = () => {
  const { account, signTransaction } = useWallet();
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [txDetails, setTxDetails] = useState<any>(null);

  const testSponsoredTransaction = async () => {
    if (!account) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setStatus('Building transaction...');
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
          account.address, // beneficiary is the sender
          '1000000', // 0.01 APT
          Array.from(hashlock),
          timelock.toString(),
          '100000' // safety deposit
        ]
      };

      setStatus('Building multi-agent transaction...');
      
      // Build the raw transaction
      const rawTransaction = await aptos.transaction.build.multiAgent({
        sender: account.address,
        secondarySignerAddresses: [CONTRACTS.RESOLVER.APTOS],
        data: payload,
        options: {
          maxGasAmount: 200000,
          gasUnitPrice: 100,
        },
        withFeePayer: true
      });

      setTxDetails({
        rawTransaction,
        feePayerAddress: CONTRACTS.RESOLVER.APTOS
      });

      setStatus('Transaction built. Click "Sign Transaction" to test signing...');
      
    } catch (err: any) {
      console.error('Error building transaction:', err);
      setError(err.message || 'Failed to build transaction');
    }
  };

  const signBuiltTransaction = async () => {
    if (!txDetails || !account || !signTransaction) {
      setError('No transaction to sign or wallet not connected');
      return;
    }

    try {
      setStatus('Requesting signature from wallet...');
      setError('');

      console.log('Signing transaction with details:', safeStringify(txDetails, 2));

      // Try signing with the wallet
      const signedTx = await signTransaction(txDetails);
      
      console.log('Transaction signed successfully:', signedTx);
      setStatus('Transaction signed successfully! Check console for details.');
      
      // Display the signature
      setTxDetails({
        ...txDetails,
        signature: signedTx
      });

    } catch (err: any) {
      console.error('Error signing transaction:', err);
      setError(err.message || 'Failed to sign transaction');
      
      // Check if it's a simulation error
      if (err.message?.includes('Simulation')) {
        setStatus('Simulation failed. Trying alternative approach...');
        
        // Log more details about the transaction
        console.log('Transaction that failed simulation:', {
          sender: account.address,
          secondarySigners: [CONTRACTS.RESOLVER.APTOS],
          feePayerAddress: txDetails.feePayerAddress,
          payload: txDetails.rawTransaction.rawTransaction.payload
        });
      }
    }
  };

  const testSimulation = async () => {
    if (!txDetails || !account) {
      setError('Build a transaction first');
      return;
    }

    try {
      setStatus('Simulating transaction...');
      setError('');
      
      const aptosConfig = new AptosConfig({ network: Network.TESTNET });
      const aptos = new Aptos(aptosConfig);

      // Try to simulate the transaction
      console.log('Simulating with transaction:', txDetails.rawTransaction);
      
      // For multi-agent transactions, we need the public keys of all signers
      // Since we don't have the resolver's public key here, this might fail
      setStatus('Note: Simulation may fail without all signer public keys');
      
      // Log the transaction structure
      console.log('Transaction structure:', {
        type: txDetails.rawTransaction.constructor.name,
        hasFeePayer: txDetails.rawTransaction.feePayerAddress !== undefined,
        feePayerAddress: txDetails.rawTransaction.feePayerAddress?.toString(),
        secondarySigners: txDetails.rawTransaction.secondarySignerAddresses?.map((a: any) => a.toString())
      });

    } catch (err: any) {
      console.error('Simulation error:', err);
      setError(err.message || 'Simulation failed');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Sponsored Transaction Test</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p><strong>Connected Account:</strong> {account?.address || 'Not connected'}</p>
        <p><strong>Resolver (Fee Payer):</strong> {CONTRACTS.RESOLVER.APTOS}</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={testSponsoredTransaction}
          disabled={!account}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: account ? 'pointer' : 'not-allowed'
          }}
        >
          Build Transaction
        </button>

        <button 
          onClick={signBuiltTransaction}
          disabled={!txDetails}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: txDetails ? 'pointer' : 'not-allowed'
          }}
        >
          Sign Transaction
        </button>

        <button 
          onClick={testSimulation}
          disabled={!txDetails}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: txDetails ? 'pointer' : 'not-allowed'
          }}
        >
          Test Simulation
        </button>
      </div>

      {status && (
        <div style={{
          padding: '10px',
          backgroundColor: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '5px',
          marginBottom: '10px'
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

export default SponsoredTxTest;