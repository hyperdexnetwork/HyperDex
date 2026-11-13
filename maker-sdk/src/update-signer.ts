/**
 * update-signer.ts — Re-register your signing key on the pool_registry contract.
 *
 * Usage:
 *   ts-node src/update-signer.ts <cred-name> <STELLAR_SECRET_KEY>
 *
 * Example:
 *   ts-node src/update-signer.ts riju SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 *
 * This calls `update_signer(maker, new_signer_key)` on the pool_registry.
 * The transaction is signed by your Stellar account (the secret key you provide).
 * The new signer key is derived from SIGNER_PRIVATE_KEY in your .cred file.
 */

import fs from 'fs'
import path from 'path'
import nacl from 'tweetnacl'
import * as StellarSdk from '@stellar/stellar-sdk'
import chalk from 'chalk'

// Testnet only — the July 2026 mainnet deployment is deprecated.
const POOL_REGISTRY =
  process.env.POOL_REGISTRY_CONTRACT_ADDRESS ||
  process.env.POOL_REGISTRY_CONTRACT ||
  'CA4VDATAXPCSAJSDSTEZSCLVLIWMT6PYS5WJYITBQZWZ6JAFNP3Q5HNW'
const STELLAR_RPC = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org'
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET
const MAX_FEE = '1000000'

function parseCred(filePath: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    result[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  return result
}

async function main() {
  const [credName, stellarSecret] = process.argv.slice(2)

  if (!credName || !stellarSecret) {
    console.error(chalk.red('\nUsage: ts-node src/update-signer.ts <cred-name> <STELLAR_SECRET_KEY>\n'))
    console.error(chalk.gray('  Example: ts-node src/update-signer.ts riju SXXX...'))
    process.exit(1)
  }

  // ── Load cred file ──────────────────────────────────────────────────────────
  const credPath = path.join(__dirname, '../credentials', `${credName}.cred`)
  if (!fs.existsSync(credPath)) {
    console.error(chalk.red(`\n  Credential not found: credentials/${credName}.cred\n`))
    process.exit(1)
  }
  const cred = parseCred(credPath)

  const makerAddress    = cred.MAKER_ADDRESS
  const signerPrivHex   = cred.SIGNER_PRIVATE_KEY

  if (!makerAddress || !signerPrivHex) {
    console.error(chalk.red('\n  MAKER_ADDRESS or SIGNER_PRIVATE_KEY missing from cred file\n'))
    process.exit(1)
  }

  // ── Derive signer public key ────────────────────────────────────────────────
  const seed = Buffer.from(signerPrivHex, 'hex')
  if (seed.length !== 32) {
    console.error(chalk.red('\n  SIGNER_PRIVATE_KEY must be 32 bytes (64 hex chars)\n'))
    process.exit(1)
  }
  const keypair     = nacl.sign.keyPair.fromSeed(seed)
  const signerPubHex = Buffer.from(keypair.publicKey).toString('hex')

  console.log()
  console.log(chalk.hex('#7c3aed')('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(chalk.white.bold('  HyperDex — Update Signer Key'))
  console.log(chalk.hex('#7c3aed')('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(chalk.gray('  Maker:      ') + chalk.white(makerAddress))
  console.log(chalk.gray('  New signer: ') + chalk.cyan(signerPubHex))
  console.log(chalk.gray('  Registry:   ') + chalk.gray(POOL_REGISTRY.slice(0, 8) + '...'))
  console.log()

  // ── Validate Stellar secret key ─────────────────────────────────────────────
  let stellarKeypair: StellarSdk.Keypair
  try {
    stellarKeypair = StellarSdk.Keypair.fromSecret(stellarSecret)
  } catch {
    console.error(chalk.red('\n  Invalid Stellar secret key (must start with S)\n'))
    process.exit(1)
  }

  if (stellarKeypair.publicKey() !== makerAddress) {
    console.error(chalk.red('\n  Secret key does not match maker address in cred file'))
    console.error(chalk.red(`  Key public:   ${stellarKeypair.publicKey()}`))
    console.error(chalk.red(`  Maker address: ${makerAddress}`))
    console.error(chalk.gray('\n  Make sure you are providing the Stellar secret for this maker.\n'))
    process.exit(1)
  }

  // ── Build transaction ────────────────────────────────────────────────────────
  const server   = new StellarSdk.rpc.Server(STELLAR_RPC)
  const account  = await server.getAccount(makerAddress)
  const contract = new StellarSdk.Contract(POOL_REGISTRY)

  const makerScVal     = StellarSdk.Address.fromString(makerAddress).toScVal()
  const signerKeyScVal = StellarSdk.xdr.ScVal.scvBytes(Buffer.from(signerPubHex, 'hex'))

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: MAX_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('update_signer', makerScVal, signerKeyScVal))
    .setTimeout(60)
    .build()

  // ── Simulate ─────────────────────────────────────────────────────────────────
  console.log(chalk.gray('  Simulating transaction...'))
  const simResult = await server.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
    console.error(chalk.red(`\n  Simulation failed: ${(simResult as any).error}\n`))
    process.exit(1)
  }

  const preparedXdr = StellarSdk.rpc.assembleTransaction(tx, simResult).build().toXDR()

  // ── Sign ─────────────────────────────────────────────────────────────────────
  const preparedTx = StellarSdk.TransactionBuilder.fromXDR(preparedXdr, NETWORK_PASSPHRASE)
  ;(preparedTx as any).sign(stellarKeypair)
  const signedXdr = preparedTx.toXDR()

  // ── Submit ───────────────────────────────────────────────────────────────────
  console.log(chalk.gray('  Submitting transaction...'))
  const sendResp = await server.sendTransaction(StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as any)

  if (sendResp.status === 'ERROR') {
    console.error(chalk.red(`\n  Submission failed: ${JSON.stringify(sendResp.errorResult)}\n`))
    process.exit(1)
  }

  const hash = sendResp.hash
  console.log(chalk.gray('  Tx hash: ') + chalk.cyan(hash))
  console.log(chalk.gray('  Waiting for confirmation...'))

  // ── Poll for confirmation ────────────────────────────────────────────────────
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      const raw = await (server as any)._getTransaction(hash) as { status: string }
      if (raw.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
        console.log()
        console.log(chalk.green('  ✓ Signer key updated on-chain!'))
        console.log(chalk.gray('  New signer: ') + chalk.white(signerPubHex))
        console.log()
        console.log(chalk.gray('  Restart your maker SDK — it will now sign quotes correctly.'))
        console.log()
        process.exit(0)
      }
      if (raw.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
        console.error(chalk.red('\n  Transaction failed on-chain\n'))
        process.exit(1)
      }
    } catch {
      // transient
    }
  }
  console.error(chalk.red('\n  Confirmation timeout\n'))
  process.exit(1)
}

main().catch(err => {
  console.error(chalk.red('\n  Error: ' + err.message))
  process.exit(1)
})
