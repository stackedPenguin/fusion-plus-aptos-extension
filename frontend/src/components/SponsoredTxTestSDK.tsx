import React, { useState } from 'react';
import { 
  Account, 
  Aptos, 
  AptosConfig, 
  Network, 
  Deserializer,
  SimpleTransaction,
  AccountAuthenticator,
  MultiAgentRawTransaction
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

const SponsoredTxTestSDK: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [txDetails, setTxDetails] = useState<any>(null);
  const [testAccounts, setTestAccounts] = useState<{
    alice: Account | null;
    resolver: Account | null;
  }>({ alice: null, resolver: null });

  const setupTestAccounts = async () => {
    try {
      setStatus('Creating test accounts...');
      setError('');
      
      const aptosConfig = new AptosConfig({ network: Network.TESTNET });
      const aptos = new Aptos(aptosConfig);

      // Generate test accounts
      const alice = Account.generate();
      const resolver = Account.generate();

      setStatus('Funding test accounts...');
      
      // Fund the accounts
      await aptos.fundAccount({
        accountAddress: alice.accountAddress,
        amount: 100_000_000, // 1 APT
      });

      await aptos.fundAccount({
        accountAddress: resolver.accountAddress,
        amount: 100_000_000, // 1 APT
      });

      setTestAccounts({ alice, resolver });

      setStatus(`Test accounts created and funded:
        Alice (User): ${alice.accountAddress}
        Resolver: ${resolver.accountAddress}`);
      
    } catch (err: any) {
      console.error('Error setting up accounts:', err);
      setError(err.message || 'Failed to setup test accounts');
    }
  };

  const testMultiAgentSponsoredTransaction = async () => {
    if (!testAccounts.alice || !testAccounts.resolver) {
      setError('Please setup test accounts first');
      return;
    }

    try {
      setStatus('Building multi-agent transaction...');
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
          testAccounts.alice.accountAddress.toString(), // beneficiary
          '1000000', // 0.01 APT
          Array.from(hashlock),
          timelock.toString(),
          '100000' // safety deposit
        ]
      };

      setStatus('Building multi-agent transaction with fee payer...');
      
      // Build the multi-agent transaction
      const transaction = await aptos.transaction.build.multiAgent({
        sender: testAccounts.alice.accountAddress,
        secondarySignerAddresses: [testAccounts.resolver.accountAddress],
        data: payload,
        options: {
          maxGasAmount: 200000,
          gasUnitPrice: 100,
        },
        withFeePayer: true // Enable fee payer
      });

      console.log('Built transaction:', transaction);
      console.log('Transaction type:', transaction.constructor.name);

      setStatus('Signing transaction with all parties...');

      // 1. Alice signs as the primary signer
      const aliceAuth = aptos.transaction.sign({
        signer: testAccounts.alice,
        transaction,
      });

      // 2. Resolver signs as secondary signer
      const resolverAuth = aptos.transaction.sign({
        signer: testAccounts.resolver,
        transaction,
      });

      // 3. Resolver also signs as fee payer
      const feePayerAuth = aptos.transaction.signAsFeePayer({
        signer: testAccounts.resolver,
        transaction,
      });

      setStatus('Submitting multi-agent transaction...');

      // Submit the transaction
      const pendingTx = await aptos.transaction.submit.multiAgent({
        transaction,
        senderAuthenticator: aliceAuth,
        additionalSignersAuthenticators: [resolverAuth],
        feePayerAuthenticator: feePayerAuth,
      });

      console.log('Transaction submitted:', pendingTx.hash);
      setStatus(`Transaction submitted! Hash: ${pendingTx.hash}`);

      // Wait for confirmation
      setStatus('Waiting for transaction confirmation...');
      const executedTx = await aptos.waitForTransaction({
        transactionHash: pendingTx.hash,
        options: { checkSuccess: true }
      });

      if (executedTx.success) {
        setStatus(`✅ Transaction confirmed successfully!
          Hash: ${executedTx.hash}
          Gas used: ${executedTx.gas_used}
          Gas paid by: Resolver (${testAccounts.resolver.accountAddress})`);
        
        setTxDetails({
          transaction: executedTx,
          escrowId: '0x' + Buffer.from(escrowId).toString('hex'),
          hashlock: '0x' + Buffer.from(hashlock).toString('hex'),
          timelock,
        });
      } else {
        setError(`Transaction failed: ${executedTx.vm_status}`);
      }

    } catch (err: any) {
      console.error('Error in transaction flow:', err);
      setError(err.message || 'Failed in transaction flow');
    }
  };

  const testSerializationFlow = async () => {
    if (!testAccounts.alice || !testAccounts.resolver) {
      setError('Please setup test accounts first');
      return;
    }

    try {
      setStatus('Testing serialization flow (like frontend/backend split)...');
      setError('');
      
      const aptosConfig = new AptosConfig({ network: Network.TESTNET });
      const aptos = new Aptos(aptosConfig);

      // Frontend: Build transaction
      const escrowId = new Uint8Array(32);
      crypto.getRandomValues(escrowId);
      
      const hashlock = new Uint8Array(32);
      crypto.getRandomValues(hashlock);
      
      const timelock = Math.floor(Date.now() / 1000) + 3600;

      const payload = {
        function: `${CONTRACTS.APTOS.ESCROW}::escrow_v2::create_escrow_multi_agent` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [
          Array.from(escrowId),
          testAccounts.alice.accountAddress.toString(),
          '1000000',
          Array.from(hashlock),
          timelock.toString(),
          '100000'
        ]
      };

      const transaction = await aptos.transaction.build.multiAgent({
        sender: testAccounts.alice.accountAddress,
        secondarySignerAddresses: [testAccounts.resolver.accountAddress],
        data: payload,
        options: {
          maxGasAmount: 200000,
          gasUnitPrice: 100,
        },
        withFeePayer: true
      });

      // Frontend: Alice signs
      const aliceAuth = aptos.transaction.sign({
        signer: testAccounts.alice,
        transaction,
      });

      // Serialize for sending to backend
      const transactionBytes = transaction.bcsToBytes();
      const aliceAuthBytes = aliceAuth.bcsToBytes();

      setStatus('Simulating backend processing...');

      // Backend: Deserialize and sign
      const txDeserializer = new Deserializer(transactionBytes);
      const deserializedTx = SimpleTransaction.deserialize(txDeserializer);

      const authDeserializer = new Deserializer(aliceAuthBytes);
      const deserializedAuth = AccountAuthenticator.deserialize(authDeserializer);

      // Backend: Resolver signs
      const resolverAuth = aptos.transaction.sign({
        signer: testAccounts.resolver,
        transaction: deserializedTx,
      });

      const feePayerAuth = aptos.transaction.signAsFeePayer({
        signer: testAccounts.resolver,
        transaction: deserializedTx,
      });

      // Backend: Submit
      const pendingTx = await aptos.transaction.submit.multiAgent({
        transaction: deserializedTx,
        senderAuthenticator: deserializedAuth,
        additionalSignersAuthenticators: [resolverAuth],
        feePayerAuthenticator: feePayerAuth,
      });

      setStatus(`✅ Serialization flow successful! Tx: ${pendingTx.hash}`);

    } catch (err: any) {
      console.error('Error in serialization flow:', err);
      setError(err.message || 'Failed in serialization flow');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Sponsored Transaction Test (SDK Direct)</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p>This test uses the Aptos SDK directly to test multi-agent sponsored transactions.</p>
        <p>No wallet extensions required - everything is done programmatically.</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={setupTestAccounts}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          1. Setup Test Accounts
        </button>

        <button 
          onClick={testMultiAgentSponsoredTransaction}
          disabled={!testAccounts.alice}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: testAccounts.alice ? 'pointer' : 'not-allowed'
          }}
        >
          2. Test Multi-Agent Sponsored Tx
        </button>

        <button 
          onClick={testSerializationFlow}
          disabled={!testAccounts.alice}
          style={{
            padding: '10px 20px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: testAccounts.alice ? 'pointer' : 'not-allowed'
          }}
        >
          3. Test Serialization Flow
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

      {testAccounts.alice && (
        <div style={{
          padding: '10px',
          backgroundColor: '#e9ecef',
          border: '1px solid #ced4da',
          borderRadius: '5px',
          marginTop: '10px'
        }}>
          <h3>Test Accounts:</h3>
          <p><strong>Alice (User):</strong> {testAccounts.alice.accountAddress.toString()}</p>
          <p><strong>Resolver:</strong> {testAccounts.resolver?.accountAddress.toString()}</p>
        </div>
      )}
    </div>
  );
};

export default SponsoredTxTestSDK;