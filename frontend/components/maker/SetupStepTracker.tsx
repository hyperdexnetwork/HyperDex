'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MakerState, MakerStatusData } from '@/hooks/useMakerState';
import { useWallet } from '@/hooks/useWallet';
import {
  signWithWallet,
  submitAndWait,
  humanToStroops,
  stroopsToHuman,
} from '@/lib/stellar';
import { buildDeployPoolTx } from '@/lib/stellar/pool-factory';
import { buildDepositTx } from '@/lib/stellar/maker-pool';
import { BACKEND_URL, USDC_CONTRACT, EURC_CONTRACT, EXPLORER_BASE } from '@/lib/constants';

interface Props {
  state: MakerState;
  application: { name?: string } | null;
  makerData: MakerStatusData | null;
  onStepComplete: (forceRefresh?: boolean) => void;
}

type StepStatus = 'complete' | 'active' | 'locked';
type DeployState = 'idle' | 'building' | 'awaiting_signature' | 'submitting' | 'confirming' | 'success' | 'error';

function StepIndicator({ num, status, total, children }: {
  num: number; status: StepStatus; total: number; children: React.ReactNode;
}) {
  return (
    <div className={`flex gap-4 pb-6 ${status === 'locked' ? 'opacity-40' : ''}`}>
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold border-2 transition-all ${
          status === 'complete' ? 'border-green-500 bg-green-50 text-green-600' :
          status === 'active'   ? 'border-navy bg-lavender text-navy' :
                                  'border-black/15 text-ink-muted'
        }`}>
          {status === 'complete' ? '✓' : num}
        </div>
        {num < total && <div className="w-px flex-1 mt-2 bg-black/10 min-h-[24px]" />}
      </div>
      <div className="flex-1 pt-1 pb-2">{children}</div>
    </div>
  );
}

function parseDepositError(raw: string, token: string): string {
  if (raw.includes('#10') || raw.includes('not within the allowed range') || raw.includes('InsufficientBalance'))
    return `Insufficient ${token} balance in your wallet. Fund your wallet with ${token} on Stellar mainnet.`;
  if (raw.includes('#13') || raw.includes('trustline entry is missing'))
    return `${token} trustline not set up. Add a ${token} trustline in your Stellar wallet first, then fund it with ${token}.`;
  if (raw.includes('Transaction failed on-chain') || raw.includes('TX failed'))
    return `${token} deposit failed on-chain. Ensure your wallet has sufficient ${token} balance`;
  return raw;
}

export default function SetupStepTracker({ state, application, makerData, onStepComplete }: Props) {
  const { address } = useWallet();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const step2Done = state !== 'approved_sdk_pending';
  const step3Done = state === 'approved_onchain_pending' || state === 'active';
  const step4Done = state === 'active';

  // Step 3: Pool deployment
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedPoolAddress, setDeployedPoolAddress] = useState<string | null>(null);
  const signerPublicKey = makerData?.signerPublicKey ?? '';

  const handleDeployPool = async () => {
    if (!address || !signerPublicKey) return;
    setDeployState('building');
    setDeployError(null);
    try {
      const xdr = await buildDeployPoolTx(address, signerPublicKey);
      setDeployState('awaiting_signature');
      const signed = await signWithWallet(xdr);
      setDeployState('submitting');
      const hash = await submitAndWait(signed);
      setDeployState('success');
      showToast('Pool contract deployed!', 'success');
      try {
        const res = await fetch(`${BACKEND_URL}/api/makers/${address}/pool?refresh=true`);
        const data = await res.json();
        setDeployedPoolAddress(data.poolAddress ?? null);
      } catch {}
      setTimeout(() => onStepComplete(true), 3000);
      void hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Pool deployment failed';
      try {
        const res = await fetch(`${BACKEND_URL}/api/makers/${address}/pool?refresh=true`);
        const data = await res.json();
        if (data.poolDeployed && data.poolAddress) {
          setDeployedPoolAddress(data.poolAddress);
          setDeployState('success');
          showToast('Pool deployed successfully!', 'success');
          setTimeout(onStepComplete, 2000);
          return;
        }
      } catch {}
      setDeployState('error');
      setDeployError(msg);
      showToast(msg, 'error');
    }
  };

  // Step 4: Deposit inventory
  const [usdcAmount, setUsdcAmount] = useState('');
  const [eurcAmount, setEurcAmount] = useState('');
  const [depositingUsdc, setDepositingUsdc] = useState(false);
  const [depositingEurc, setDepositingEurc] = useState(false);
  const [vaultBalances, setVaultBalances] = useState<{ usdc: string; eurc: string } | null>(null);
  const [walletBalances, setWalletBalances] = useState<{ usdc: string; eurc: string } | null>(null);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);

  const loadInventory = useCallback(async (forceRefresh = false) => {
    if (!address) return;
    try {
      const url = forceRefresh
        ? `${BACKEND_URL}/api/makers/${address}/inventory?refresh=true`
        : `${BACKEND_URL}/api/makers/${address}/inventory`;
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        setVaultBalances(d.vault);
        setWalletBalances(d.wallet);
        setPoolAddress(d.poolAddress ?? null);
      }
    } catch {}
  }, [address]);

  useEffect(() => {
    if (step3Done) loadInventory();
  }, [step3Done, loadInventory]);

  const handleDeposit = async (token: 'usdc' | 'eurc') => {
    if (!address || !poolAddress) return;
    const amount = token === 'usdc' ? usdcAmount : eurcAmount;
    const tokenAddr = token === 'usdc' ? USDC_CONTRACT : EURC_CONTRACT;
    const setter = token === 'usdc' ? setDepositingUsdc : setDepositingEurc;
    const tokenUpper = token.toUpperCase();
    let stroops: bigint;
    try { stroops = humanToStroops(amount); } catch { showToast('Invalid amount', 'error'); return; }
    if (stroops <= 0n) { showToast('Amount must be > 0', 'error'); return; }
    const walletRaw = walletBalances?.[token] ?? '0';
    const walletStroops = BigInt(walletRaw);
    if (walletStroops < stroops) {
      showToast(`Insufficient ${tokenUpper}: wallet has ${stroopsToHuman(walletRaw)}, need ${amount}. Fund your wallet with ${tokenUpper} on Stellar mainnet.`, 'error');
      return;
    }
    setter(true);
    try {
      const depositXdr = await buildDepositTx(address, poolAddress, tokenAddr, stroops);
      showToast('Sign deposit transaction in Freighter...', 'info');
      const signedDeposit = await signWithWallet(depositXdr);
      await submitAndWait(signedDeposit);
      showToast(`Deposited ${amount} ${tokenUpper} to your pool`, 'success');
      if (token === 'usdc') setUsdcAmount(''); else setEurcAmount('');
      setTimeout(() => { loadInventory(true); onStepComplete(true); }, 3000);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      showToast(parseDepositError(raw, tokenUpper), 'error');
    } finally {
      setter(false);
    }
  };

  const deployButtonLabel = () => {
    switch (deployState) {
      case 'building':           return 'Building transaction…';
      case 'awaiting_signature': return 'Approve in Freighter…';
      case 'submitting':         return 'Submitting to Stellar…';
      case 'confirming':         return 'Confirming…';
      case 'success':            return '✓ Pool Deployed';
      case 'error':              return 'Retry';
      default:                   return 'Deploy Pool Contract';
    }
  };

  const isDeploying = ['building', 'awaiting_signature', 'submitting', 'confirming'].includes(deployState);

  return (
    <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-6 space-y-1">

      {/* Toast */}
      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm border ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
          toast.type === 'error'   ? 'bg-red-50 border-red-200 text-red-600' :
                                     'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          {toast.message}
        </div>
      )}

      <h2 className="font-display text-xl font-bold text-ink mb-6">Setup Progress</h2>

      {/* Step 1 */}
      <StepIndicator num={1} status="complete" total={5}>
        <h3 className="font-display font-bold text-green-600 mb-1">Application Approved</h3>
        <p className="text-xs text-ink-muted">
          Admin has approved your maker account{application?.name ? ` for ${application.name}` : ''}.
        </p>
      </StepIndicator>

      {/* Step 2 */}
      <StepIndicator num={2} status={step2Done ? 'complete' : 'active'} total={5}>
        <h3 className={`font-display font-bold mb-1 ${step2Done ? 'text-green-600' : 'text-ink'}`}>SDK Setup</h3>
        {step2Done ? (
          <p className="text-xs text-ink-muted">Signing keypair generated and registered with HyperDEX.</p>
        ) : (
          <>
            <p className="text-xs text-ink-muted mb-3">Run in your terminal:</p>
            <div className="flex items-center gap-2 bg-cream border border-black/10 px-3 py-2.5 rounded-xl mb-3">
              <code className="font-mono text-sm text-navy flex-1">npm run setup</code>
              <button
                onClick={() => navigator.clipboard.writeText('npm run setup')}
                className="text-xs font-semibold text-ink-muted hover:text-ink transition-colors border border-black/10 px-2 py-1 rounded-lg"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-ink-muted mb-1">
              Enter your API key when prompted. The wizard generates your signing keypair and registers it automatically with HyperDEX.
            </p>
            <p className="text-xs text-ink-muted/60 mt-2">When complete, refresh this page.</p>
          </>
        )}
      </StepIndicator>

      {/* Step 3 */}
      <StepIndicator num={3} status={step3Done ? 'complete' : step2Done ? 'active' : 'locked'} total={5}>
        <h3 className={`font-display font-bold mb-1 ${step3Done ? 'text-green-600' : 'text-ink'}`}>Deploy Your Pool Contract</h3>
        {step3Done ? (
          <>
            <p className="text-xs text-ink-muted">Pool contract deployed on Stellar Mainnet.</p>
            {(deployedPoolAddress || poolAddress) && (() => {
              const addr = deployedPoolAddress || poolAddress!;
              return (
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-xs text-navy">{addr.slice(0, 8)}…{addr.slice(-6)}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(addr)}
                    className="text-xs font-semibold text-ink-muted border border-black/10 px-2 py-0.5 rounded-lg hover:text-ink transition-colors"
                  >
                    Copy
                  </button>
                  <a
                    href={`${EXPLORER_BASE}/contract/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-navy hover:underline"
                  >
                    Explorer ↗
                  </a>
                </div>
              );
            })()}
          </>
        ) : step2Done ? (
          <>
            <p className="text-xs text-ink-muted mb-3">
              This deploys a dedicated smart contract that holds your inventory on Stellar Mainnet.
            </p>
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">Signer Public Key (auto-filled)</p>
              <div className="flex items-center gap-2 bg-cream border border-black/10 px-3 py-2.5 rounded-xl">
                <code className="font-mono text-xs text-navy flex-1 truncate">
                  {signerPublicKey || 'Not available — run npm run setup first'}
                </code>
              </div>
            </div>
            {deployError && (
              <p className="text-xs text-red-600 mb-2">{deployError}</p>
            )}
            <button
              onClick={handleDeployPool}
              disabled={!signerPublicKey || isDeploying || deployState === 'success'}
              className={`w-full py-3 font-display text-sm font-bold rounded-xl border transition-all flex items-center justify-center gap-2 ${
                deployState === 'success'
                  ? 'border-green-300 bg-green-50 text-green-600 cursor-default'
                  : signerPublicKey && !isDeploying
                  ? 'bg-navy text-white border-navy hover:bg-navy-light'
                  : 'border-black/10 text-ink-muted cursor-not-allowed'
              }`}
            >
              {isDeploying && <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" />}
              {deployButtonLabel()}
            </button>
          </>
        ) : (
          <p className="text-xs text-ink-muted">Complete Step 2 first</p>
        )}
      </StepIndicator>

      {/* Step 4 */}
      <StepIndicator num={4} status={step4Done ? 'complete' : step3Done ? 'active' : 'locked'} total={5}>
        <h3 className={`font-display font-bold mb-1 ${step4Done ? 'text-green-600' : 'text-ink'}`}>Deposit Inventory</h3>
        {step4Done ? (
          <p className="text-xs text-ink-muted">Pool funded. You are ready to start the SDK.</p>
        ) : step3Done ? (
          <>
            <p className="text-xs text-ink-muted mb-4">
              Deposit USDC and/or EURC directly to your pool contract. Single transaction per token.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {(['usdc', 'eurc'] as const).map(tok => {
                const amount     = tok === 'usdc' ? usdcAmount : eurcAmount;
                const setAmount  = tok === 'usdc' ? setUsdcAmount : setEurcAmount;
                const depositing = tok === 'usdc' ? depositingUsdc : depositingEurc;
                const vault      = vaultBalances?.[tok] ?? '0';
                const wallet     = walletBalances?.[tok] ?? '0';

                return (
                  <div key={tok} className="bg-cream border border-black/10 rounded-xl p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{tok.toUpperCase()}</p>
                    <div className="space-y-0.5">
                      <p className="text-xs text-ink-muted">Wallet: {stroopsToHuman(wallet)}</p>
                      <p className="text-xs text-ink-muted">Pool: {stroopsToHuman(vault)}</p>
                    </div>
                    <input
                      type="number" min="0" step="any" placeholder="Amount"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full bg-white border border-black/10 px-3 py-2 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 rounded-lg transition-colors"
                    />
                    <button
                      onClick={() => handleDeposit(tok)}
                      disabled={depositing || !amount || !poolAddress}
                      className={`w-full py-2 font-display text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                        !depositing && amount && poolAddress
                          ? 'bg-navy text-white hover:bg-navy-light'
                          : 'bg-black/5 text-ink-muted cursor-not-allowed'
                      }`}
                    >
                      {depositing && <span className="w-2.5 h-2.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                      {depositing ? '…' : 'Deposit'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-xs text-ink-muted">Complete Step 3 first</p>
        )}
      </StepIndicator>

      {/* Step 5 */}
      <StepIndicator num={5} status={step4Done ? 'active' : 'locked'} total={5}>
        <h3 className="font-display font-bold text-ink mb-1">Start SDK</h3>
        {step4Done ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-green-700">✓ Setup Complete — You are ready to trade!</p>
            <p className="text-xs text-ink-muted">Start your maker server:</p>
            <div className="flex items-center gap-2 bg-white border border-black/10 px-3 py-2.5 rounded-lg">
              <code className="font-mono text-sm text-navy flex-1">npm run dev</code>
              <button
                onClick={() => navigator.clipboard.writeText('npm run dev')}
                className="text-xs font-semibold text-ink-muted border border-black/10 px-2 py-1 rounded-lg hover:text-ink transition-colors"
              >
                Copy
              </button>
            </div>
            <ul className="text-xs text-ink-muted space-y-1">
              <li>• Connects to HyperDEX via WebSocket</li>
              <li>• Streams USDC↔EURC price levels (buy+sell)</li>
              <li>• Responds to RFQ requests within 750ms</li>
              <li>• Receives trade confirmations automatically</li>
            </ul>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">Complete Step 4 first</p>
        )}
      </StepIndicator>
    </div>
  );
}
