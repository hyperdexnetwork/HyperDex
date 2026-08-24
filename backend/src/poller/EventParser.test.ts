// Regression test for the event-field mapping.
//
// The parser previously read identity fields out of topics[1..3], but both
// contracts publish a SINGLE topic (the event name) and put everything else in
// the data tuple. Every read returned undefined, and ConfirmationPoller
// persisted the string "undefined" as amountOut and a G-address as amountIn on
// every confirmed trade. These tests build the events exactly as the contracts
// emit them, so a future change to either event shape fails here.
//
//   quote_verifier: publish(("quote_executed",), (quote_id, maker, taker))
//   maker_pool:     publish(("swap_executed",),  (token_in, token_out,
//                                                 amount_in, amount_out))

import * as StellarSdk from '@stellar/stellar-sdk';
import { EventParser } from './EventParser';

const VERIFIER = 'CDMOUCUKCZRMSYQE5TQ7QVGVUFJYFSP7XLLBHL3ZE2EQLZGZUFC4PHXK';
const POOL = 'CBDD5WBPCX6GSF4XIP6CAKAM3TCU6R73CW7QNYUTXXT3OAGEPFFACOI4';
const OTHER_POOL = 'CAFWHWLA2XJKWVDYYHTXHVWHHEHGLPSSX3IGVJLD5LZ5YCUMOPWONQR2';
const USDC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const EURC = 'CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV';
const MAKER = 'GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726';
const TAKER = 'GAL6ZVVRE2RPFS2X23I65QANHHIBGHKTGGVIT5AJURRKTIMEVUMJJUZZ';
const QUOTE_ID = 'a'.repeat(64);

const sym = (s: string) => StellarSdk.xdr.ScVal.scvSymbol(s);
const addr = (a: string) => StellarSdk.nativeToScVal(a, { type: 'address' });
const i128 = (n: bigint) => StellarSdk.nativeToScVal(n, { type: 'i128' });

function contractEvent(
  contractId: string,
  topics: StellarSdk.xdr.ScVal[],
  data: StellarSdk.xdr.ScVal,
): StellarSdk.xdr.ContractEvent {
  return new StellarSdk.xdr.ContractEvent({
    ext: new StellarSdk.xdr.ExtensionPoint(0),
    contractId: StellarSdk.Address.fromString(contractId).toBuffer() as never,
    type: StellarSdk.xdr.ContractEventType.contract(),
    body: new StellarSdk.xdr.ContractEventBody(
      0,
      new StellarSdk.xdr.ContractEventV0({ topics, data }),
    ),
  });
}

/** Protocol 20-22 shape: events nested under sorobanMeta. */
function metaWith(events: StellarSdk.xdr.ContractEvent[]): StellarSdk.xdr.TransactionMeta {
  return new StellarSdk.xdr.TransactionMeta(
    3,
    new StellarSdk.xdr.TransactionMetaV3({
      ext: new StellarSdk.xdr.ExtensionPoint(0),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta: new StellarSdk.xdr.SorobanTransactionMeta({
        ext: new StellarSdk.xdr.SorobanTransactionMetaExt(0),
        events,
        returnValue: StellarSdk.xdr.ScVal.scvVoid(),
        diagnosticEvents: [],
      }),
    }),
  );
}

/**
 * Protocol 23+ shape: contract events sit under each operation, while the
 * top-level events field carries transaction events (fee, refund). This is
 * what testnet and mainnet return today.
 */
function metaV4With(events: StellarSdk.xdr.ContractEvent[]): StellarSdk.xdr.TransactionMeta {
  return new StellarSdk.xdr.TransactionMeta(
    4,
    new StellarSdk.xdr.TransactionMetaV4({
      ext: new StellarSdk.xdr.ExtensionPoint(0),
      txChangesBefore: [],
      operations: [
        new StellarSdk.xdr.OperationMetaV2({
          ext: new StellarSdk.xdr.ExtensionPoint(0),
          changes: [],
          events,
        }),
      ],
      txChangesAfter: [],
      sorobanMeta: null,
      events: [],
      diagnosticEvents: [],
    }),
  );
}

