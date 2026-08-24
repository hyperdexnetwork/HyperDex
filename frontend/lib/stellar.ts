import type { BackendQuote } from './types';
import {
  STELLAR_RPC_URL,
  QUOTE_VERIFIER_CONTRACT,
  POOL_REGISTRY_CONTRACT,
  FEE_DISTRIBUTOR_CONTRACT,
  USDC_CONTRACT,
  EURC_CONTRACT,
  FREIGHTER_NETWORK,
  NETWORK_PASSPHRASE,
  HORIZON_URL,
} from './constants';

const MAX_FEE = '1000000';

function buildQuoteScVal(quote: ExecuteQuoteInput, xdrMod: typeof import('@stellar/stellar-sdk').xdr, nativeToScVal: typeof import('@stellar/stellar-sdk').nativeToScVal, Address: typeof import('@stellar/stellar-sdk').Address) {
  const entry = (key: string, val: import('@stellar/stellar-sdk').xdr.ScVal): import('@stellar/stellar-sdk').xdr.ScMapEntry =>
    new xdrMod.ScMapEntry({ key: xdrMod.ScVal.scvSymbol(key), val });

  return xdrMod.ScVal.scvMap([
    entry('amount_in',  nativeToScVal(BigInt(quote.amountIn),       { type: 'i128' })),
    entry('amount_out', nativeToScVal(BigInt(quote.amountOut),      { type: 'i128' })),
    entry('expiry',     nativeToScVal(BigInt(quote.expiryTimestamp),{ type: 'u64' })),
    entry('maker',      new Address(quote.makerAddress).toScVal()),
    entry('quote_id',   xdrMod.ScVal.scvBytes(Buffer.from(quote.quoteId, 'hex'))),
    entry('salt',       xdrMod.ScVal.scvBytes(Buffer.from(quote.salt, 'hex'))),
    entry('taker',      new Address(quote.takerAddress).toScVal()),
    entry('token_in',   new Address(quote.tokenIn).toScVal()),
    entry('token_out',  new Address(quote.tokenOut).toScVal()),
  ]);
}

async function getSdk() {
  const sdk = await import('@stellar/stellar-sdk');
  return sdk;
}

type ExecuteQuoteInput = Pick<BackendQuote, 'amountIn' | 'amountOut' | 'expiryTimestamp' | 'makerAddress' | 'takerAddress' | 'tokenIn' | 'tokenOut' | 'quoteId' | 'salt' | 'signature'>

export async function buildExecuteQuoteTx(quote: ExecuteQuoteInput, takerAddress: string): Promise<string> {
  const sdk = await getSdk();
  const { Contract, TransactionBuilder, Networks, xdr, Address, nativeToScVal, rpc } = sdk;

  const rpcServer = new rpc.Server(STELLAR_RPC_URL);
  const account = await rpcServer.getAccount(takerAddress);

  const quoteScVal = buildQuoteScVal(quote, xdr, nativeToScVal, Address);
  const sigScVal = xdr.ScVal.scvBytes(Buffer.from(quote.signature, 'hex'));

  const contract = new Contract(QUOTE_VERIFIER_CONTRACT);
  const op = contract.call('execute_quote', quoteScVal, sigScVal);

  const tx = new TransactionBuilder(account, {
    fee: MAX_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${(simResult as { error: string }).error}`);
  }

  return rpc.assembleTransaction(tx, simResult).build().toXDR();
}

export async function getOnChainSignerKey(makerAddress: string): Promise<string | null> {
  try {
    const sdk = await getSdk();
    const { Contract, TransactionBuilder, Address, rpc } = sdk;

    const rpcServer = new rpc.Server(STELLAR_RPC_URL);
    const account = await rpcServer.getAccount(makerAddress);

    const contract = new Contract(POOL_REGISTRY_CONTRACT);
    const op = contract.call('get_signer_key', new Address(makerAddress).toScVal());

    const tx = new TransactionBuilder(account, {
      fee: MAX_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const simResult = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simResult)) return null;

    const retval = (simResult as { result?: { retval: import('@stellar/stellar-sdk').xdr.ScVal } }).result?.retval;
    if (!retval) return null;

    const bytes = retval.bytes();
    return Buffer.from(bytes).toString('hex');
  } catch {
    return null;
  }
}

export async function buildUpdateSignerTx(makerAddress: string, newSignerPubKeyHex: string): Promise<string> {
  const sdk = await getSdk();
  const { Contract, TransactionBuilder, xdr, Address, rpc } = sdk;

  const rpcServer = new rpc.Server(STELLAR_RPC_URL);
  const account = await rpcServer.getAccount(makerAddress);

  const makerScVal      = new Address(makerAddress).toScVal();
  const signerKeyScVal  = xdr.ScVal.scvBytes(Buffer.from(newSignerPubKeyHex, 'hex'));

  const contract = new Contract(POOL_REGISTRY_CONTRACT);
  const op = contract.call('update_signer', makerScVal, signerKeyScVal);

  const tx = new TransactionBuilder(account, {
    fee: MAX_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${(simResult as { error: string }).error}`);
  }

  return rpc.assembleTransaction(tx, simResult).build().toXDR();
}

