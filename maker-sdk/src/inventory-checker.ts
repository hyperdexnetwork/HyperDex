import * as StellarSdk from '@stellar/stellar-sdk'
import { USDC_CONTRACT, EURC_CONTRACT } from './constants'

const STELLAR_RPC = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK === 'mainnet'
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET

class InventoryChecker {
  private cache: {
    usdc: number
    eurc: number
    fetchedAt: number
  } | null = null
  private readonly cacheMs = 30_000

  private get poolAddress(): string {
    return process.env.POOL_ADDRESS || ''
  }

  private get makerAddress(): string {
    return process.env.MAKER_ADDRESS || ''
  }

  // Resolved in constants.ts, which accepts both the *_CONTRACT and
  // *_CONTRACT_ADDRESS spellings and falls back to the per-network defaults.
  // Reading process.env directly here silently yielded '' for configs using
  // the *_CONTRACT_ADDRESS spelling, so every balance read returned 0 and the
  // maker refused to quote against inventory it actually had.
  private get usdcContract(): string {
    return USDC_CONTRACT
  }

  private get eurcContract(): string {
    return EURC_CONTRACT
  }

  private get backendHttp(): string {
    return (process.env.BACKEND_WS_URL || 'wss://hyperdex.onrender.com/ws/maker')
      .replace('wss://', 'https://')
      .replace('ws://', 'http://')
      .replace('/ws/maker', '')
  }

  async getBalance(): Promise<{ usdc: number; eurc: number }> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheMs) {
      return { usdc: this.cache.usdc, eurc: this.cache.eurc }
    }

    // Try reading from pool contract directly via Soroban RPC
    if (this.poolAddress && this.makerAddress) {
      try {
        const result = await this.readFromSoroban()
        this.cache = { ...result, fetchedAt: Date.now() }
        return result
      } catch (err) {
        console.warn('[Inventory] Soroban read failed:', err)
      }
    }

    // Fallback: try backend API
    try {
      const result = await this.readFromBackend()
      this.cache = { ...result, fetchedAt: Date.now() }
      return result
    } catch (err) {
      console.warn('[Inventory] Backend read failed:', err)
    }

    // Last resort: return cached value even if stale
    if (this.cache) {
      console.warn('[Inventory] Using stale cache')
      return { usdc: this.cache.usdc, eurc: this.cache.eurc }
    }

    // Nothing works — return 0 but log clearly
    console.error('[Inventory] Cannot read balances — pool or address missing')
    console.error('[Inventory] POOL_ADDRESS:', this.poolAddress || 'NOT SET')
    console.error('[Inventory] MAKER_ADDRESS:', this.makerAddress || 'NOT SET')
    return { usdc: 0, eurc: 0 }
  }

  private async readFromSoroban(): Promise<{ usdc: number; eurc: number }> {
    const server = new StellarSdk.rpc.Server(STELLAR_RPC)
    const contract = new StellarSdk.Contract(this.poolAddress)

    const getTokenBalance = async (tokenAddress: string): Promise<number> => {
      const account = await server.getAccount(this.makerAddress)
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(contract.call(
          'get_balance',
          StellarSdk.Address.fromString(tokenAddress).toScVal(),
        ))
        .setTimeout(10)
        .build()

      const sim = await server.simulateTransaction(tx)
      if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
        return 0
      }
      if (!sim.result?.retval) return 0
      const raw = StellarSdk.scValToNative(sim.result.retval)
      return Number(raw) / 1e7
    }

    const [usdc, eurc] = await Promise.all([
      getTokenBalance(this.usdcContract).catch(() => 0),
      getTokenBalance(this.eurcContract).catch(() => 0),
    ])

    console.log(`[Inventory] Pool balances — USDC: ${usdc.toFixed(2)} | EURC: ${eurc.toFixed(2)}`)
    return { usdc, eurc }
  }

  private async readFromBackend(): Promise<{ usdc: number; eurc: number }> {
    const backendUrl = this.backendHttp || 'https://hyperdex.onrender.com'
    const res = await fetch(
      `${backendUrl}/api/makers/${this.makerAddress}/inventory`,
      { signal: AbortSignal.timeout(5000) },
    )
    const data = await res.json() as { vault?: { usdc?: string; eurc?: string } }
    return {
      usdc: parseFloat(data.vault?.usdc || '0'),
      eurc: parseFloat(data.vault?.eurc || '0'),
    }
  }

  getCachedBalance(): { usdc: number; eurc: number } {
    return this.cache
      ? { usdc: this.cache.usdc, eurc: this.cache.eurc }
      : { usdc: 0, eurc: 0 }
  }

  invalidateCache(): void {
    this.cache = null
  }

  async canFill(
    tokenOut: string,
    amountOutStroops: number,
  ): Promise<{ canFill: boolean; balance: number; reason?: string }> {
    const balance = await this.getBalance()
    const isEurc = tokenOut === this.eurcContract
    const available = isEurc ? balance.eurc : balance.usdc
    const required = amountOutStroops / 1e7
    const safeLimit = available * 0.8

    if (required > safeLimit) {
      return { canFill: false, balance: available, reason: 'insufficient_liquidity' }
    }
    return { canFill: true, balance: available }
  }
}

export const inventoryChecker = new InventoryChecker()
