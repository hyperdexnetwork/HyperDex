'use client';

import { useCallback, useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import { BACKEND_URL, EXPLORER_BASE } from '@/lib/constants';
import { adminFetch } from '@/lib/adminAuth';
import AdminKeyGate from '@/components/admin/AdminKeyGate';
import type { ToastState } from '@/lib/types';

interface PendingApplication {
  _id: string;
  stellarAddress: string;
  name: string;
  contactEmail?: string;
  contactTelegram?: string;
  requestedPairs: { tokenIn: string; tokenOut: string }[];
  status: 'pending' | 'approved' | 'rejected' | 'registered';
  submittedAt: string;
  reviewedAt?: string;
  onChainRegistered: boolean;
  adminNotes?: string;
  apiKeyGeneratedAt?: string;
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

const STATUS_DOT: Record<string, string> = {
  pending:    '#f59e0b',
  approved:   '#3b82f6',
  rejected:   '#ef4444',
  registered: '#10b981',
};

const STATUS_PILL: Record<string, string> = {
  pending:    'bg-amber-50  text-amber-700  border-amber-200',
  approved:   'bg-blue-50   text-blue-700   border-blue-200',
  rejected:   'bg-red-50    text-red-600    border-red-200',
  registered: 'bg-green-50  text-green-700  border-green-200',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminPendingPage() {
  const [applications, setApplications] = useState<PendingApplication[]>([]);
  const [filter, setFilter]             = useState<FilterTab>('all');
  const [selected, setSelected]         = useState<PendingApplication | null>(null);
  const [toast, setToast]               = useState<ToastState | null>(null);
  const [loading, setLoading]           = useState(true);
  const [approveModal, setApproveModal] = useState(false);
  const [approving, setApproving]       = useState(false);
  const [approvedKey, setApprovedKey]   = useState<string | null>(null);
  const [approvedApp, setApprovedApp]   = useState<PendingApplication | null>(null);
  const [rejectMode, setRejectMode]     = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting]       = useState(false);
  const [copied, setCopied]             = useState(false);
  const [rotateLoading, setRotateLoading]   = useState(false);

  const showToast = (message: string, type: ToastState['type']) =>
    setToast({ message, type });

  const load = useCallback(async () => {
    try {
      const res  = await adminFetch(`${BACKEND_URL}/api/admin/pending`);
      const data = await res.json();
      setApplications(data.applications ?? []);
    } catch {
      showToast('Failed to load applications', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (selected) {
      const fresh = applications.find(a => a._id === selected._id);
      if (fresh) setSelected(fresh);
    }
  }, [applications]);

  const filtered     = applications.filter(a => filter === 'all' || a.status === filter);
  const pendingCount = applications.filter(a => a.status === 'pending').length;

  const handleApprove = async () => {
    if (!selected) return;
    setApproving(true);
    try {
      const res  = await adminFetch(`${BACKEND_URL}/api/admin/pending/${selected._id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApprovedKey(data.apiKey);
      setApprovedApp({ ...selected, status: 'approved', apiKeyGeneratedAt: new Date().toISOString() });
      setApproveModal(false);
      await load();
      showToast('Maker approved! Copy and send the API key.', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Approval failed', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setRejecting(true);
    try {
      const res = await adminFetch(`${BACKEND_URL}/api/admin/pending/${selected._id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) throw new Error('Rejection failed');
      setRejectMode(false);
      setRejectReason('');
      await load();
      setSelected(null);
      showToast('Application rejected', 'info');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Rejection failed', 'error');
    } finally {
      setRejecting(false);
    }
  };

  const handleRotateKey = async () => {
    if (!selected) return;
    setRotateLoading(true);
    try {
      const res  = await adminFetch(`${BACKEND_URL}/api/admin/pending/${selected._id}/rotate-key`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApprovedKey(data.apiKey);
      setApprovedApp({ ...selected, apiKeyGeneratedAt: new Date().toISOString() });
      await load();
      showToast('New API key generated', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Key rotation failed', 'error');
    } finally {
      setRotateLoading(false);
    }
  };

  const copyKey = () => {
    if (!approvedKey) return;
    navigator.clipboard.writeText(approvedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mailtoLink = (app: PendingApplication, key: string) => {
    const subject = encodeURIComponent('HyperDEX Maker API Key');
    const body    = encodeURIComponent(
      `Your API key: ${key}\n\nNext steps:\n1. npm run setup\n2. Visit localhost:3000/maker\n3. npm run dev <makername>`
    );
    return `mailto:${app.contactEmail ?? ''}?subject=${subject}&body=${body}`;
  };

  return (
    <AdminKeyGate>
      <Navbar />
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* ── Approve modal ─────────────────────────────────────────── */}
      {approveModal && selected && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl border border-black/10 shadow-2xl p-7 max-w-md w-full space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-ink">
                Approve {selected.name}?
              </h2>
              <p className="text-ink-muted text-sm mt-1">This will create their maker account and generate an API key.</p>
            </div>
            <ul className="text-sm text-ink-muted space-y-1 border-t border-black/8 pt-4">
              <li>• Creates maker account in the system</li>
              <li>• Generates a 24-hour API key</li>
            </ul>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              You will need to send the API key to the maker via email manually.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setApproveModal(false)}
                className="flex-1 py-3 font-display text-sm font-semibold border border-black/12 text-ink-muted rounded-xl hover:text-ink hover:border-black/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex-1 py-3 font-display text-sm font-bold bg-navy text-white rounded-xl hover:bg-navy-light transition-colors disabled:opacity-50"
              >
                {approving ? 'Approving…' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ──────────────────────────────────────────────────── */}
      <main className="min-h-screen bg-cream pb-16" style={{ paddingTop: '80px' }}>
        <div className="max-w-6xl mx-auto px-6 md:px-10">

          {/* Page header */}
          <div className="pt-10 pb-7 flex items-end justify-between border-b border-black/8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted mb-1">Admin</p>
              <h1 className="font-display text-3xl font-bold text-ink leading-none">
                Pending Applications
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {pendingCount > 0 && (
                <span className="text-xs font-semibold bg-red-500 text-white px-3 py-1 rounded-full">
                  {pendingCount} pending
                </span>
              )}
              <button
                onClick={load}
                className="text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
              >
                ↺ Refresh
              </button>
            </div>
          </div>

          {/* Two-panel */}
          <div className="flex gap-5 pt-7" style={{ height: 'calc(100vh - 210px)' }}>

            {/* ── LEFT PANEL ── */}
            <div className="w-[38%] flex flex-col bg-white rounded-2xl border border-black/8 overflow-hidden shadow-sm">

              {/* Filter tabs */}
              <div className="flex border-b border-black/8">
                {(['all', 'pending', 'approved', 'rejected'] as FilterTab[]).map(tab => {
                  const count = tab === 'all'
                    ? applications.length
                    : applications.filter(a => a.status === tab).length;
                  return (
                    <button
                      key={tab}
                      onClick={() => setFilter(tab)}
                      className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                        filter === tab
                          ? 'text-ink border-b-2 border-ink bg-black/2'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {tab}
                      {count > 0 && (
                        <span className="ml-1 opacity-50">({count})</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-6 flex items-center gap-2 text-ink-muted text-sm">
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Loading…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm text-ink-muted">No applications</p>
                  </div>
                ) : (
                  filtered.map(app => (
                    <button
                      key={app._id}
                      onClick={() => {
                        setSelected(app);
                        setApprovedKey(null);
                        setApprovedApp(null);
                        setRejectMode(false);
                      }}
                      className={`w-full text-left px-5 py-4 border-b border-black/5 transition-colors ${
                        selected?._id === app._id
                          ? 'bg-lavender/30 border-l-2 border-l-lavender-deep'
                          : 'hover:bg-black/2'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: STATUS_DOT[app.status] }}
                          />
                          <span className="font-display font-bold text-ink text-sm">{app.name}</span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_PILL[app.status] ?? ''}`}>
                          {app.status}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-ink-muted">
                        {app.stellarAddress.slice(0, 6)}…{app.stellarAddress.slice(-6)}
                      </p>
                      {(app.contactTelegram || app.contactEmail) && (
                        <p className="text-xs text-ink-muted/60 mt-0.5">
                          {app.contactTelegram ?? app.contactEmail}
                        </p>
                      )}
                      <p className="text-xs text-ink-muted/40 mt-1">Applied {timeAgo(app.submittedAt)}</p>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className="flex-1 bg-white rounded-2xl border border-black/8 overflow-y-auto shadow-sm">
              {approvedKey && approvedApp ? (
                <ApiKeyRevealPanel
                  app={approvedApp}
                  apiKey={approvedKey}
                  copied={copied}
                  onCopy={copyKey}
                  mailtoLink={mailtoLink(approvedApp, approvedKey)}
                />
              ) : !selected ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-ink-muted">Select an application to review</p>
                </div>
              ) : (
                <ApplicationDetail
                  app={selected}
                  onApprove={() => setApproveModal(true)}
                  onRejectToggle={() => setRejectMode(r => !r)}
                  rejectMode={rejectMode}
                  rejectReason={rejectReason}
                  setRejectReason={setRejectReason}
                  onConfirmReject={handleReject}
                  rejecting={rejecting}
                  onRotateKey={handleRotateKey}
                  rotateLoading={rotateLoading}
                  BACKEND_URL={BACKEND_URL}
                />
              )}
            </div>

          </div>
        </div>
      </main>
    </AdminKeyGate>
  );
}

/* ── ApplicationDetail ──────────────────────────────────────────── */

function ApplicationDetail({
  app, onApprove, onRejectToggle, rejectMode, rejectReason, setRejectReason,
  onConfirmReject, rejecting, onRotateKey, rotateLoading, BACKEND_URL,
}: {
  app: PendingApplication;
  onApprove: () => void;
  onRejectToggle: () => void;
  rejectMode: boolean;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  onConfirmReject: () => void;
  rejecting: boolean;
  onRotateKey: () => void;
  rotateLoading: boolean;
  BACKEND_URL: string;
}) {
  const [notesSaved, setNotesSaved] = useState(false);
  const [notes, setNotes]           = useState(app.adminNotes ?? '');

  const saveNotes = async () => {
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  };

  return (
    <div className="p-7 space-y-6">

      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">{app.name}</h2>
        <p className="text-xs text-ink-muted mt-1">
          Applied {timeAgo(app.submittedAt)}
          {app.status !== 'pending' && app.reviewedAt && (
            <> · Reviewed {timeAgo(app.reviewedAt)}</>
          )}
        </p>
      </div>

      <div className="border-t border-black/8 pt-5 space-y-5">

        {/* Stellar address */}
        <div>
          <Label>Stellar Address</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="font-mono text-xs text-ink flex-1 break-all bg-cream rounded-lg px-3 py-2 border border-black/8">
              {app.stellarAddress}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(app.stellarAddress)}
              className="shrink-0 text-xs font-semibold text-ink-muted border border-black/12 px-3 py-1.5 rounded-lg hover:text-ink hover:border-black/20 transition-colors"
            >
              Copy
            </button>
            <a
              href={`${EXPLORER_BASE}/account/${app.stellarAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-semibold text-navy hover:underline"
            >
              Explorer ↗
            </a>
          </div>
        </div>

        {/* Contact */}
        <div>
          <Label>Contact</Label>
          <div className="mt-1.5 space-y-1">
            {app.contactEmail    && <p className="text-sm text-ink">Email: <span className="font-mono">{app.contactEmail}</span></p>}
            {app.contactTelegram && <p className="text-sm text-ink">Telegram: <span className="font-mono">{app.contactTelegram}</span></p>}
            {!app.contactEmail && !app.contactTelegram && <p className="text-sm text-ink-muted">No contact provided</p>}
          </div>
        </div>

        {/* Requested pairs */}
        <div>
          <Label>Requested Pairs</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {app.requestedPairs.map((p, i) => (
              <span
                key={i}
                className="font-mono text-xs text-ink bg-lavender/40 border border-lavender-mid px-3 py-1 rounded-full"
              >
                {p.tokenIn.slice(0, 4)}… → {p.tokenOut.slice(0, 4)}…
              </span>
            ))}
          </div>
        </div>

        {/* Admin notes */}
        <div>
          <Label>
            Admin Notes
            {notesSaved && <span className="text-green-600 ml-2 font-normal normal-case tracking-normal">(saved)</span>}
          </Label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={3}
            placeholder="Internal notes…"
            className="w-full mt-1.5 bg-cream border border-black/10 px-3 py-2 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-black/20 resize-none rounded-xl"
          />
        </div>
      </div>

      {/* Approved key section.
          Keys are shown once at approval and never stored — the backend keeps
          only a bcrypt hash, so there is nothing to re-read. A lost key is
          replaced by rotating, which invalidates the old one. */}
      {app.status === 'approved' && (
        <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
          <Label className="text-blue-700">API Key</Label>
          {app.apiKeyGeneratedAt && (
            <p className="text-xs text-ink-muted">Issued {timeAgo(app.apiKeyGeneratedAt)}</p>
          )}
          <p className="text-xs text-ink-muted">
            Shown once when issued and not stored. If the maker lost it, generate a
            replacement — the previous key stops working immediately.
          </p>
          <button
            onClick={onRotateKey}
            disabled={rotateLoading}
            className="text-xs font-semibold text-ink border border-black/12 px-3 py-1.5 rounded-lg hover:border-black/20 transition-colors disabled:opacity-50"
          >
            {rotateLoading ? 'Generating…' : 'Generate New API Key'}
          </button>
          <p className="text-xs text-ink-muted pt-1">
            On-Chain: {app.onChainRegistered ? '✓ Registered' : '✗ Not yet'}
          </p>
        </div>
      )}

      {/* Actions — pending only */}
      {app.status === 'pending' && (
        <div className="border-t border-black/8 pt-5 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={onRejectToggle}
              className="px-5 py-3 font-display text-sm font-semibold border border-black/12 text-ink-muted rounded-xl hover:text-ink hover:border-black/20 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              className="flex-1 py-3 font-display text-sm font-bold bg-navy text-white rounded-xl hover:bg-navy-light transition-colors"
            >
              Approve Maker ✓
            </button>
          </div>

          {rejectMode && (
            <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-red-700">Reason for rejection (optional)</p>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                className="w-full bg-white border border-red-200 px-3 py-2 text-sm text-ink placeholder-ink-muted/40 outline-none focus:border-red-300 resize-none rounded-lg"
              />
              <div className="flex gap-3">
                <button
                  onClick={onRejectToggle}
                  className="px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirmReject}
                  disabled={rejecting}
                  className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {rejecting ? 'Rejecting…' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ApiKeyRevealPanel ──────────────────────────────────────────── */

function ApiKeyRevealPanel({
  app, apiKey, copied, onCopy, mailtoLink,
}: {
  app: PendingApplication;
  apiKey: string;
  copied: boolean;
  onCopy: () => void;
  mailtoLink: string;
}) {
  return (
    <div className="p-7 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-green-600 text-2xl">✓</span>
        <div>
          <h2 className="font-display text-xl font-bold text-ink">{app.name} Approved</h2>
          <p className="text-xs text-ink-muted mt-0.5">Send the API key to the maker now</p>
        </div>
      </div>

      <div className="border-t border-black/8" />

      {/* API Key box */}
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-5 space-y-3">
        <Label className="text-amber-800">API Key — Copy and Send to Maker</Label>
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-ink flex-1 break-all bg-white border border-amber-200 px-3 py-3 rounded-lg">
            {apiKey}
          </code>
          <button
            onClick={onCopy}
            className="shrink-0 text-xs font-semibold text-ink-muted border border-black/12 bg-white px-4 py-2 rounded-lg hover:text-ink hover:border-black/20 transition-colors min-w-[72px] text-center"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          This key is shown for 24 hours only. Send it to the maker via email now.
        </p>
      </div>

      {/* Steps */}
      <div className="border border-black/8 rounded-xl p-5 space-y-2.5">
        <Label>What the maker needs to do next</Label>
        <ol className="space-y-2 mt-2">
          {[
            ['Run:', 'npm run setup', '(enter this API key)'],
            ['Visit:', '/maker', '→ complete registration'],
            ['Run:', 'npm run dev <makername>', ''],
          ].map(([prefix, code, suffix], i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-ink">
              <span className="w-5 h-5 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-ink-muted">{prefix}</span>
              <code className="font-mono text-xs bg-lavender/50 text-navy px-2 py-0.5 rounded-md">{code}</code>
              {suffix && <span className="text-ink-muted text-xs">{suffix}</span>}
            </li>
          ))}
        </ol>
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between">
        {app.contactEmail ? (
          <a
            href={mailtoLink}
            className="text-sm font-semibold text-navy border border-navy/20 bg-white px-4 py-2 rounded-xl hover:bg-navy/5 transition-colors"
          >
            Send Email →
          </a>
        ) : app.contactTelegram ? (
          <p className="text-sm text-ink-muted">
            Telegram: <span className="text-ink font-mono">{app.contactTelegram}</span>
          </p>
        ) : <div />}

        <div className="text-right">
          <p className="text-xs font-semibold text-amber-700">
            Copy it now — shown once
          </p>
          <p className="text-xs text-ink-muted mt-1">
            Not stored. Rotate to issue a replacement.
          </p>
        </div>
      </div>

    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────── */

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[10px] font-bold uppercase tracking-widest text-ink-muted ${className}`}>
      {children}
    </p>
  );
}
