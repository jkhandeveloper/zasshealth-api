import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { SETTINGS, type Settings } from '../config';
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}
  onModuleInit() {
    if (!this.client) return;
    let reported = false;
    this.client.on('error', () => {
      if (!reported)
        this.logger.warn(
          'Redis unavailable; serving uncached database results',
        );
      reported = true;
    });
    this.client.on('ready', () => {
      reported = false;
    });
    void this.client.connect().catch(() => undefined);
  }
  onModuleDestroy() {
    this.client?.disconnect();
  }
  async remember<T>(
    namespace: string,
    key: string,
    seconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    if (this.client?.status !== 'ready') return loader();
    let cacheKey: string;
    try {
      const revision =
        (await this.client.get('zasshealth:revision:' + namespace)) ??
        'initial';
      cacheKey = 'zasshealth:cache:' + namespace + ':' + revision + ':' + key;
      const cached = await this.client.get(cacheKey);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch {
      return loader();
    }
    // Database failures propagate; only cache failures are tolerated.
    const value = await loader();
    try {
      await this.client.set(cacheKey, JSON.stringify(value), 'EX', seconds);
    } catch {
      /* Cache is optional. */
    }
    return value;
  }
  async invalidate(namespace: string) {
    if (this.client?.status !== 'ready') return;
    try {
      // New generations prevent an in-flight stale read from repopulating current keys.
      await this.client.set('zasshealth:revision:' + namespace, randomUUID());
    } catch {
      /* Entries also have a short TTL if invalidation cannot be delivered. */
    }
  }
}
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [SETTINGS],
      useFactory: (settings: Settings) =>
        settings.redisUrl
          ? new Redis(settings.redisUrl, {
              lazyConnect: true,
              enableOfflineQueue: false,
              maxRetriesPerRequest: 0,
              connectTimeout: 1000,
              commandTimeout: 300,
              retryStrategy: (attempts) => Math.min(attempts * 500, 5000),
            })
          : null,
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class CacheModule {}
