import * as StellarSdk from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';

export interface SorobanEvent {
  type: 'contract';
  contractId: string;
  topics: unknown[];
  data: unknown;
  parsed?: {
    eventType: 'quote_executed';
    quoteId: string;
    makerAddress: string;
    takerAddress: string;
    // Amounts are NOT carried by quote_executed — they come from maker_pool's
    // swap_executed event in the same transaction, so they may be absent.
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: string;
    amountOut?: string;
  };
}

/**
 * A `swap_executed` event emitted by a maker_pool during settlement. The pool
 * address is retained so the caller can verify it belongs to the maker named in
 * the trade — a transaction may contain events from contracts we don't trust.
 */
export interface SwapEvent {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
}

export class EventParser {
  private quoteVerifierContractId: string;

  constructor(quoteVerifierContractId: string) {
    this.quoteVerifierContractId = quoteVerifierContractId;
  }

  /**
   * Extract contract events from a transaction's meta.
   *
   * Meta is a versioned union and the arm moved: Protocol 23 returns v4, where
   * contract events sit per-operation instead of under sorobanMeta. Reading
   * only v3() meant every call threw and returned zero events — so on a v4
   * network NOTHING was ever parsed, and the poller silently fell back to
   * confirming trades with no on-chain evidence at all. Both arms are handled
   * here, and StellarTxFetcher prefers the RPC's own decoded list over this.
   *
   * Note v4's TOP-LEVEL events() is not the right source: those are transaction
   * events (fee charge, refund), not contract events.
   */
  parseTransactionEvents(meta: StellarSdk.xdr.TransactionMeta): SorobanEvent[] {
    let rawEvents: StellarSdk.xdr.ContractEvent[] = [];

    // Protocol 23+ (TransactionMetaV4): contract events live per operation.
    try {
      const v4 = (meta as unknown as {
        v4(): { operations(): Array<{ events(): StellarSdk.xdr.ContractEvent[] }> };
      }).v4();
      rawEvents = (v4?.operations() ?? []).flatMap(op => op.events() ?? []);
    } catch {
      // Not v4 — fall through to v3.
    }

    // Protocol 20-22 (TransactionMetaV3): events under sorobanMeta.
    if (rawEvents.length === 0) {
      try {
        rawEvents = meta.v3().sorobanMeta()?.events() ?? [];
      } catch {
        // Non-Soroban transaction or an arm we don't handle — no events.
        return [];
      }
    }

    return this.parseContractEvents(rawEvents);
  }

  /** Core decoder, shared by both the meta path and the RPC's event list. */
  parseContractEvents(rawEvents: StellarSdk.xdr.ContractEvent[]): SorobanEvent[] {
    const results: SorobanEvent[] = [];

    for (const event of rawEvents) {
      try {
        // Only process contract-type events
        if (event.type().name !== 'contract') continue;

        const rawContractId = event.contractId();
        if (!rawContractId) continue;

        // xdr.Hash is a Buffer at runtime despite the strict type definition
        const contractId = StellarSdk.Address.contract(rawContractId as unknown as Buffer).toString();

        const body = event.body().v0();
        const topics = body.topics().map(t => StellarSdk.scValToNative(t));
        const data = StellarSdk.scValToNative(body.data());

        // Two event shapes matter, and they come from different contracts:
        //
        //   quote_verifier: publish(("quote_executed",), (quote_id, maker, taker))
        //   maker_pool:     publish(("swap_executed",),  (token_in, token_out,
        //                                                 amount_in, amount_out))
        //
        // Both carry a SINGLE topic — the event name. Every other field lives in
        // the data tuple. Reading identity fields out of topics[1..3] yields
        // undefined, which is how "undefined" ended up persisted as an amount.
        const isQuoteExecuted =
          topics[0] === 'quote_executed' && contractId === this.quoteVerifierContractId;
        const isSwapExecuted = topics[0] === 'swap_executed';

        if (!isQuoteExecuted && !isSwapExecuted) continue;

        const sorobanEvent: SorobanEvent = { type: 'contract', contractId, topics, data };

        if (isQuoteExecuted) {
          try {
            const d = Array.isArray(data) ? data : [data];
            const quoteIdRaw = d[0];
            const quoteId = Buffer.isBuffer(quoteIdRaw)
              ? (quoteIdRaw as Buffer).toString('hex')
              : Buffer.from(quoteIdRaw as Uint8Array).toString('hex');

            sorobanEvent.parsed = {
              eventType: 'quote_executed',
              quoteId,
              makerAddress: String(d[1]),
              takerAddress: String(d[2]),
            };
          } catch (parseErr) {
            logger.warn('Failed to parse quote_executed event fields', {
              event: 'event_parse_error',
              message: (parseErr as Error).message,
              contractId,
            });
          }
        }

        results.push(sorobanEvent);
      } catch (err) {
        logger.warn('Failed to parse contract event — skipping', {
          event: 'event_parse_error',
          message: (err as Error).message,
        });
      }
    }

    return results;
  }

  extractSwapEvent(events: SorobanEvent[]): SorobanEvent | null {
    return events.find(e => e.parsed?.eventType === 'quote_executed') ?? null;
  }

  /**
   * The `swap_executed` events in this transaction, with the emitting pool
   * address attached. Callers MUST check the pool address against the maker's
   * registered pool before trusting the amounts — any contract can emit an
   * event by this name.
   */
  extractPoolSwaps(events: SorobanEvent[]): SwapEvent[] {
    const swaps: SwapEvent[] = [];
    for (const e of events) {
      if (e.topics[0] !== 'swap_executed') continue;
      const d = Array.isArray(e.data) ? e.data : [e.data];
      if (d.length < 4) continue;
      const amountIn = d[2];
      const amountOut = d[3];
      if (typeof amountIn !== 'bigint' || typeof amountOut !== 'bigint') continue;
      swaps.push({
        poolAddress: e.contractId,
        tokenIn: String(d[0]),
        tokenOut: String(d[1]),
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
      });
    }
    return swaps;
  }
}
