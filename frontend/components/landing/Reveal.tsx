'use client';

import { useEffect } from 'react';

/**
 * Adds `.active` to every `.reveal` element as it scrolls into view.
 * Renders nothing — it lets the landing page itself stay a Server Component.
 */
export default function Reveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('active'));
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('active');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
}
