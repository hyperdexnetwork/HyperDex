import { Maker } from '../db/models/Maker';
import { Trade } from '../db/models/Trade';
import { ITrade } from '../db/models/Trade';
import { logger } from '../utils/logger';
import { toUsd } from '../utils/money';

export class StatsUpdater {
  async updateAfterConfirmedTrade(trade: ITrade): Promise<void> {
    try {
      const usdValue = toUsd(trade.amountIn, trade.tokenIn) ?? 0;
      const feeAmountUsd = toUsd(trade.feeAmount, trade.tokenOut) ?? 0;

      await Maker.findOneAndUpdate(
        { stellarAddress: trade.makerAddress },
        {
          $inc: {
            totalTrades: 1,
            totalVolume: usdValue,
            totalFeesEarned: feeAmountUsd,
          },
          $set: { updatedAt: new Date() },
        }
      );

      logger.info('Maker stats updated after confirmed trade', {
        makerAddress: trade.makerAddress,
        quoteId: trade.quoteId,
        usdValue,
      });
    } catch (err) {
      // Stats update failure must not block trade confirmation
      logger.error('Failed to update maker stats', {
        makerAddress: trade.makerAddress,
        quoteId: trade.quoteId,
        error: (err as Error).message,
      });
    }
  }

  async recalculateMakerStats(makerAddress: string): Promise<void> {
    const trades = await Trade.find({
      makerAddress,
      status: 'confirmed',
    }).lean();

    let totalTrades = 0;
    let totalVolume = 0;
    let totalFeesEarned = 0;

    for (const trade of trades) {
      totalTrades += 1;
      // toUsd returns null rather than throwing on a malformed amount. The old
      // BigInt() call here threw on any trade whose amountIn had been corrupted
      // by the event-parsing bug, which meant the recovery path for bad stats
      // was itself unusable. Skip what can't be parsed and keep going.
      const usdValue = toUsd(trade.amountIn, trade.tokenIn);
      if (usdValue !== null) totalVolume += usdValue;
      const feeUsd = toUsd(trade.feeAmount, trade.tokenOut);
      if (feeUsd !== null) totalFeesEarned += feeUsd;
    }

    await Maker.findOneAndUpdate(
      { stellarAddress: makerAddress },
      { $set: { totalTrades, totalVolume, totalFeesEarned, updatedAt: new Date() } }
    );

    logger.info('Maker stats recalculated', { makerAddress, totalTrades, totalVolume });
  }
}
