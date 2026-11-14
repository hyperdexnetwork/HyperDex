import WebSocket from 'ws'
import crypto from 'crypto'
import chalk from 'chalk'
import { QuoteSigner } from './signer'
import { getTokenSymbol } from './example-pricer'
import { inventoryChecker } from './inventory-checker'
import { rateLimiter } from './rate-limiter'
import { PriceLevelMessage } from './price-levels'
import { MakerEngine, RfqContext } from './types/MakerEngine'

interface RfqPayload {
  rfqId: string
  takerAddress: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  feesBps: number
  requestedAt: number
}

interface TradeNotification {
  tradeEventId: string
  quoteId: string
  rfqId: string | null
  makerAddress: string
  takerAddress: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOut: string
  feeAmount: string
  txHash: string | null
  confirmedAt: string | null
}

export class MakerWsClient {
  private signer: QuoteSigner
  private engine: MakerEngine
  private ws: WebSocket | null = null
  private reconnectDelay = 1000
  private stopping = false

  constructor(signer: QuoteSigner, engine: MakerEngine) {
    this.signer = signer
    this.engine = engine
  }

  start(): void {
    if (!process.env.MAKER_API_KEY) {
      console.warn('[WS] MAKER_API_KEY not set — WebSocket disabled.')
      return
    }
    this.connect()
    this.setupGracefulShutdown()
  }

  stop(): void {
    this.stopping = true
    if (this.ws) this.ws.close(1000, 'Server shutdown')
  }

  sendPriceLevels(levels: PriceLevelMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    if (levels.buyLevels.length === 0 && levels.sellLevels.length === 0) return
    this.ws.send(JSON.stringify({
      type: 'priceLevels',
      message: levels,
    }))
  }

