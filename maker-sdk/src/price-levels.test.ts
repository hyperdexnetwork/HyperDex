import { buildPriceLevels } from './price-levels';
import { setGhostPrice } from './ghost-price';

const STROOPS = 1e7;
const totalQuantity = (levels: { quantity: string }[]): number =>
  levels.reduce((sum, l) => sum + Number(l.quantity), 0);

describe('buildPriceLevels', () => {
  beforeEach(() => {
    setGhostPrice(0.92);
  });

  afterAll(() => {
    setGhostPrice(0);
  });

  it('passes the token pair through', () => {
    const msg = buildPriceLevels('USDC', 'EURC', { usdc: 100, eurc: 100 });
    expect(msg.tokenIn).toBe('USDC');
    expect(msg.tokenOut).toBe('EURC');
  });

  it('caps liquidity at 80% of each vault balance', () => {
    const msg = buildPriceLevels('USDC', 'EURC', { usdc: 200, eurc: 50 });
    // eurc 50 * 0.8 = 40 on the sell side, usdc 200 * 0.8 = 160 on the buy side
    expect(totalQuantity(msg.sellLevels)).toBe(40 * STROOPS);
    expect(totalQuantity(msg.buyLevels)).toBe(160 * STROOPS);
  });

  it('never offers more than 80% even for a large balance', () => {
    const msg = buildPriceLevels('USDC', 'EURC', { usdc: 1_000, eurc: 300 });
    expect(totalQuantity(msg.sellLevels)).toBeLessThanOrEqual(300 * 0.8 * STROOPS);
    expect(totalQuantity(msg.buyLevels)).toBeLessThanOrEqual(1_000 * 0.8 * STROOPS);
  });

  it('gives zero liquidity for a zero balance', () => {
    const msg = buildPriceLevels('USDC', 'EURC', { usdc: 0, eurc: 0 });
    expect(msg.sellLevels).toEqual([]);
    expect(msg.buyLevels).toEqual([]);
  });

  it('gives zero liquidity only on the side whose balance is zero', () => {
    const msg = buildPriceLevels('USDC', 'EURC', { usdc: 100, eurc: 0 });
    expect(msg.sellLevels).toEqual([]);
    expect(totalQuantity(msg.buyLevels)).toBe(80 * STROOPS);
  });

  it('uses the ghost price for each side', () => {
    const msg = buildPriceLevels('USDC', 'EURC', { usdc: 100, eurc: 100 });
    expect(msg.sellLevels[0].price).toBe((0.92).toFixed(8));
    expect(msg.buyLevels[0].price).toBe((1 / 0.92).toFixed(8));
  });
});
