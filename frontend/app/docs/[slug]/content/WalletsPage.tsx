import { H1, H2, H3, P, Ul, Li, Table, Callout, Code, Mono } from '@/components/docs/DocsPrimitives';

export default function WalletsPage() {
  return (
    <>
      <H1 tag="Getting Started">Connecting a Wallet</H1>
      <P>HyperDex connects through <strong>Stellar Wallets Kit</strong> — eight wallets, one interface. Freighter is no longer required.</P>

      <H2 id="supported">Supported wallets</H2>
      <Table
        headers={['Wallet', 'Type', 'Notes']}
        rows={[
          ['Freighter', 'Browser extension', 'Chrome / Brave / Firefox'],
          ['xBull', 'Extension · web', 'Also usable without installing'],
          ['LOBSTR', 'Mobile', 'Connects by QR from the phone app'],
          ['Rabet', 'Browser extension', 'Chrome / Firefox'],
          ['Albedo', 'Web', 'No install — multi-account'],
          ['Hana', 'Browser extension', 'Multi-chain'],
          ['HOT Wallet', 'Web · Telegram', 'No install'],
          ['Ledger', 'Hardware', 'Via WebUSB/WebHID'],
        ]}
      />
      <P>Click <strong>Connect Wallet</strong> in the navbar to open the picker. Detection runs fresh every time the sheet opens, so a wallet you installed a moment ago appears without a reload. Installed wallets are listed first; the rest show an <strong>Install</strong> pill that opens the vendor&apos;s site in a new tab.</P>

      <Callout type="info" title="Custom picker, kit data">HyperDex renders its own wallet sheet rather than the kit&apos;s <Mono>authModal()</Mono>, so the picker carries the HyperDex theme. The wallet list, availability detection and every connect/sign action still come from the kit.</Callout>

      <H2 id="on-connect">What happens on connect</H2>
      <Ul>
        <Li>The kit is initialised <strong>lazily and browser-only</strong> — its modules touch <Mono>window</Mono> and injected extension globals at construction, so importing during SSR throws</Li>
        <Li>Your wallet is asked for its address; HyperDex only ever reads the <strong>public key</strong></Li>
        <Li>The wallet&apos;s network is compared against the selected network — a mismatch raises the wrong-network banner instead of connecting</Li>
        <Li>The wallet id and display name are stored in <Mono>localStorage</Mono> so a reload reconnects without prompting again</Li>
      </Ul>

      <Callout type="tip" title="Nothing is probed unasked">Session restore only runs for a wallet you previously picked. Without a stored id there is nothing to reconnect to — probing every module on load would fire permission prompts you never asked for.</Callout>

      <H2 id="signing">Signing</H2>
      <P>Every transaction is signed with the connected wallet, pinned to two things:</P>
      <Ul>
        <Li><strong>The network passphrase</strong> of the selected network — a signature made against the wrong one is rejected on-chain as <Mono>txBadAuth</Mono></Li>
        <Li><strong>The signing address</strong> — multi-account wallets such as Albedo use this to choose <em>which</em> key signs. Without it a user can approve with an account the quote was not bound to, and settlement fails after they have already clicked approve</Li>
      </Ul>
      <Code>{`const { signedTxXdr } = await kit.signTransaction(xdr, {
  networkPassphrase: ACTIVE_NETWORK.passphrase,
  address,   // pins WHICH account signs
});`}</Code>

      <H2 id="robustness">Robustness details</H2>

      <H3 id="cancellation">Cancellation vs. failure</H3>
      <P>The kit rejects with a plain <Mono>{'{ code, message }'}</Mono> object rather than an <Mono>Error</Mono>. Those rejections are normalised before they reach the UI, so a user declining in their wallet closes the sheet quietly instead of surfacing a generic &quot;Failed to connect&quot;, while real errors keep their reason.</P>

      <H3 id="timeouts">Timeouts</H3>
      <P>Connect requests time out after 90 seconds and session restores after 20, so the UI can never hang on &quot;Connecting…&quot; when a wallet never answers.</P>

      <H3 id="fetch-vs-read">Fetch vs. read</H3>
      <P>Connecting calls <Mono>fetchAddress()</Mono>, which asks the wallet. <Mono>getAddress()</Mono> only reads the kit&apos;s in-memory value — always empty on a fresh connect — so it is used as the cheap path within a page-load and falls through to <Mono>fetchAddress()</Mono> after a reload.</P>

      <H2 id="networks">Wallets and networks</H2>
      <P>The kit is initialised against whichever network the navbar switcher has selected, so it follows the rest of the app automatically. Switching networks reloads the page and drops the wallet session — set your wallet to the matching network before reconnecting. See <strong>Mainnet &amp; Testnet</strong> for the full picture.</P>

      <Callout type="warn" title="Hardware and bridge wallets">Wallets that do not expose their network return <Mono>null</Mono> and are let through the connect-time check. The guard runs again at signing time, where a wrong-network transaction is refused before the wallet opens.</Callout>

      <H2 id="disconnect">Disconnecting</H2>
      <P>Disconnect clears the stored wallet id and name and calls the module&apos;s own <Mono>disconnect()</Mono>. Modules that do not implement it are fine — clearing HyperDex&apos;s own state is enough to end the session.</P>
    </>
  );
}
