import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Attach the runtime connection listeners exactly once.
 *
 * `connectDb`'s retry loop only covers the INITIAL connect. After that, driver
 * problems surface as events on `mongoose.connection` — and an EventEmitter
 * 'error' event with no registered listener is rethrown, which took the whole
 * process down on a transient Atlas DNS failure. Listening here keeps the
 * server alive and lets the driver's own reconnection logic do its job; the
 * health endpoint reports `disconnected` in the meantime via getDbStatus().
 */
let listenersBound = false;
function bindConnectionListeners(): void {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on('error', err => {
    logger.error('MongoDB connection error — staying up, driver will retry', {
      err: err instanceof Error ? err.message : String(err),
    });
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — reads and writes will fail until it recovers');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
}

export async function connectDb(): Promise<void> {
  bindConnectionListeners();

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(config.MONGODB_URI, {
        dbName: config.MONGODB_DB_NAME,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });
      logger.info('MongoDB connected', { uri: config.MONGODB_URI.replace(/\/\/.*@/, '//***@') });
      return;
    } catch (err) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        throw new Error(`MongoDB connection failed after ${MAX_RETRIES} attempts: ${err}`);
      }
      logger.warn(`MongoDB connection attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms`, { err });
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export function getDbStatus(): 'connected' | 'disconnected' {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}
