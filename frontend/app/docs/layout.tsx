'use client';

import { useState } from 'react';
import DocsNavbar from '@/components/docs/DocsNavbar';
import DocsSidebar from '@/components/docs/DocsSidebar';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream">
      <DocsNavbar />

      <div className="max-w-[1440px] mx-auto flex relative">
        {/* Desktop sidebar.
            `self-start` is load-bearing: as a flex child this would otherwise
            stretch to the row's full height, leaving position:sticky nothing to
            travel within — so the nav would scroll away with the content. It
            sticks below the 3.5rem navbar, plus the network banner when shown,
            and scrolls internally when the nav is taller than the viewport. */}
        <div
          className="docs-sidebar-scroll hidden lg:block border-r border-black/6 self-start sticky
                     top-[calc(3.5rem+var(--net-banner-h,0px))]
                     h-[calc(100vh-3.5rem-var(--net-banner-h,0px))]
                     overflow-y-auto overscroll-contain"
        >
          <DocsSidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="lg:hidden fixed top-14 left-0 bottom-0 w-[280px] bg-cream z-50 overflow-y-auto border-r border-black/10 shadow-xl">
              <DocsSidebar mobile onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        {/* Mobile sidebar toggle */}
        <button
          className="lg:hidden fixed bottom-6 left-6 z-30 bg-ink text-white rounded-full w-12 h-12 flex items-center justify-center shadow-xl hover:bg-navy-light transition-colors"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? (
              <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            ) : (
              <><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></>
            )}
          </svg>
        </button>

        {/* Main content area */}
        {children}
      </div>
    </div>
  );
}
