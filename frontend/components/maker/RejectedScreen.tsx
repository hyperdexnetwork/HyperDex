'use client';

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { USDC_CONTRACT, EURC_CONTRACT } from '@/lib/constants';
import type { ApplicationData } from '@/hooks/useMakerState';
import { networkHeaders } from '@/lib/networkHeader';

interface Props {
  application: ApplicationData | null;
  onReapply: () => void;
}

export default function RejectedScreen({ application, onReapply }: Props) {
  const { address } = useWallet();
  const [form, setForm] = useState({
    name: application?.name ?? '',
    contactEmail: '',
    contactTelegram: '',
  });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleReapply() {
    if (!form.name.trim() || form.name.trim().length < 2) { setError('Display name is required (min 2 characters)'); return; }
    if (!form.contactEmail.trim() && !form.contactTelegram.trim()) { setError('At least one contact method is required'); return; }
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) { setError('Invalid email format'); return; }

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
        if (res.status === 409) { onReapply(); return; }
        setError(data.error || 'Failed to submit application');
        return;
      }
      onReapply();
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-white rounded-2xl border border-red-200 shadow-sm p-8 space-y-5">

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0 text-lg font-bold text-red-500">
            ✗
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-ink mb-1">Application Not Approved</h1>
            <p className="text-sm text-ink-muted leading-relaxed">
              Your application was reviewed and not approved at this time.
            </p>
          </div>
        </div>

        {application?.name && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs text-ink-muted">
              Application for: <span className="font-semibold text-ink">{application.name}</span>
            </p>
            <p className="text-xs text-red-600 font-semibold">Status: Rejected</p>
          </div>
        )}

        <p className="text-sm text-ink-muted leading-relaxed">
          You may reapply with updated contact information or a different display name.
          Your previous application will remain on record.
        </p>

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-3.5 font-display text-sm font-bold bg-navy text-white rounded-xl hover:bg-navy-light transition-colors"
          >
            Reapply
          </button>
        ) : (
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

            <Field label="Telegram Handle">
              <input
                type="text"
                placeholder="@yourhandle"
                value={form.contactTelegram}
                onChange={e => setForm(f => ({ ...f, contactTelegram: e.target.value }))}
                className="w-full bg-cream border border-black/10 px-4 py-3 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 rounded-xl transition-colors"
              />
              <p className="text-xs text-ink-muted mt-1.5">At least one contact method required.</p>
            </Field>

            {error && (
              <div className="p-3 border border-red-200 bg-red-50 rounded-xl">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowForm(false); setError(null); }}
                className="px-5 py-3 font-display text-sm font-semibold border border-black/12 text-ink-muted rounded-xl hover:text-ink hover:border-black/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReapply}
                disabled={loading}
                className="flex-1 py-3 font-display text-sm font-bold bg-navy text-white rounded-xl hover:bg-navy-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {loading ? 'Submitting…' : 'Submit New Application'}
              </button>
            </div>
          </div>
        )}
      </div>
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
