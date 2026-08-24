import { Trade } from '../db/models/Trade'
import { logger } from '../utils/logger'
import { getPoolAddressFromRegistry, getMakerPoolBalance, getOnChainSignerKey } from '../utils/stellarUtils'
import { verifyQuoteSignature } from './verifyQuoteSignature'
import { PriceBook } from '../pricebook/PriceBook'
import { toUsd, protocolFeeOn } from '../utils/money'

export interface AuctionQuote {
  quoteId:         string
  makerAddress:    string
  tokenIn:         string
  tokenOut:        string
  amountIn:        string
  amountOut:       string
  expiryTimestamp: number
  salt:            string
  signature:       string
}

interface Auction {
  auctionId:    string
  tokenIn:      string
  tokenOut:     string
  amountIn:     string
  takerAddress: string
  startedAt:    number
  windowMs:     number
  quotes:       AuctionQuote[]
  makerCount:   number
  status:       'collecting' | 'completed' | 'no_quotes'
  bestQuote:    AuctionQuote | null
}

class AuctionStore {
  private auctions: Map<string, Auction> = new Map()

  create(params: {
    auctionId:    string
    tokenIn:      string
    tokenOut:     string
    amountIn:     string
    takerAddress: string
    makerCount:   number
    windowMs:     number
  }): void {
    this.auctions.set(params.auctionId, {
      ...params,
      startedAt: Date.now(),
      quotes:    [],
      status:    'collecting',
      bestQuote: null
    })
  }

  addQuote(auctionId: string, quote: AuctionQuote): void {
    const auction = this.auctions.get(auctionId)
    if (!auction || auction.status !== 'collecting') return

    const alreadyBid = auction.quotes.some(
      q => q.makerAddress === quote.makerAddress
    )
    if (alreadyBid) return

    // Validate with the same types the consumers use. amountOut is compared as
    // BigInt when the winner is picked, so it must be checked as BigInt here —
    // a Number() check accepts "1e3", which then throws inside complete().
    if (!/^[0-9a-f]{128}$/.test(quote.signature)) return
    if (!/^\d+$/.test(quote.amountOut)) return
    let amountOut: bigint
    try {
      amountOut = BigInt(quote.amountOut)
    } catch {
      return
    }
    if (amountOut <= 0n) return
    if (quote.expiryTimestamp < Math.floor(Date.now() / 1000) + 10) return

    auction.quotes.push(quote)
    logger.info('Auction bid received', {
      auctionId:    auctionId.slice(0, 8),
      makerAddress: quote.makerAddress.slice(0, 8),
      amountOut:    quote.amountOut,
      totalBids:    auction.quotes.length,
      makerCount:   auction.makerCount
    })
  }

  async complete(auctionId: string): Promise<void> {
    try {
      await this.completeInner(auctionId)
    } catch (err) {
      // A single malformed bid must never strand the auction in 'collecting',
      // which would leave the taker polling a status that never changes.
      logger.error('Auction completion failed — marking no_quotes', {
        auctionId: auctionId.slice(0, 8),
        err: err instanceof Error ? err.message : String(err)
      })
      const auction = this.auctions.get(auctionId)
      if (auction && auction.status === 'collecting') auction.status = 'no_quotes'
    }
  }

