import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { WETHApprovalService } from '../services/WETHApprovalService';

interface ApprovalBannerProps {
  ethAccount: string | null;
  ethSigner: ethers.Signer | null;
  wethAddress: string;
  escrowAddress: string;
  onApprovalComplete?: () => void;
}

export const ApprovalBanner: React.FC<ApprovalBannerProps> = ({
  ethAccount,
  ethSigner,
  wethAddress,
  escrowAddress,
  onApprovalComplete
}) => {
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [currentAllowance, setCurrentAllowance] = useState<string>('0');
  const [error, setError] = useState<string>('');
  
  useEffect(() => {
    checkApproval();
  }, [ethAccount, wethAddress, escrowAddress]);
  
  const checkApproval = async () => {
    if (!ethAccount || !ethSigner) return;
    
    try {
      const provider = await ethSigner.provider;
      if (!provider) return;
      
      const approvalService = new WETHApprovalService(provider, wethAddress, escrowAddress);
      const status = await approvalService.checkApproval(ethAccount);
      
      setNeedsApproval(status.needsApproval);
      setCurrentAllowance(approvalService.formatAllowance(status.currentAllowance));
    } catch (error) {
      console.error('Error checking approval:', error);
    }
  };
  
  const handleApprove = async () => {
    if (!ethSigner) return;
    
    setIsApproving(true);
    setError('');
    
    try {
      const provider = await ethSigner.provider;
      if (!provider) return;
      
      const approvalService = new WETHApprovalService(provider, wethAddress, escrowAddress);
      const result = await approvalService.requestApproval(ethSigner);
      
      if (result.success) {
        setNeedsApproval(false);
        if (onApprovalComplete) {
          onApprovalComplete();
        }
        // Re-check approval to update UI
        await checkApproval();
      } else {
        setError(result.error || 'Approval failed');
      }
    } catch (error: any) {
      setError(error.message || 'Approval failed');
    } finally {
      setIsApproving(false);
    }
  };
  
  if (!needsApproval || !ethAccount) {
    return null;
  }
  
  return (
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '16px',
      borderRadius: '8px',
      marginBottom: '16px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ color: 'white', marginBottom: '12px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>
          🎉 Enable Gasless Swaps!
        </h3>
        <p style={{ margin: '0 0 4px 0', fontSize: '14px', opacity: 0.9 }}>
          One-time approval needed to enable true gasless swaps.
        </p>
        <p style={{ margin: '0', fontSize: '12px', opacity: 0.8 }}>
          Current allowance: {currentAllowance}
        </p>
      </div>
      
      {error && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          color: '#ff6b6b',
          padding: '8px',
          borderRadius: '4px',
          marginBottom: '12px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}
      
      <button
        onClick={handleApprove}
        disabled={isApproving}
        style={{
          background: 'white',
          color: '#667eea',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '6px',
          fontWeight: 'bold',
          cursor: isApproving ? 'not-allowed' : 'pointer',
          opacity: isApproving ? 0.7 : 1,
          width: '100%',
          fontSize: '16px',
          transition: 'all 0.2s'
        }}
      >
        {isApproving ? 'Approving...' : 'Approve WETH for Gasless Swaps'}
      </button>
      
      <p style={{
        margin: '8px 0 0 0',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center'
      }}>
        This is a one-time transaction. After this, all swaps will be gasless!
      </p>
    </div>
  );
};