export async function buildRegisterMakerTx(makerAddress: string, signerKey: string): Promise<string> {
  const sdk = await getSdk();
  const { Contract, TransactionBuilder, xdr, Address, rpc } = sdk;

  const rpcServer = new rpc.Server(STELLAR_RPC_URL);
  const account = await rpcServer.getAccount(makerAddress);

  const makerScVal = new Address(makerAddress).toScVal();
  const signerKeyScVal = xdr.ScVal.scvBytes(Buffer.from(signerKey, 'hex'));

  const pairUE = xdr.ScVal.scvVec([new Address(USDC_CONTRACT).toScVal(), new Address(EURC_CONTRACT).toScVal()]);
  const pairEU = xdr.ScVal.scvVec([new Address(EURC_CONTRACT).toScVal(), new Address(USDC_CONTRACT).toScVal()]);
  const pairsScVal = xdr.ScVal.scvVec([pairUE, pairEU]);

  const contract = new Contract(POOL_REGISTRY_CONTRACT);
  const op = contract.call('register_maker', makerScVal, signerKeyScVal, pairsScVal);

  const tx = new TransactionBuilder(account, {
    fee: MAX_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${(simResult as { error: string }).error}`);
  }

  return rpc.assembleTransaction(tx, simResult).build().toXDR();
}


/**
 * Read a SAC token balance held by a *contract* address (e.g. fee_distributor)
 * straight from ledger storage — no source account or wallet needed.
 * SACs store contract-holder balances under the key ["Balance", Address].
 */
export async function getContractTokenBalance(
  tokenContract: string,
  holderContract: string,
): Promise<bigint> {
  const sdk = await getSdk();
  const { Address, xdr, rpc, scValToNative } = sdk;

  const rpcServer = new rpc.Server(STELLAR_RPC_URL);
  const key = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Balance'),
    new Address(holderContract).toScVal(),
  ]);

  try {
    const entry = await rpcServer.getContractData(tokenContract, key, rpc.Durability.Persistent);
    const val = entry.val.contractData().val();
    const native = scValToNative(val) as { amount?: bigint } | bigint;
    if (typeof native === 'bigint') return native;
    return native.amount ?? 0n;
  } catch {
    // No balance entry means the contract has never received this token.
    return 0n;
  }
}

/** Accumulated protocol fees currently sitting in the fee_distributor contract. */
export async function getProtocolFeeBalances(): Promise<{ usdc: bigint; eurc: bigint }> {
  if (!FEE_DISTRIBUTOR_CONTRACT) return { usdc: 0n, eurc: 0n };
  const [usdc, eurc] = await Promise.all([
    getContractTokenBalance(USDC_CONTRACT, FEE_DISTRIBUTOR_CONTRACT),
    getContractTokenBalance(EURC_CONTRACT, FEE_DISTRIBUTOR_CONTRACT),
  ]);
  return { usdc, eurc };
}

/** Build fee_distributor.withdraw_fees(token) — must be signed by the admin wallet. */
export async function buildWithdrawFeesTx(adminAddress: string, tokenContract: string): Promise<string> {
  const sdk = await getSdk();
  const { Contract, TransactionBuilder, Address, rpc } = sdk;

  const rpcServer = new rpc.Server(STELLAR_RPC_URL);
  const account = await rpcServer.getAccount(adminAddress);

  const contract = new Contract(FEE_DISTRIBUTOR_CONTRACT);
  const op = contract.call('withdraw_fees', new Address(tokenContract).toScVal());

  const tx = new TransactionBuilder(account, {
    fee: MAX_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${(simResult as { error: string }).error}`);
  }

  return rpc.assembleTransaction(tx, simResult).build().toXDR();
}

/**
 * Build a ChangeTrust transaction so the connected wallet can hold a classic
 * asset. Stellar refuses to deliver a non-native asset to an account without a
 * trustline, which is why a swap into an asset the wallet has never held fails
 * inside the token contract rather than at validation time.
 *
 * `assetName` is the SAC's own asset string, "CODE:ISSUER", as returned by the
 * backend's pre-flight check.
 */
