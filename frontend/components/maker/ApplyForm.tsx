'use client';

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { USDC_CONTRACT, EURC_CONTRACT } from '@/lib/constants';
import { networkHeaders } from '@/lib/networkHeader';

interface ApplyFormProps {
  onSuccess: () => void;
}

export default function ApplyForm({ onSuccess }: ApplyFormProps) {
  const { address } = useWallet();
  const [form, setForm] = useState({ name: '', contactEmail: '', contactTelegram: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!form.name.trim() || form.name.trim().length < 2) return 'Display name is required (min 2 characters)';
    if (!form.contactEmail.trim() && !form.contactTelegram.trim()) return 'At least one contact method is required';
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) return 'Invalid email format';
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/maker-application', {
        method: 'POST',
        headers: networkHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          stellarAddress: address,
          name: form.name.trim(),
          contactEmail: form.contactEmail.trim() || undefined,
          contactTelegram: form.contactTelegram.trim() || undefined,
          requestedPairs: [
            { tokenIn: USDC_CONTRACT, tokenOut: EURC_CONTRACT },
            { tokenIn: EURC_CONTRACT, tokenOut: USDC_CONTRACT },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) { onSuccess(); return; }
        setError(data.error || 'Failed to submit application');
        return;
      }
      onSuccess();
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-8 space-y-6">

      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted mb-1">Maker Programme</p>
        <h2 className="font-display text-2xl font-bold text-ink">Become a HyperDEX Market Maker</h2>
        <p className="text-sm text-ink-muted mt-1">Earn fees by providing USDC↔EURC liquidity</p>
      </div>

      <div className="border-t border-black/8" />

      <div className="space-y-4">
        <Field label="Display Name *">
          <input
            type="text"
            placeholder="e.g. AlphaFirm"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-cream border border-black/10 px-4 py-3 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 rounded-xl transition-colors"
            maxLength={50}
          />
        </Field>

        <Field label="Contact Email">
          <input
            type="email"
            placeholder="maker@email.com"
            value={form.contactEmail}
            onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
            className="w-full bg-cream border border-black/10 px-4 py-3 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 rounded-xl transition-colors"
          />
        </Field>

        <div className="text-center text-xs text-ink-muted">or</div>

        <Field label="Telegram Handle">
          <input
            type="text"
            placeholder="@handle"
            value={form.contactTelegram}
            onChange={e => setForm(f => ({ ...f, contactTelegram: e.target.value }))}
            className="w-full bg-cream border border-black/10 px-4 py-3 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 rounded-xl transition-colors"
          />
          <p className="text-xs text-ink-muted mt-1.5">At least one contact method required</p>
        </Field>

        <Field label="Supported Pairs">
          <div className="flex gap-4">
            {['USDC → EURC', 'EURC → USDC'].map(pair => (
              <label key={pair} className="flex items-center gap-2 text-sm text-ink cursor-not-allowed">
                <input type="checkbox" checked readOnly className="accent-navy" />
                {pair}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Your Stellar Address">
          <div className="w-full bg-cream border border-black/10 px-4 py-3 font-mono text-sm text-ink-muted rounded-xl break-all">
            {address}
          </div>
          <p className="text-xs text-ink-muted mt-1.5">Read-only — from connected Freighter wallet</p>
        </Field>
      </div>

      <div className="border-t border-black/8" />

      {error && (
        <div className="p-3 border border-red-200 bg-red-50 rounded-xl">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3.5 font-display text-sm font-bold bg-navy text-white rounded-xl hover:bg-navy-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
        {loading ? 'Submitting…' : 'Submit Application'}
      </button>

      <p className="text-xs text-ink-muted text-center">
        By applying you agree to the HyperDEX market maker terms.<br />
        Admin will review your application and contact you.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">{label}</p>
      {children}
    </div>
  );
}
