import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Expose {@link CacheService} partout. S'appuie sur le `CacheModule` global
 * (cache-manager + Redis) configuré dans `AppModule` via `redisConfig`.
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class AppCacheModule {}
