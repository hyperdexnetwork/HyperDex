import { rateLimiter } from './rate-limiter';

const TAKER_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TAKER_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

describe('rateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is not limited for an unknown taker', () => {
    expect(rateLimiter.isLimited('GUNKNOWN')).toBe(false);
  });

  it('setLimit makes isLimited true until the expiry passes', () => {
    rateLimiter.setLimit(TAKER_A, Date.now() + 60_000);
    expect(rateLimiter.isLimited(TAKER_A)).toBe(true);

    jest.advanceTimersByTime(59_999);
    expect(rateLimiter.isLimited(TAKER_A)).toBe(true);

    jest.advanceTimersByTime(2);
    expect(rateLimiter.isLimited(TAKER_A)).toBe(false);
  });

  it('keeps different taker addresses independent', () => {
    rateLimiter.setLimit(TAKER_A, Date.now() + 60_000);
    expect(rateLimiter.isLimited(TAKER_A)).toBe(true);
    expect(rateLimiter.isLimited(TAKER_B)).toBe(false);

    rateLimiter.setLimit(TAKER_B, Date.now() + 120_000);
    jest.advanceTimersByTime(60_001);
    expect(rateLimiter.isLimited(TAKER_A)).toBe(false);
    expect(rateLimiter.isLimited(TAKER_B)).toBe(true);
  });
});
