'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { BACKEND_URL, USDC_CONTRACT, EURC_CONTRACT } from '@/lib/constants'

// Sourced from the runtime-selected network, not raw env, so the mainnet /
// testnet switch reaches the RFQ endpoint and token addresses too.
const BACKEND              = BACKEND_URL
const USDC                 = USDC_CONTRACT
const EURC                 = EURC_CONTRACT
const MIN_DISPLAY_WAIT_MS  = 30_000

export type AuctionStatus =
  | 'idle'
  | 'starting'
  | 'collecting'
  | 'completed'
  | 'no_quotes'
  | 'executing'
  | 'confirming'
  | 'success'
  | 'rejected'
  | 'error'

export interface BestQuote {
  quoteId:         string
  makerAddress:    string
  takerAddress:    string
  makerName:       string
  tokenIn:         string
  tokenOut:        string
  amountIn:        string
  amountOut:       string
  expiryTimestamp: number
  salt:            string
  signature:       string
  rate:            string
  humanAmountIn:   string
  humanAmountOut:  string
  quotesReceived:  number
}

interface AuctionState {
  status:            AuctionStatus
  auctionId:         string | null
  makerCount:        number
  quotesReceived:    number
  collectingSeconds: number
  acceptSeconds:     number
  bestQuote:         BestQuote | null
  txHash:            string | null
  error:             string | null
  /** Set when the trade was rejected because the wallet lacks a trustline.
   *  Carries the asset the user must add, so the UI can offer to add it. */
  missingTrustline:  { token: string; asset: string | null; code: string } | null
}