export async function buildAddTrustlineTx(
  accountAddress: string,
  assetName: string,
): Promise<string> {
  const [code, issuer] = assetName.split(':');
  if (!code || !issuer) throw new Error(`Cannot parse asset "${assetName}"`);

  const sdk = await getSdk();
  const { TransactionBuilder, Operation, Asset, Horizon } = sdk;

  // ChangeTrust is a classic operation, so it goes through Horizon rather than
  // the Soroban RPC used for contract calls.
  const horizon = new Horizon.Server(HORIZON_URL);
  const account = await horizon.loadAccount(accountAddress);

  return new TransactionBuilder(account, {
    fee: MAX_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(code, issuer) }))
    .setTimeout(120)
    .build()
    .toXDR();
}

/** Submit a signed classic transaction (e.g. ChangeTrust) via Horizon. */
export async function submitClassicTransaction(signedXdr: string): Promise<string> {
  const sdk = await getSdk();
  const { Transaction, Horizon } = sdk;
  const horizon = new Horizon.Server(HORIZON_URL);
  const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

export async function submitTransaction(signedXdr: string): Promise<string> {
  const sdk = await getSdk();
  const { Transaction, rpc } = sdk;

  const rpcServer = new rpc.Server(STELLAR_RPC_URL);
  const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);

  const response = await rpcServer.sendTransaction(tx);
  if (response.status === 'ERROR') {
    throw new Error(`Submission failed: ${JSON.stringify(response.errorResult)}`);
  }
  return response.hash;
}

export async function submitAndWait(signedXdr: string): Promise<string> {
  const sdk = await getSdk();
  const { Transaction, rpc } = sdk;
  const rpcServer = new rpc.Server(STELLAR_RPC_URL);
  const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);
  const response = await rpcServer.sendTransaction(tx);
  if (response.status === 'ERROR') {
    throw new Error(`Submission failed: ${JSON.stringify(response.errorResult)}`);
  }
  if (response.status === 'TRY_AGAIN_LATER') {
    throw new Error('Network busy — please retry your swap');
  }
  const hash = response.hash;
  // Poll for confirmation using raw RPC (avoids XDR-parse failures on testnet).
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, i < 10 ? 2000 : 5000));
    try {
      const raw = await (rpcServer as any)._getTransaction(hash) as { status: string };
      if (raw.status === rpc.Api.GetTransactionStatus.SUCCESS) return hash;
      if (raw.status === rpc.Api.GetTransactionStatus.FAILED)  throw new Error('Transaction failed on-chain');
    } catch (e: any) {
      if (e.message === 'Transaction failed on-chain') throw e;
      // transient network / parse error — keep polling
    }
  }
  throw new Error('Transaction confirmation timeout');
}

/**
 * Wallet access now goes through Stellar Wallets Kit (see lib/wallet/kit.ts),
 * so these are thin re-exports rather than Freighter calls. The names are
 * wallet-agnostic because the app is no longer Freighter-only.
 */
export { getWalletAddress, disconnectWallet } from './wallet/kit';

/** True once the user has a wallet selected and readable. */
export async function isWalletConnected(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const { getWalletAddress } = await import('./wallet/kit');
  return (await getWalletAddress()) !== '';
}

export async function connectWalletById(walletId: string): Promise<string> {
  const { connectWallet } = await import('./wallet/kit');
  return connectWallet(walletId);
}

/**
 * Sign an XDR with the connected wallet.
 *
 * Guards against the #1 cause of txBadAuth: signing on a different network than
 * the transaction was built for. Wallets that expose their network get checked
 * first; those that don't (hardware, some bridges) fall through to the signature
 * attempt itself.
 */
export async function signWithWallet(txXdr: string): Promise<string> {
  const { signWithWallet: sign, getWalletNetworkPassphrase } = await import('./wallet/kit');

  const walletNetwork = await getWalletNetworkPassphrase();
  if (walletNetwork && walletNetwork !== NETWORK_PASSPHRASE) {
    const want = FREIGHTER_NETWORK === 'PUBLIC' ? 'Mainnet (Public)' : 'Testnet';
    throw new Error(
      `Your wallet is connected to the wrong network. Switch it to ${want}, then try again.`
    );
  }

  return sign(txXdr);
}

export function stroopsToHuman(stroops: string | bigint, decimals = 7): string {
  // Handle already-human-readable decimal strings (e.g. '40.0025000' from legacy Horizon responses)
  if (typeof stroops === 'string' && stroops.includes('.')) {
    const n = parseFloat(stroops);
    if (isNaN(n)) return '0';
    return n.toFixed(decimals).replace(/\.?0+$/, '') || '0';
  }
  const s = BigInt(stroops);
  const factor = BigInt(10 ** decimals);
  const whole = s / factor;
  const frac = s % factor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

export function humanToStroops(human: string, decimals = 7): bigint {
  const [whole, frac = ''] = human.split('.');
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded);
}