  private async completeInner(auctionId: string): Promise<void> {
    const auction = this.auctions.get(auctionId)
    if (!auction || auction.status !== 'collecting') return

    if (auction.quotes.length === 0) {
      auction.status = 'no_quotes'
      logger.warn('Auction completed with no bids', {
        auctionId: auctionId.slice(0, 8)
      })
      return
    }

    const sorted = [...auction.quotes].sort((a, b) => {
      const diff = BigInt(b.amountOut) - BigInt(a.amountOut)
      return diff > 0n ? 1 : diff < 0n ? -1 : 0
    })

    // Highest bid wins ONLY if the maker's pool can actually pay it. Without
    // this, a maker bids an unbacked number, wins every auction, and settlement
    // reverts with InsufficientBalance — a free venue-wide denial of service,
    // since every honest bid was discarded in favour of the fake one.
    const winner = await this.firstSolventBid(sorted, auction)

    if (!winner) {
      auction.status = 'no_quotes'
      logger.warn('Auction completed with no solvent bids', {
        auctionId: auctionId.slice(0, 8),
        bidsChecked: sorted.length
      })
      return
    }

    auction.bestQuote = winner
    auction.status = 'completed'

    logger.info('Auction completed', {
      auctionId:  auctionId.slice(0, 8),
      winner:     auction.bestQuote.makerAddress.slice(0, 8),
      amountOut:  auction.bestQuote.amountOut,
      totalBids:  auction.quotes.length,
      allBids:    auction.quotes.map(q => ({
        maker:     q.makerAddress.slice(0, 8),
        amountOut: q.amountOut
      }))
    })

    Trade.findOneAndUpdate(
      { quoteId: auction.bestQuote.quoteId },
      {
        $setOnInsert: {
          quoteId:         auction.bestQuote.quoteId,
          rfqId:           auction.auctionId,
          makerAddress:    auction.bestQuote.makerAddress,
          takerAddress:    auction.takerAddress,
          tokenIn:         auction.tokenIn,
          tokenOut:        auction.tokenOut,
          amountIn:        auction.amountIn,
          amountOut:       auction.bestQuote.amountOut,
          // Populated here so /api/stats and the maker dashboards aggregate real
          // figures; both are corrected from on-chain amounts at confirmation.
          amountInUsd:     toUsd(auction.amountIn, auction.tokenIn),
          feeAmount:       protocolFeeOn(auction.bestQuote.amountOut),
          expiryTimestamp: auction.bestQuote.expiryTimestamp,
          status:          'quoted',
          quotedAt:        new Date()
        }
      },
      { upsert: true }
    ).catch(err =>
      logger.error('Failed to save auction trade', { err })
    )
  }

  /**
   * Walk bids best-first and return the first one whose maker pool holds enough
   * token_out to settle. Checked against cached pool balances, so a normal
   * auction costs no RPC round-trips on the winning bid.
   *
   * A maker whose bid is rejected here is penalized in the PriceBook, so
   * repeated unbacked bidding demotes them out of the dispatch set.
   */
  private async firstSolventBid(
    bidsBestFirst: AuctionQuote[],
    auction: Auction
  ): Promise<AuctionQuote | null> {
    for (const bid of bidsBestFirst) {
      try {
        // Re-verify against a FRESH on-chain signer key. Bids were checked on
        // arrival against a cached key that a warmer keeps alive indefinitely,
        // so a rotation mid-auction could admit a bid signed by a revoked key —
        // which then fails on-chain and denies the taker their trade.
        const signerKey = await getOnChainSignerKey(bid.makerAddress, true)
        if (!signerKey) {
          logger.warn('Bid skipped — no on-chain signer key', {
            makerAddress: bid.makerAddress.slice(0, 8)
          })
          continue
        }
        const stillValid = verifyQuoteSignature(
          {
            quoteId:         bid.quoteId,
            makerAddress:    bid.makerAddress,
            takerAddress:    auction.takerAddress,
            tokenIn:         bid.tokenIn,
            tokenOut:        bid.tokenOut,
            amountIn:        bid.amountIn,
            amountOut:       bid.amountOut,
            expiryTimestamp: bid.expiryTimestamp,
            salt:            bid.salt
          },
          bid.signature,
          signerKey
        )
        if (!stillValid) {
          logger.warn('Bid skipped — signature no longer verifies against the current key', {
            makerAddress: bid.makerAddress.slice(0, 8)
          })
          continue
        }

        const poolAddress = await getPoolAddressFromRegistry(bid.makerAddress)
        if (!poolAddress) {
          logger.warn('Bid skipped — maker has no registered pool', {
            makerAddress: bid.makerAddress.slice(0, 8)
          })
          continue
        }

        const balance = await getMakerPoolBalance(poolAddress, auction.tokenOut)
        if (balance >= BigInt(bid.amountOut)) return bid

        logger.warn('Bid skipped — maker pool cannot cover the bid', {
          makerAddress: bid.makerAddress.slice(0, 8),
          amountOut: bid.amountOut,
          poolBalance: balance.toString()
        })
        PriceBook.getInstance().penalizeByAddress(bid.makerAddress, 'unbacked_bid')
      } catch (err) {
        logger.warn('Bid skipped — solvency check failed', {
          makerAddress: bid.makerAddress.slice(0, 8),
          err: err instanceof Error ? err.message : String(err)
        })
      }
    }
    return null
  }

  get(auctionId: string): Auction | null {
    return this.auctions.get(auctionId) || null
  }

  cleanup(): void {
    const cutoff = Date.now() - 10 * 60_000
    for (const [id, a] of this.auctions.entries()) {
      if (a.startedAt < cutoff) this.auctions.delete(id)
    }
  }
}

export const auctionStore = new AuctionStore()
setInterval(() => auctionStore.cleanup(), 5 * 60_000)