export function useAuction() {
  const { address } = useWallet()

  const [state, setState] = useState<AuctionState>({
    status: 'idle', auctionId: null,
    makerCount: 0, quotesReceived: 0,
    collectingSeconds: 30, acceptSeconds: 10,
    bestQuote: null, txHash: null, error: null,
    missingTrustline: null
  })

  const [tokenIn,  setTokenIn]  = useState(USDC)
  const [tokenOut, setTokenOut] = useState(EURC)
  const [amountIn, setAmountIn] = useState('')

  const collectRef = useRef<ReturnType<typeof setInterval>>()
  const acceptRef  = useRef<ReturnType<typeof setInterval>>()
  const pollRef    = useRef<ReturnType<typeof setInterval>>()

  const tokenInSym  = tokenIn  === USDC ? 'USDC' : 'EURC'
  const tokenOutSym = tokenOut === USDC ? 'USDC' : 'EURC'

  function swapTokenDirection() {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    resetState()
  }

  function resetState() {
    clearInterval(collectRef.current)
    clearInterval(acceptRef.current)
    clearInterval(pollRef.current)
    setState({
      status: 'idle', auctionId: null,
      makerCount: 0, quotesReceived: 0,
      collectingSeconds: 30, acceptSeconds: 10,
      bestQuote: null, txHash: null, error: null, missingTrustline: null
    })
  }

  // ── START AUCTION ────────────────────────────────────────────────────────────
  const startAuction = useCallback(async () => {
    if (!address) return
    if (!amountIn || parseFloat(amountIn) <= 0) return

    setState(s => ({
      ...s, status: 'starting', error: null, missingTrustline: null,
      collectingSeconds: 30, quotesReceived: 0
    }))

    const amountStroops = BigInt(
      Math.floor(parseFloat(amountIn) * 1e7)
    ).toString()

    try {
      const res = await fetch(`${BACKEND}/api/quote/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenIn, tokenOut,
          amountIn: amountStroops,
          takerAddress: address
        })
      })

      const data = await res.json()

      if (!res.ok) {
        // The backend pre-flights the taker before opening an auction. A missing
        // trustline is not a failure the user can retry out of — it needs an
        // on-chain ChangeTrust — so surface the asset and let the UI offer it.
        const code = data.error?.code
        setState(s => ({
          ...s,
          status: 'error',
          error: data.error?.message || 'Failed to start auction',
          missingTrustline: code === 'MISSING_TRUSTLINE'
            ? { token: data.error.token, asset: data.error.asset ?? null, code }
            : null
        }))
        return
      }

      const auctionId = data.auctionId
      setState(s => ({
        ...s,
        status:            'collecting',
        auctionId,
        makerCount:        data.makerCount,
        collectingSeconds: 30
      }))

      clearInterval(collectRef.current)
      let secs = 30
      collectRef.current = setInterval(() => {
        secs--
        setState(s => ({ ...s, collectingSeconds: Math.max(0, secs) }))
        if (secs <= 0) clearInterval(collectRef.current)
      }, 1000)

      clearInterval(pollRef.current)
      const auctionStartTime = Date.now()

      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${BACKEND}/api/quote/result/${auctionId}`)
          const d = await r.json()

          // Always update quotes received count
          if (d.quotesReceived !== undefined) {
            setState(s => ({ ...s, quotesReceived: d.quotesReceived }))
          }

          // NEVER show result before 30 seconds
          const elapsed = Date.now() - auctionStartTime
          if (elapsed < MIN_DISPLAY_WAIT_MS) {
            return
          }

          // 30s passed — now check if we have a result
          if (d.status === 'collecting') {
            return
          }

          clearInterval(pollRef.current)
          clearInterval(collectRef.current)

          if (d.status === 'completed' && d.bestQuote) {
            setState(s => ({
              ...s,
              status:            'completed',
              bestQuote:         d.bestQuote,
              collectingSeconds: 0,
              acceptSeconds:     10
            }))

            clearInterval(acceptRef.current)
            let asecs = 10
            acceptRef.current = setInterval(() => {
              asecs--
              setState(s => ({ ...s, acceptSeconds: Math.max(0, asecs) }))
              if (asecs <= 0) {
                clearInterval(acceptRef.current)
                setState(s => ({
                  ...s,
                  status: 'error',
                  error:  'Quote expired. Click Get Best Price to try again.'
                }))
              }
            }, 1000)

          } else {
            setState(s => ({
              ...s, status: 'no_quotes',
              error: 'Makers are busy right now. Try again.'
            }))
          }

        } catch { /* keep polling */ }
      }, 1000)

    } catch {
      setState(s => ({
        ...s, status: 'error',
        error: 'Network error. Is the backend running?'
      }))
    }
  }, [address, amountIn, tokenIn, tokenOut])

  // ── APPROVE SWAP ─────────────────────────────────────────────────────────────
  const approveSwap = useCallback(async () => {
    if (!state.bestQuote || !address) return
    clearInterval(acceptRef.current)
    setState(s => ({ ...s, status: 'executing' }))

    try {
      const { buildExecuteQuoteTx, signWithWallet, submitAndWait } =
        await import('@/lib/stellar')

      const xdr = await buildExecuteQuoteTx(
        state.bestQuote,
        address
      )

      const signedXdr = await signWithWallet(xdr)

      setState(s => ({ ...s, status: 'confirming' }))

      const txHash = await submitAndWait(signedXdr)

      fetch(`${BACKEND}/api/quote/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId:      state.bestQuote.quoteId,
          txHash,
          takerAddress: address
        })
      }).catch(() => {})

      setState(s => ({ ...s, status: 'success', txHash }))

    } catch (err: any) {
      if (
        err.message?.includes('cancel') ||
        err.message?.includes('denied')  ||
        err.message?.includes('reject')  ||
        err.message?.includes('User declined')
      ) {
        setState(s => ({
          ...s,
          status: state.acceptSeconds > 0 ? 'completed' : 'error',
          error:  state.acceptSeconds > 0 ? null : 'Quote expired. Try again.'
        }))
        return
      }
      setState(s => ({ ...s, status: 'error', error: err.message }))
    }
  }, [state.bestQuote, state.acceptSeconds, address])

  // ── REJECT SWAP ──────────────────────────────────────────────────────────────
  const rejectSwap = useCallback(() => {
    clearInterval(acceptRef.current)
    setState(s => ({ ...s, status: 'rejected' }))
  }, [])

  // ── CANCEL COLLECTING ────────────────────────────────────────────────────────
  const cancelAuction = useCallback(() => {
    clearInterval(collectRef.current)
    clearInterval(pollRef.current)
    setState(s => ({ ...s, status: 'idle' }))
  }, [])

  useEffect(() => () => {
    clearInterval(collectRef.current)
    clearInterval(acceptRef.current)
    clearInterval(pollRef.current)
  }, [])

  return {
    state, tokenIn, tokenOut, amountIn,
    tokenInSym, tokenOutSym,
    setAmountIn,
    swapTokenDirection,
    startAuction,
    approveSwap,
    rejectSwap,
    cancelAuction,
    resetState
  }
}
