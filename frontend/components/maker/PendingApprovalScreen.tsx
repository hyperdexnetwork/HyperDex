'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import type { ApplicationData } from '@/hooks/useMakerState';
import { networkHeaders } from '@/lib/networkHeader';

interface Props {
  application: ApplicationData | null;
  onStatusChange: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function PendingApprovalScreen({ application, onStatusChange }: Props) {
  const { address } = useWallet();
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!address) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/maker-application/${address}`, { headers: networkHeaders() });
        const data = await res.json();
        if (data.status === 'approved' || data.status === 'registered') onStatusChange();
      } catch {}
    }, 60_000);
    return () => clearInterval(t);
  }, [address, onStatusChange]);

  return (
    <div className="bg-white rounded-2xl border border-black/8 shadow-sm p-8 space-y-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 text-xl">
          ⏳
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-ink mb-1">Application Under Review</h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            Your application has been submitted. The HyperDEX admin will review it and contact you via your provided details.
          </p>
        </div>
      </div>

      {/* Application details */}
      {application && (
        <div className="border-t border-black/8 pt-5 space-y-2.5">
          <InfoRow label="Name"    value={application.name} />
          {address && (
            <InfoRow label="Address" value={`${address.slice(0, 6)}…${address.slice(-6)}`} mono />
          )}
          {application.submittedAt && (
            <InfoRow label="Applied" value={timeAgo(application.submittedAt)} />
          )}
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Status</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Pending Review
            </span>
          </div>
        </div>
      )}

      {/* Next steps */}
      <div className="bg-cream rounded-xl border border-black/8 p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">What happens next</p>
        {[
          'Admin reviews your application',
          'You receive an API key via email/Telegram',
          'Run: npm run setup (enter your API key)',
          'Return here to complete registration',
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-sm text-ink-muted">{step}</span>
          </div>
        ))}
      </div>

      {/* Refresh */}
      <div className="flex items-center justify-between border-t border-black/8 pt-5">
        <button
          onClick={() => { setPolling(true); onStatusChange(); setTimeout(() => setPolling(false), 1000); }}
          className="font-display text-sm font-semibold border border-black/12 text-ink-muted px-5 py-2.5 rounded-xl hover:text-ink hover:border-black/20 transition-colors"
        >
          {polling ? 'Checking…' : 'Refresh Status'}
        </button>
        <p className="text-xs text-ink-muted">Auto-refreshes every 60s</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{label}</span>
      <span className={`text-xs font-semibold text-ink ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