  private setupGracefulShutdown(): void {
    process.on('SIGINT', async () => {
      console.log('\n' + chalk.yellow('  Gracefully disconnecting from HyperDex...'))

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'priceLevels',
          message: {
            tokenIn: process.env.USDC_CONTRACT || process.env.USDC_CONTRACT_ADDRESS || '',
            tokenOut: process.env.EURC_CONTRACT || process.env.EURC_CONTRACT_ADDRESS || '',
            buyLevels: [],
            sellLevels: [],
          },
        }))
        await new Promise(r => setTimeout(r, 500))
        this.ws.close()
      }

      console.log(chalk.yellow('  Disconnected. Goodbye.'))
      process.exit(0)
    })
  }

  private connect(): void {
    if (this.stopping) return

    const wsUrl = process.env.BACKEND_WS_URL || 'wss://backend-production-c4e14cb9.up.railway.app/ws/maker'
    const apiKey = process.env.MAKER_API_KEY || ''
    const makerName = process.env.MAKER_NAME || 'HyperDex Maker'

    console.log(`[WS] Connecting to ${wsUrl}...`)
    this.ws = new WebSocket(wsUrl, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        marketmaker: makerName,
      },
    })

    this.ws.on('open', () => {
      console.log('[WS] Connected to HyperDex backend')
      this.reconnectDelay = 1000

      // Render drops idle connections after 30s — ping every 20s to keep alive
      const pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping()
          this.ws.send(JSON.stringify({ type: 'ping' }))
        } else {
          clearInterval(pingInterval)
        }
      }, 20_000)

      this.ws!.on('close', () => clearInterval(pingInterval))
    })

    this.ws.on('message', (data: Buffer) => {
      let msg: { type: string; message?: unknown; timestamp?: number }
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }

      switch (msg.type) {
        case 'ping':
          this.ws?.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }))
          break
        case 'connected':
          console.log(`[WS] Authenticated as ${process.env.MAKER_NAME || 'HyperDex Maker'}`)
          break
        case 'rfq':
          this.handleRfq(msg.message as RfqPayload)
          break
        case 'trade':
          this.handleTradeNotification(msg.message as TradeNotification)
          break
        case 'error':
          console.error('[WS] Backend error:', msg)
          break
      }
    })

    this.ws.on('close', (code: number, reason: Buffer) => {
      if (this.stopping) return
      console.warn(`[WS] Disconnected (${code} ${reason.toString()}). Reconnecting in ${this.reconnectDelay}ms...`)
      setTimeout(() => this.connect(), this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
    })

    this.ws.on('error', (err: Error) => {
      console.error('[WS] Socket error:', err.message)
    })
  }

  private handleTradeNotification(trade: TradeNotification): void {
    const tokenInSym  = getTokenSymbol(trade.tokenIn)
    const tokenOutSym = getTokenSymbol(trade.tokenOut)
    const amountIn    = (Number(trade.amountIn) / 1e7).toFixed(4)
    const amountOut   = (Number(trade.amountOut) / 1e7).toFixed(4)
    const txShort     = trade.txHash ? trade.txHash.slice(0, 8) + '...' : 'pending'

    // Notify the engine (default engine invalidates inventory; custom engines
    // may hedge, rebalance, etc.)
    if (this.engine.onTradeConfirmed) {
      this.engine.onTradeConfirmed({
        quoteId:     trade.quoteId,
        amountIn:    trade.amountIn,
        amountOut:   trade.amountOut,
        tokenIn:     trade.tokenIn,
        tokenOut:    trade.tokenOut,
        txHash:      trade.txHash ?? '',
        confirmedAt: trade.confirmedAt ?? '',
      }).catch(err => console.error('[Trade] Engine callback error:', err?.message ?? err))
    }

    // Refresh inventory cache after trade
    inventoryChecker.invalidateCache()
    inventoryChecker.getBalance().then(balance => {
      console.log('\n' + chalk.green('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
      console.log(chalk.green.bold('  [TRADE] ✓ CONFIRMED'))
      console.log(chalk.green('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
      console.log(chalk.gray('  Sold:     ') + chalk.white(`${amountOut} ${tokenOutSym}`))
      console.log(chalk.gray('  Received: ') + chalk.white(`${amountIn} ${tokenInSym}`))
      console.log(chalk.gray('  TX: ') + chalk.cyan(txShort))
      console.log(
        chalk.gray('  Pool: ') +
        chalk.white(`USDC ${balance.usdc.toFixed(2)}`) +
        chalk.gray(' | ') +
        chalk.white(`EURC ${balance.eurc.toFixed(2)}`)
      )
      console.log(chalk.green('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━') + '\n')
    }).catch(() => {
      console.log('\n' + chalk.green('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
      console.log(chalk.green.bold('  [TRADE] ✓ CONFIRMED'))
      console.log(chalk.green('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
      console.log(chalk.gray('  Sold:     ') + chalk.white(`${amountOut} ${tokenOutSym}`))
      console.log(chalk.gray('  Received: ') + chalk.white(`${amountIn} ${tokenInSym}`))
      console.log(chalk.gray('  TX: ') + chalk.cyan(txShort))
      console.log(chalk.green('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━') + '\n')
    })

    // Acknowledge immediately
    this.ws?.send(JSON.stringify({
      type: 'tradeAck',
      message: { tradeEventId: trade.tradeEventId },
    }))
  }

  private async handleRfq(rfq: RfqPayload): Promise<void> {
    const makerAddress = process.env.MAKER_ADDRESS || ''
    const startTime = Date.now()

    try {
      // Check rate limit
      rateLimiter.trackRequest(rfq.takerAddress)
      if (rateLimiter.isLimited(rfq.takerAddress)) {
        const expiry = rateLimiter.getExpiry(rfq.takerAddress)
        this.ws?.send(JSON.stringify({
          type: 'rfqError',
          message: {
            rfqId: rfq.rfqId,
            reason: 'rate_limit',
            expiryTimestampMs: expiry,
          },
        }))
        console.log(`[RFQ] Rate-limited ${rfq.takerAddress.slice(0, 8)}...`)
        return
      }

      // Build the engine context and let the engine (default or custom) decide.
      const ctx: RfqContext = {
        rfqId:          rfq.rfqId,
        takerAddress:   rfq.takerAddress,
        tokenIn:        rfq.tokenIn,
        tokenOut:       rfq.tokenOut,
        tokenInSymbol:  getTokenSymbol(rfq.tokenIn),
        tokenOutSymbol: getTokenSymbol(rfq.tokenOut),
        amountIn:       rfq.amountIn,
        amountInHuman:  Number(rfq.amountIn) / 1e7,
        feesBps:        rfq.feesBps ?? 10,
        requestedAt:    rfq.requestedAt,
      }

      const amountOut = await this.engine.getQuote(ctx)

      if (!amountOut) {
        // Engine returned null = do not participate (no penalty).
        this.ws?.send(JSON.stringify({
          type: 'rfqError',
          message: {
            rfqId: rfq.rfqId,
            reason: 'market_conditions',
          },
        }))
        console.log(
          `[RFQ] Skipped   rfqId=${rfq.rfqId.slice(0, 8)}...` +
          `  reason=engine_declined  latency=${Date.now() - startTime}ms`
        )
        return
      }

      // Build and sign quote
      const salt = crypto.randomBytes(32).toString('hex')
      const expiry = Math.floor(Date.now() / 1000) + 120 // 30s collection + 10s to approve + 80s buffer
      const quotePayload = `${makerAddress}${rfq.takerAddress}${rfq.tokenIn}${rfq.tokenOut}${rfq.amountIn}${expiry}${salt}`
      const quoteId = crypto.createHash('sha256').update(quotePayload).digest('hex')

      const quote = {
        quote_id: quoteId,
        maker: makerAddress,
        taker: rfq.takerAddress,
        token_in: rfq.tokenIn,
        token_out: rfq.tokenOut,
        amount_in: rfq.amountIn,
        amount_out: amountOut,
        expiry,
        salt,
      }

      const signature = this.signer.signQuote(quote)

      this.ws?.send(JSON.stringify({
        type: 'rfqQuote',
        message: {
          rfqId: rfq.rfqId,
          quoteId,
          makerAddress,
          takerAddress: rfq.takerAddress,
          tokenIn: rfq.tokenIn,
          tokenOut: rfq.tokenOut,
          amountIn: rfq.amountIn,
          amountOut,
          expiryTimestamp: expiry,
          salt,
          signature,
        },
      }))

      const latency = Date.now() - startTime
      const amountInHuman  = (Number(rfq.amountIn) / 1e7).toFixed(4)
      const amountOutHuman = (Number(amountOut) / 1e7).toFixed(4)
      const impliedRate    = Number(rfq.amountIn) > 0
        ? (Number(amountOut) / Number(rfq.amountIn)).toFixed(6)
        : '?'

      console.log(
        chalk.white(`\n[RFQ] Quoted    `) + chalk.gray(`rfqId=${rfq.rfqId.slice(0, 8)}...`)
      )
      console.log(
        chalk.gray('      ') +
        chalk.cyan(`${amountInHuman} ${getTokenSymbol(rfq.tokenIn)}`) +
        chalk.gray(' → ') +
        chalk.green(`${amountOutHuman} ${getTokenSymbol(rfq.tokenOut)}`)
      )
      console.log(
        chalk.gray(`      Rate: `) +
        chalk.yellow(impliedRate) +
        chalk.gray(` | Fee: ${rfq.feesBps ?? 10}bps`)
      )
      console.log(chalk.gray(`      Latency: ${latency}ms`))

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown'
      console.error(`[RFQ] Error processing RFQ:`, msg)
      this.ws?.send(JSON.stringify({
        type: 'rfqError',
        message: { rfqId: rfq.rfqId, reason: 'internal_error' },
      }))
    }
  }
}
