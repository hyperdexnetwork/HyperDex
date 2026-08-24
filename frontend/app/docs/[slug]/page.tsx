'use client';

import { notFound } from 'next/navigation';
import DocsTableOfContents from '@/components/docs/DocsTableOfContents';
import DocsPageNav from '@/components/docs/DocsPageNav';

/* Lazy-load each page component */
import MissionPage from './content/MissionPage';
import ArchitecturePage from './content/ArchitecturePage';
import WhatYouNeedPage from './content/WhatYouNeedPage';
import NetworksPage from './content/NetworksPage';
import WalletsPage from './content/WalletsPage';
import FirstSwapPage from './content/FirstSwapPage';
import MakerSetupPage from './content/MakerSetupPage';
import PricingEnginesPage from './content/PricingEnginesPage';
import VaultDepositPage from './content/VaultDepositPage';
import TroubleshootPage from './content/TroubleshootPage';
import RfqPage from './content/RfqPage';
import SealedBidPage from './content/SealedBidPage';
import ZeroSlippagePage from './content/ZeroSlippagePage';
import NonCustodialPage from './content/NonCustodialPage';
import Ed25519Page from './content/Ed25519Page';
import MevPage from './content/MevPage';
import FeesPage from './content/FeesPage';
import QuoteStructPage from './content/QuoteStructPage';
import AuctionFlowPage from './content/AuctionFlowPage';
import SettlementPage from './content/SettlementPage';
import ProgramsPage from './content/ProgramsPage';
import PoolRegistryPage from './content/PoolRegistryPage';
import VaultContractPage from './content/VaultContractPage';
import QuoteVerifierPage from './content/QuoteVerifierPage';
import FeeDistributorPage from './content/FeeDistributorPage';
import RestApiPage from './content/RestApiPage';
import WebsocketPage from './content/WebsocketPage';
import DeploymentsPage from './content/DeploymentsPage';
import TokensPage from './content/TokensPage';
import FaqPage from './content/FaqPage';

const PAGE_MAP: Record<string, React.ComponentType> = {
  'mission':         MissionPage,
  'architecture':    ArchitecturePage,
  'networks':        NetworksPage,
  'what-you-need':   WhatYouNeedPage,
  'wallets':         WalletsPage,
  'first-swap':      FirstSwapPage,
  'maker-setup':     MakerSetupPage,
  'pricing-engines': PricingEnginesPage,
  'vault-deposit':   VaultDepositPage,
  'troubleshoot':    TroubleshootPage,
  'rfq':             RfqPage,
  'sealed-bid':      SealedBidPage,
  'zero-slippage':   ZeroSlippagePage,
  'non-custodial':   NonCustodialPage,
  'ed25519':         Ed25519Page,
  'mev':             MevPage,
  'fees':            FeesPage,
  'quote-struct':    QuoteStructPage,
  'auction-flow':    AuctionFlowPage,
  'settlement':      SettlementPage,
  'programs':        ProgramsPage,
  'pool-registry':   PoolRegistryPage,
  'vault':           VaultContractPage,
  'quote-verifier':  QuoteVerifierPage,
  'fee-distributor': FeeDistributorPage,
  'rest-api':        RestApiPage,
  'websocket':       WebsocketPage,
  'deployments':     DeploymentsPage,
  'tokens':          TokensPage,
  'faq':             FaqPage,
};

export default async function DocSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const PageComponent = PAGE_MAP[slug];

  if (!PageComponent) {
    notFound();
  }

  return (
    <>
      <main className="docs-content flex-1 min-w-0 px-6 md:px-12 py-10 pb-24">
        <PageComponent />
        <DocsPageNav />
      </main>
      <DocsTableOfContents />
    </>
  );
}
