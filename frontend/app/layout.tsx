import type { Metadata } from 'next';
import { DM_Sans, Space_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import WalletProviders from '@/components/wallet/WalletProviders';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-dm-sans',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
});

// Used only for italic accent words in display headings.
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
});

const SITE_DESCRIPTION = 'Sealed-bid RFQ for USDC and EURC on Stellar Testnet: firm quotes from competing makers, settled atomically on Soroban.';

export const metadata: Metadata = {
  metadataBase: new URL('https://hyperdex.live'),
  title: 'HyperDex | Trade Without Limits',
  description: SITE_DESCRIPTION,
  openGraph: {
    title: 'HyperDex | Trade Without Limits',
    description: SITE_DESCRIPTION,
    url: 'https://hyperdex.live',
    siteName: 'HyperDex',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HyperDex | Trade Without Limits',
    description: SITE_DESCRIPTION,
    site: '@hyperdex_live',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${spaceMono.variable} ${playfair.variable} font-display bg-cream text-ink`}>
        {/* Without JS the scroll-reveal never fires; show the content anyway. */}
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <WalletProviders />
        {children}
      </body>
    </html>
  );
}
