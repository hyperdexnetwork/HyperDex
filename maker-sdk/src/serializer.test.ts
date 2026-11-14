import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { serializeQuote, hashQuote } from './serializer';
import { Quote } from './types';

// Fixed, valid addresses so the test is deterministic.
const contractAddr = (byte: number): string => StrKey.encodeContract(Buffer.alloc(32, byte));
const accountAddr = (byte: number): string =>
  Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte)).publicKey();

const baseQuote: Quote = {
  quote_id: '11'.repeat(32),
  maker: accountAddr(1),
  taker: accountAddr(2),
  token_in: contractAddr(3),
  token_out: contractAddr(4),
  amount_in: '1000000000',
  amount_out: '920000000',
  expiry: 1_800_000_000,
  salt: '22'.repeat(32),
};

describe('serializeQuote', () => {
  it('gives the same bytes for the same quote', () => {
    const a = serializeQuote(baseQuote);
    const b = serializeQuote({ ...baseQuote });
    expect(a.length).toBeGreaterThan(0);
    expect(a.equals(b)).toBe(true);
  });
});

describe('hashQuote', () => {
  it('returns 32 bytes', () => {
    expect(hashQuote(baseQuote)).toHaveLength(32);
  });

  it('gives the same hash for the same quote', () => {
    expect(hashQuote(baseQuote).equals(hashQuote({ ...baseQuote }))).toBe(true);
  });

  const changes: [keyof Quote, Quote[keyof Quote]][] = [
    ['quote_id', '33'.repeat(32)],
    ['maker', accountAddr(5)],
    ['taker', accountAddr(6)],
    ['token_in', contractAddr(7)],
    ['token_out', contractAddr(8)],
    ['amount_in', '1000000001'],
    ['amount_out', '920000001'],
    ['expiry', 1_800_000_001],
    ['salt', '44'.repeat(32)],
  ];

  it.each(changes)('changes when %s changes', (field, value) => {
    const changed = { ...baseQuote, [field]: value } as Quote;
    expect(hashQuote(changed).equals(hashQuote(baseQuote))).toBe(false);
  });
});
