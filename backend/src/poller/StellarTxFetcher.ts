import * as StellarSdk from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { EventParser, SorobanEvent } from './EventParser';
import { config } from '../config';

export interface TxResult {
  status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND' | 'PENDING';
  txHash: string;
  ledger?: number;
  ledgerCloseTime?: Date;
  resultXdr?: StellarSdk.xdr.TransactionResult;
  envelopeXdr?: StellarSdk.xdr.TransactionEnvelope;
  events?: SorobanEvent[];
  failureReason?: string;
}

/**
 * Contract events for a successful transaction.
 *
 * Prefer the RPC response's own decoded list (`events.contractEventsXdr`,
 * one array per operation) — it is version-independent, so it keeps working
 * across meta-format changes like the v3→v4 move in Protocol 23. Falls back to
 * decoding the meta directly for older RPC servers that don't send it.
 */
function contractEventsOf(
  response: StellarSdk.rpc.Api.GetSuccessfulTransactionResponse,
): StellarSdk.xdr.ContractEvent[] {
  const fromRpc = (
    response as unknown as { events?: { contractEventsXdr?: StellarSdk.xdr.ContractEvent[][] } }
  ).events?.contractEventsXdr;

  if (Array.isArray(fromRpc)) return fromRpc.flat();
  return metaEvents(response.resultMetaXdr);
}

function metaEvents(meta: StellarSdk.xdr.TransactionMeta): StellarSdk.xdr.ContractEvent[] {
  // v4 keeps CONTRACT events per operation; its top-level events() holds
  // transaction events (fee, refund) and is not what we want.
  try {
    const v4 = (meta as unknown as {
      v4(): { operations(): Array<{ events(): StellarSdk.xdr.ContractEvent[] }> };
    }).v4();
    const evs = (v4?.operations() ?? []).flatMap(op => op.events() ?? []);
    if (evs.length) return evs;
  } catch {
    // Not v4.
  }
  try {
    return meta.v3().sorobanMeta()?.events() ?? [];
  } catch {
    return [];
  }
}

export class StellarTxFetcher {
  private server: StellarSdk.rpc.Server;
  private parser: EventParser;

  constructor(rpcUrl: string, _networkPassphrase: string) {
    this.server = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: true });
    this.parser = new EventParser(config.QUOTE_VERIFIER_CONTRACT_ADDRESS);
  }

  async getTransaction(txHash: string): Promise<TxResult> {
    try {
      const response = await this.server.getTransaction(txHash);

      if (response.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
        const events = this.parser.parseContractEvents(contractEventsOf(response));
        return {
          status: 'SUCCESS',
          txHash,
          ledger: response.ledger,
          ledgerCloseTime: new Date(response.createdAt * 1000),
          resultXdr: response.resultXdr,
          envelopeXdr: response.envelopeXdr,
          events,
        };
      }

      if (response.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
        let failureReason = 'Transaction failed on-chain';
        try {
          const resultCode = response.resultXdr.result().switch().name as string;
          failureReason = resultCode;
        } catch {
          // Keep default
        }
        return {
          status: 'FAILED',
          txHash,
          ledger: response.ledger,
          ledgerCloseTime: new Date(response.createdAt * 1000),
          failureReason,
        };
      }

      // NOT_FOUND
      return { status: 'NOT_FOUND', txHash };
    } catch (err) {
      logger.error('Stellar RPC error in getTransaction', {
        event: 'stellar_rpc_error',
        message: (err as Error).message,
        stack: (err as Error).stack,
        txHash,
      });
      return { status: 'NOT_FOUND', txHash };
    }
  }

  async getCurrentLedger(): Promise<number> {
    const response = await this.server.getLatestLedger();
    return response.sequence;
  }
}
