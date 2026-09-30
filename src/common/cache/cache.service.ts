import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { withTimeout } from '../utils/with-timeout.util';
import { DEFAULT_CACHE_TTL_SECONDS } from './cache.keys';

/** Délai max d'une opération de cache : au-delà, on sert depuis la source. */
const CACHE_OP_TIMEOUT_MS = 500;

/**
 * Cache applicatif (pattern cache-aside) au-dessus du CacheModule Redis.
 *
 * Principes :
 * - OPT-IN : seules les lectures explicitement passées par `getOrSet` sont cachées.
 *   Ne cacher que des données lues souvent et modifiées rarement.
 * - INVALIDATION EXPLICITE : tout service qui écrit une ressource cachée appelle
 *   `del()` sur les clés concernées (cf. `cacheKey`) juste après l'écriture.
 * - FAIL-OPEN : Redis indisponible ou lent ne casse jamais une lecture — on log un
 *   avertissement et on interroge directement la source (PostgreSQL).
 * - `null` / `undefined` ne sont jamais mis en cache (pas de « 404 collant »).
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * Retourne la valeur en cache si présente ; sinon exécute `loader`, met le
   * résultat en cache pour `ttlSeconds` et le retourne.
   */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = await loader();
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttlSeconds);
    }
    return value;
  }

  /** Lit une clé ; `undefined` si absente OU si Redis est indisponible. */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await withTimeout(
        this.cache.get<T>(key),
        CACHE_OP_TIMEOUT_MS,
      );
      return value ?? undefined;
    } catch (err) {
      this.warn('get', key, err);
      return undefined;
    }
  }

  /** Écrit une clé avec un TTL en secondes. Silencieux en cas d'échec. */
  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS,
  ): Promise<void> {
    try {
      await withTimeout(
        this.cache.set(key, value, ttlSeconds * 1000),
        CACHE_OP_TIMEOUT_MS,
      );
    } catch (err) {
      this.warn('set', key, err);
    }
  }

  /** Invalide une ou plusieurs clés (à appeler après chaque écriture). */
  async del(...keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await withTimeout(this.cache.mdel([...keys]), CACHE_OP_TIMEOUT_MS);
    } catch (err) {
      this.warn('del', keys.join(','), err);
    }
  }

  private warn(op: string, key: string, err: unknown): void {
    const reason = err instanceof Error ? err.message : String(err);
    this.logger.warn(`Cache ${op} failed for "${key}": ${reason}`);
  }
}
