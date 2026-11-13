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

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-playfair',
});

export const metadata: Metadata = {
  title: 'HyperDex | Trade Without Limits',
  description: 'Sealed-bid RFQ for USDC and EURC on Stellar Testnet: firm quotes from competing makers, settled atomically on Soroban.',
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
        <WalletProviders />
        {children}
      </body>
    </html>
  );
}
