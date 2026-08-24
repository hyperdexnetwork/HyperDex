import { IncomingMessage as HttpIncomingMessage, Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import bcrypt from 'bcrypt';
import { ApiKey } from '../db/models/ApiKey';
import { Maker } from '../db/models/Maker';
import { MakerConnection, MakerConnectionRegistry } from './MakerConnection';
import { PriceBook } from '../pricebook/PriceBook';
import { IncomingMessageSchema } from './messages/incoming';
import { onPriceLevels } from './handlers/onPriceLevels';
import { onRfqQuote } from './handlers/onRfqQuote';
import { onRfqError } from './handlers/onError';
import { onTradeAck } from './handlers/onTradeAck';
import { config, CORS_ORIGIN_LIST } from '../config';
import { rateLimitStore } from '../rfq/RateLimitStore';
import { getOnChainSignerKey, startSignerKeyWarmer } from '../utils/stellarUtils';
import { logger } from '../utils/logger';

export function attachWsServer(httpServer: HttpServer): WebSocketServer {
  // maxPayload caps inbound frame size (64KB). Prevents memory-exhaustion DoS
  // from oversized maker messages and hardens against the ws fragmentation CVE.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const registry = MakerConnectionRegistry.getInstance();

  // Refresh every connected maker's signer key ahead of the 60s cache TTL.
  startSignerKeyWarmer(() => registry.getActiveMakers().map(c => c.makerAddress));

  // Upgrade only on /ws/maker path
  httpServer.on('upgrade', (req: HttpIncomingMessage, socket, head) => {
    const url = req.url ?? '';
    if (!url.startsWith('/ws/maker')) {
      socket.destroy();
      return;
    }

    // Origin allow-list. Deliberately skipped when the header is ABSENT: makers
    // connect from non-browser clients that never send one. This is defence in
    // depth against a hostile page, not the security boundary — API-key auth
    // below is what actually gates the connection.
    const origin = req.headers.origin ?? '';
    if (origin && !CORS_ORIGIN_LIST.includes(origin) && config.NODE_ENV === 'production') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (ws: WebSocket, req: HttpIncomingMessage) => {
    const authHeader = req.headers['authorization'] ?? '';
    const makerName = (req.headers['marketmaker'] as string) ?? 'unknown';
    const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!rawKey) {
      ws.send(JSON.stringify({ type: 'error', code: 'AUTH_REQUIRED', message: 'Missing API key' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Authenticate
    let conn: MakerConnection;
    try {
      const prefix = rawKey.slice(0, 15);
      const apiKeyDocs = await ApiKey.find({ keyPrefix: prefix, active: true });
      let matchedApiKey = null;
      for (const doc of apiKeyDocs) {
        if (await bcrypt.compare(rawKey, doc.keyHash)) {
          matchedApiKey = doc;
          break;
        }
      }
      if (!matchedApiKey) throw new Error('Invalid API key');

      const maker = await Maker.findById(matchedApiKey.makerId);
      if (!maker || !maker.active) throw new Error('Maker not active');

      // Update lastUsedAt
      await ApiKey.findByIdAndUpdate(matchedApiKey._id, { lastUsedAt: new Date() });

      conn = new MakerConnection(ws, maker._id.toString(), maker.stellarAddress, maker.name);
      conn.isAuthenticated = true;
      registry.register(maker._id.toString(), conn);

      // Prime the on-chain signer key now, so this maker's first bid isn't the
      // one that pays for the RPC round-trips inside the auction deadline.
      void getOnChainSignerKey(maker.stellarAddress, true).catch(() => {});

      // Update maker connection status
      await Maker.findByIdAndUpdate(maker._id, {
        connectionStatus: 'connected',
        lastSeenAt: new Date(),
      });

      conn.send({
        type: 'connected',
        message: {
          makerId: maker._id.toString(),
          makerName: maker.name,
          serverTime: Date.now(),
          supportedPairs: maker.supportedPairs,
        },
      });

      logger.info('Maker connected', {
        makerId: maker._id.toString(),
        name: maker.name,
        ip: req.socket.remoteAddress,
      });
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', code: 'AUTH_FAILED', message: 'Authentication failed' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Ping/pong heartbeat
    let pongTimeout: ReturnType<typeof setTimeout> | null = null;

    const pingInterval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      conn.send({ type: 'ping', timestamp: Date.now() });

      pongTimeout = setTimeout(async () => {
        logger.warn('Maker pong timeout — disconnecting', { makerId: conn.makerId });
        PriceBook.getInstance().markStale(conn.makerId);
        await Maker.findOneAndUpdate(
          { stellarAddress: conn.makerAddress },
          { connectionStatus: 'disconnected', lastSeenAt: new Date() }
        );
        ws.terminate();
      }, config.WS_PONG_TIMEOUT_MS);
    }, config.WS_PING_INTERVAL_MS);

    // Per-connection inbound rate limit (token bucket). Even though the socket is
    // authenticated, a single maker — or a leaked key — could otherwise flood
    // rfqQuote/priceLevels frames and burn the event loop on parses, DB reads, and
    // ed25519 verifies. The check runs BEFORE JSON.parse so over-limit frames cost
    // nothing, and a connection that floods persistently is torn down.
    const RATE = config.WS_MAX_MESSAGES_PER_SEC;
    const BURST = config.WS_MESSAGE_BURST;
    let tokens = BURST;
    let lastRefill = Date.now();
    let floodStrikes = 0;

    // Message handler
    ws.on('message', (data) => {
      const now = Date.now();
      tokens = Math.min(BURST, tokens + ((now - lastRefill) / 1000) * RATE);
      lastRefill = now;

      if (tokens < 1) {
        // Over the limit — drop the frame unparsed. Sustained abuse (BURST frames
        // dropped in a row without a single accepted one) closes the connection.
        if (++floodStrikes >= BURST) {
          logger.warn('Maker exceeded WS message rate — disconnecting', {
            makerId: conn.makerId,
            name: conn.makerName,
          });
          ws.close(4008, 'Message rate exceeded');
        }
        return;
      }
      tokens -= 1;
      floodStrikes = 0;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }

      const result = IncomingMessageSchema.safeParse(parsed);
      if (!result.success) {
        logger.debug('Unknown WS message from maker', { makerId: conn.makerId });
        return;
      }

      const msg = result.data;
      if (msg.type === 'pong') {
        if (pongTimeout) clearTimeout(pongTimeout);
        conn.lastPongAt = new Date();
        Maker.findOneAndUpdate(
          { stellarAddress: conn.makerAddress },
          { lastSeenAt: new Date() }
        ).exec();
        return;
      }
      if (msg.type === 'priceLevels') return onPriceLevels(conn, msg);
      if (msg.type === 'rfqQuote') return onRfqQuote(conn, msg);
      if (msg.type === 'rfqError') return onRfqError(conn, msg);
      if (msg.type === 'tradeAck') return onTradeAck(conn, msg);
    });

    const cleanup = async () => {
      clearInterval(pingInterval);
      if (pongTimeout) clearTimeout(pongTimeout);

      // Only tear down registry/pricebook state if THIS socket is still the
      // registered connection for the maker. On a reconnect, a newer socket may
      // have already replaced this one under the same makerId — in that case the
      // old socket's (often delayed) close event must NOT wipe the live
      // connection, or the maker shows "offline" while actively quoting.
      if (registry.getConnection(conn.makerId) !== conn) {
        logger.info('Stale maker socket closed — keeping live connection', {
          makerId: conn.makerId,
          name: conn.makerName,
        });
        return;
      }

      registry.unregister(conn.makerId);
      PriceBook.getInstance().removeMaker(conn.makerId);
      rateLimitStore.clearMaker(conn.makerId);
      await Maker.findOneAndUpdate(
        { stellarAddress: conn.makerAddress },
        { connectionStatus: 'disconnected' }
      );
      logger.info('Maker disconnected', { makerId: conn.makerId, name: conn.makerName });
    };

    ws.on('close', cleanup);
    ws.on('error', (err) => {
      logger.warn('WebSocket error', { makerId: conn.makerId, err: err.message });
    });
  });

  return wss;
}
