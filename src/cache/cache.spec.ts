import type Redis from 'ioredis';
import { CacheService } from './cache.module';
describe('optional Redis cache', () => {
  const data = new Map<string, string>();
  const redis = {
    status: 'ready',
    get: jest.fn(async (key: string) => data.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
      return 'OK';
    }),
  };
  const cache = new CacheService(redis as unknown as Redis);
  beforeEach(() => {
    data.clear();
    jest.clearAllMocks();
    redis.status = 'ready';
  });
  it('uses cached results and applies an expiry', async () => {
    const load = jest.fn().mockResolvedValue([{ id: 'doctor' }]);
    await cache.remember('doctors', '0:20', 30, load);
    expect(await cache.remember('doctors', '0:20', 30, load)).toEqual([
      { id: 'doctor' },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'EX',
      30,
    );
  });
  it('changes cache generations after mutations', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce(['old'])
      .mockResolvedValueOnce(['new']);
    await cache.remember('doctors', '0:20', 30, load);
    await cache.invalidate('doctors');
    expect(await cache.remember('doctors', '0:20', 30, load)).toEqual(['new']);
  });
  it('falls back immediately when Redis is disconnected', async () => {
    redis.status = 'reconnecting';
    expect(
      await cache.remember('doctors', '0:20', 30, async () => ['database']),
    ).toEqual(['database']);
    expect(redis.get).not.toHaveBeenCalled();
  });
  it('falls back when Redis commands fail', async () => {
    redis.get.mockRejectedValueOnce(new Error('offline'));
    expect(
      await cache.remember('doctors', '0:20', 30, async () => ['database']),
    ).toEqual(['database']);
  });
  it('does not swallow database errors', async () => {
    await expect(
      cache.remember('doctors', '0:20', 30, async () => {
        throw new Error('database down');
      }),
    ).rejects.toThrow('database down');
  });
});
