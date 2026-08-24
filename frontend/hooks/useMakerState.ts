'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { BACKEND_URL } from '@/lib/constants';
import { networkHeaders } from '@/lib/networkHeader';

export type MakerState =
  | 'disconnected'
  | 'not_applied'
  | 'pending_approval'
  | 'rejected'
  | 'approved_sdk_pending'
  | 'approved_pool_pending'
  | 'approved_onchain_pending'
  | 'active';

export interface ApplicationData {
  found: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'registered';
  name: string;
  submittedAt: string;
  onChainRegistered: boolean;
}

export interface InventoryData {
  success: boolean;
  vault: { usdc: string; eurc: string };
  wallet: { usdc: string; eurc: string; xlm: string };
  poolAddress: string | null;
  poolDeployed: boolean;
}

export interface MakerStatusData {
  name: string;
  stellarAddress: string;
  signerPublicKey: string | null;
}

export interface MakerStateResult {
  state: MakerState;
  loading: boolean;
  applicationData: ApplicationData | null;
  inventoryData: InventoryData | null;
  makerData: MakerStatusData | null;
  refetch: (forceRefresh?: boolean) => void;
}

async function checkApplicationStatus(address: string): Promise<{
  found: boolean;
  status?: string;
  name?: string;
  submittedAt?: string;
  onChainRegistered?: boolean;
}> {
  try {
    const res = await fetch(`/api/maker-application/${address}`, { headers: networkHeaders() });
    if (res.status === 404) return { found: false };
    const data = await res.json();
    return data;
  } catch {
    return { found: false };
  }
}

async function fetchMakerStatus(address: string): Promise<MakerStatusData | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/makers/${address}/status`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.maker ?? null;
  } catch {
    return null;
  }
}

async function fetchPoolStatus(address: string): Promise<{ poolDeployed: boolean; poolAddress: string | null }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/makers/${address}/pool`);
    if (!res.ok) return { poolDeployed: false, poolAddress: null };
    return await res.json();
  } catch {
    return { poolDeployed: false, poolAddress: null };
  }
}

async function checkVaultInventory(address: string, forceRefresh = false): Promise<InventoryData & { hasFunds: boolean }> {
  const empty: InventoryData & { hasFunds: boolean } = {
    success: false,
    vault: { usdc: '0', eurc: '0' },
    wallet: { usdc: '0', eurc: '0', xlm: '0' },
    poolAddress: null,
    poolDeployed: false,
    hasFunds: false,
  };
  try {
    const url = forceRefresh
      ? `${BACKEND_URL}/api/makers/${address}/inventory?refresh=true`
      : `${BACKEND_URL}/api/makers/${address}/inventory`;
    const res = await fetch(url);
    if (!res.ok) return empty;
    const data = await res.json();
    const usdc = parseFloat(data.vault?.usdc || '0');
    const eurc = parseFloat(data.vault?.eurc || '0');
    return {
      success: true,
      vault: data.vault ?? { usdc: '0', eurc: '0' },
      wallet: data.wallet ?? { usdc: '0', eurc: '0', xlm: '0' },
      poolAddress: data.poolAddress ?? null,
      poolDeployed: data.poolDeployed ?? false,
      hasFunds: usdc > 0 || eurc > 0,
    };
  } catch {
    return empty;
  }
}

export function useMakerState(): MakerStateResult {
  const { address, isConnected } = useWallet();
  const [state, setState] = useState<MakerState>('disconnected');
  const [loading, setLoading] = useState(true);
  const [applicationData, setApplicationData] = useState<ApplicationData | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [makerData, setMakerData] = useState<MakerStatusData | null>(null);

  const detect = useCallback(async (forceRefresh = false) => {
    setLoading(true);

    if (!isConnected || !address) {
      setState('disconnected');
      setApplicationData(null);
      setInventoryData(null);
      setMakerData(null);
      setLoading(false);
      return;
    }

    // STEP 1: Application exists?
    const application = await checkApplicationStatus(address);

    if (!application.found) {
      setState('not_applied');
      setApplicationData(null);
      setLoading(false);
      return;
    }

    setApplicationData(application as ApplicationData);

    if (application.status === 'pending') {
      setState('pending_approval');
      setLoading(false);
      return;
    }

    if (application.status === 'rejected') {
      setState('rejected');
      setLoading(false);
      return;
    }

    // STEP 2: Check maker status — is signer key registered?
    const makerStatus = await fetchMakerStatus(address);
    setMakerData(makerStatus);

    const hasSignerKey = (makerStatus?.signerPublicKey?.length ?? 0) === 64;

    if (!hasSignerKey) {
      setState('approved_sdk_pending');
      setLoading(false);
      return;
    }

    // STEP 3: Pool deployed?
    const poolStatus = await fetchPoolStatus(address);

    if (!poolStatus.poolDeployed) {
      setState('approved_pool_pending');
      setLoading(false);
      return;
    }

    // STEP 4: Inventory funded?
    const inventory = await checkVaultInventory(address, forceRefresh);
    setInventoryData(inventory);

    if (!inventory.hasFunds) {
      setState('approved_onchain_pending');
      setLoading(false);
      return;
    }

    setState('active');
    setLoading(false);
  }, [address, isConnected]);

  useEffect(() => {
    detect();
  }, [detect]);

  return { state, loading, applicationData, inventoryData, makerData, refetch: detect };
}