const quoteExecuted = (contractId = VERIFIER) =>
  contractEvent(
    contractId,
    [sym('quote_executed')],
    StellarSdk.xdr.ScVal.scvVec([
      StellarSdk.xdr.ScVal.scvBytes(Buffer.from(QUOTE_ID, 'hex')),
      addr(MAKER),
      addr(TAKER),
    ]),
  );

const swapExecuted = (poolAddress: string, amountIn: bigint, amountOut: bigint) =>
  contractEvent(
    poolAddress,
    [sym('swap_executed')],
    StellarSdk.xdr.ScVal.scvVec([addr(USDC), addr(EURC), i128(amountIn), i128(amountOut)]),
  );

describe('EventParser', () => {
  const parser = new EventParser(VERIFIER);

  it('reads quote_executed identity fields from the data tuple, not topics', () => {
    const events = parser.parseTransactionEvents(metaWith([quoteExecuted()]));
    const parsed = parser.extractSwapEvent(events)?.parsed;

    expect(parsed).toBeDefined();
    expect(parsed!.quoteId).toBe(QUOTE_ID);
    expect(parsed!.makerAddress).toBe(MAKER);
    expect(parsed!.takerAddress).toBe(TAKER);
    // The old bug: these came back as the literal string "undefined".
    expect(parsed!.quoteId).not.toBe('undefined');
  });

  it('recovers real amounts from the pool swap_executed event', () => {
    const events = parser.parseTransactionEvents(
      metaWith([quoteExecuted(), swapExecuted(POOL, 10_000_000_000n, 9_200_000_000n)]),
    );
    const swaps = parser.extractPoolSwaps(events);

    expect(swaps).toHaveLength(1);
    expect(swaps[0].poolAddress).toBe(POOL);
    expect(swaps[0].tokenIn).toBe(USDC);
    expect(swaps[0].tokenOut).toBe(EURC);
    expect(swaps[0].amountIn).toBe('10000000000');
    expect(swaps[0].amountOut).toBe('9200000000');
  });

  it('ignores quote_executed from a contract that is not our verifier', () => {
    const events = parser.parseTransactionEvents(metaWith([quoteExecuted(OTHER_POOL)]));
    expect(parser.extractSwapEvent(events)).toBeNull();
  });

  it('keeps the emitting pool address so callers can reject foreign swaps', () => {
    // Any contract can emit an event named swap_executed. The parser surfaces
    // them all; ConfirmationPoller accepts amounts only from the pool that
    // belongs to the trade's maker.
    const events = parser.parseTransactionEvents(
      metaWith([
        quoteExecuted(),
        swapExecuted(OTHER_POOL, 999_999_999_999n, 999_999_999_999n),
        swapExecuted(POOL, 10_000_000_000n, 9_200_000_000n),
      ]),
    );
    const swaps = parser.extractPoolSwaps(events);

    expect(swaps).toHaveLength(2);
    expect(swaps.find(s => s.poolAddress === POOL)!.amountOut).toBe('9200000000');
    expect(swaps.find(s => s.poolAddress === OTHER_POOL)!.amountOut).toBe('999999999999');
  });

  it('returns no events for non-Soroban transaction meta', () => {
    const v0 = new StellarSdk.xdr.TransactionMeta(0, []);
    expect(parser.parseTransactionEvents(v0)).toEqual([]);
  });

  // Protocol 23 moved events out of sorobanMeta and bumped the meta arm to v4.
  // Reading only v3() threw on every transaction and yielded zero events, so
  // the poller confirmed trades with no on-chain evidence whatsoever. Testnet
  // and mainnet both return v4 today — if this test fails, settlement
  // confirmation is silently blind again.
  it('parses events from Protocol 23 (v4) meta, not just v3', () => {
    const events = parser.parseTransactionEvents(
      metaV4With([quoteExecuted(), swapExecuted(POOL, 10_000_000n, 8_572_829n)]),
    );

    expect(events.length).toBe(2);
    const parsed = parser.extractSwapEvent(events)?.parsed;
    expect(parsed?.quoteId).toBe(QUOTE_ID);
    expect(parsed?.takerAddress).toBe(TAKER);
    expect(parser.extractPoolSwaps(events)[0].amountOut).toBe('8572829');
  });
});
