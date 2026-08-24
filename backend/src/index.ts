import { config } from './config';
import { connectDb, disconnectDb } from './db/connection';
import { PendingMaker } from './db/models/PendingMaker';
import { PriceBook } from './pricebook/PriceBook';
import { MakerConnectionRegistry } from './websocket/MakerConnection';
import { attachWsServer } from './websocket/WsServer';
import { mountRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './utils/logger';
import { startProtocolFeeRefresher } from './utils/protocolFee';
import { ConfirmationPoller } from './poller/ConfirmationPoller';
import { StellarTxFetcher } from './poller/StellarTxFetcher';
import { EventParser } from './poller/EventParser';
import { StatsUpdater } from './poller/StatsUpdater';
import * as StellarSdk from '@stellar/stellar-sdk';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { CORS_ORIGIN_LIST } from './config';

async function bootstrap(): Promise<void> {
  // 1. Connect to MongoDB
  await connectDb();

  // 2. Initialize singletons
  PriceBook.getInstance();
  MakerConnectionRegistry.getInstance();

  // 2b. Start confirmation poller
  const networkPassphrase = config.STELLAR_NETWORK === 'mainnet'
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;
  const fetcher = new StellarTxFetcher(config.STELLAR_RPC_URL, networkPassphrase);
  const parser = new EventParser(config.QUOTE_VERIFIER_CONTRACT_ADDRESS);
  const statsUpdater = new StatsUpdater();
  const poller = new ConfirmationPoller(fetcher, parser, statsUpdater);
  poller.start();

  // 2c. Track the protocol fee from the contract rather than trusting the env
  // copy — an admin calling set_fee_bps must not silently desync our quotes.
  startProtocolFeeRefresher();

  // 3. Express app
  const app = express();
  app.use(cors({
    origin: CORS_ORIGIN_LIST,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
    credentials: true,
  }));
  app.use(express.json());
  app.use(requestLogger);

  // 4. Routes
  mountRoutes(app);

  // 5. Error handler (must be last)
  app.use(errorHandler);

  // 6. HTTP server
  const httpServer = createServer(app);

  // 7. WebSocket server
  attachWsServer(httpServer);

  // 8. Start listening
  await new Promise<void>(resolve => {
    httpServer.listen(config.PORT, () => resolve());
  });

  logger.info(`HyperDEX Backend running on port ${config.PORT}`, {
    env: config.NODE_ENV,
    network: config.STELLAR_NETWORK,
  });

  // Cleanup: clear generatedApiKey from PendingMaker records older than 24h
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await PendingMaker.updateMany(
        { generatedApiKey: { $ne: null }, apiKeyGeneratedAt: { $lt: cutoff } },
        { $set: { generatedApiKey: null } }
      );
    } catch (e) {
      logger.error('API key cleanup job failed', { error: e });
    }
  }, 60 * 60 * 1000);

  // 9. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);

    poller.stop();

    // Close WS connections
    const registry = MakerConnectionRegistry.getInstance();
    for (const conn of registry.getActiveMakers()) {
      conn.close(1001, 'Server shutting down');
    }

    httpServer.close(async () => {
      await disconnectDb();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  // A rejected driver promise is usually a transient dependency blip, and an
  // exchange backend going down for one is worse than serving errors briefly.
  // Log loudly and stay up; the health endpoint reports degraded dependencies.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection — process kept alive', {
      err: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // An uncaught exception is different: the process is in an undefined state —
  // possibly a half-applied write, an orphaned timer, a leaked socket. Node
  // documents resuming as unsafe. Log, drain, and exit non-zero so the
  // supervisor restarts us clean rather than serving from corrupted state.
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — shutting down', { err: err.message, stack: err.stack });
    try {
      poller.stop();
      httpServer.close();
    } catch {
      // Already tearing down — nothing useful left to do.
    }
    setTimeout(() => process.exit(1), 1_000).unref?.();
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
