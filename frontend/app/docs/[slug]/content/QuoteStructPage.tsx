import { H1, H2, P, Code, Mono } from '@/components/docs/DocsPrimitives';

export default function QuoteStructPage() {
  return (
    <>
      <H1 tag="Protocol Spec">Quote Struct &amp; XDR</H1>
      <P>The Quote is a Soroban <Mono>#[contracttype]</Mono> struct. It is the core data structure of the protocol — everything revolves around constructing, signing, and verifying it.</P>

      <H2 id="struct-definition">Struct definition (Rust)</H2>
      <Code>{`#[contracttype]
pub struct Quote {
    pub quote_id:   BytesN<32>,  // SHA256(tokenIn|tokenOut|amountIn|taker|expiry) — unique
    pub maker:      Address,     // Registered maker Stellar address
    pub taker:      Address,     // Specific taker — quote is non-transferable
    pub token_in:   Address,     // SAC address of token taker sends (EURC or USDC)
    pub token_out:  Address,     // SAC address of token taker receives
    pub amount_in:  i128,        // Amount taker sends, in stroops (1 token = 1e7 stroops)
    pub amount_out: i128,        // Amount taker receives (before fee deduction)
    pub expiry:     u64,         // Unix timestamp (seconds) — quote invalid after this
    pub salt:       BytesN<32>,  // Random 32 bytes — prevents signature replay
}`}</Code>

      <H2 id="stroops">Stroops — the unit of account</H2>
      <P>All amounts are in <strong>stroops</strong> — Stellar&apos;s base unit. 1 token = 10,000,000 stroops (1e7). Always multiply human-readable amounts before building a Quote struct.</P>
      <Code>{`// 20 EURC in stroops:
const amount_in = BigInt(20) * BigInt(10_000_000); // = 200_000_000n`}</Code>

      <H2 id="signing-typescript">Signing a Quote (TypeScript)</H2>
      <Code>{`import * as StellarSdk from "@stellar/stellar-sdk";
import { createHash } from "crypto";

// 1. Build the Quote struct fields
const quote = {
  quote_id:   sha256(tokenIn + tokenOut + amountIn + taker + expiry),
  maker:      MAKER_ADDRESS,
  taker:      TAKER_ADDRESS,
  token_in:   EURC_SAC,
  token_out:  USDC_SAC,
  amount_in:  200_000_000n,   // 20 EURC
  amount_out: 218_100_000n,   // 21.81 USDC (before fee)
  expiry:     Math.floor(Date.now() / 1000) + 120,
  salt:       crypto.randomBytes(32),
};

// 2. Encode as XDR ScVal (matches Soroban contracttype layout)
const quoteXdr = encodeQuoteAsScVal(quote);  // using @stellar/stellar-sdk

// 3. Hash and sign
const msgHash  = createHash("sha256").update(quoteXdr).digest();
const keypair  = StellarSdk.Keypair.fromSecret(SIGNER_SECRET);
const signature = keypair.sign(msgHash);  // 64-byte ed25519 signature

// 4. Submit bid to backend auction
await fetch(\`/api/auctions/\${auctionId}/bid\`, {
  method: "POST",
  headers: { "Authorization": \`Bearer \${API_KEY}\` },
  body: JSON.stringify({
    quote,
    signature: Buffer.from(signature).toString("hex"),
  }),
});`}</Code>
    </>
  );
}
