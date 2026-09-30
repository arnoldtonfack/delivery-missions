import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { CacheService } from '../cache.service';
import { cacheKey } from '../cache.keys';

describe('CacheService', () => {
  let service: CacheService;
  let cache: { get: jest.Mock; set: jest.Mock; mdel: jest.Mock };

  beforeEach(async () => {
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      mdel: jest.fn().mockResolvedValue(true),
    };

    const module = await Test.createTestingModule({
      providers: [CacheService, { provide: CACHE_MANAGER, useValue: cache }],
    }).compile();
    service = module.get(CacheService);
  });

  it('returns the cached value without calling the loader on a hit', async () => {
    cache.get.mockResolvedValue({ id: 1 });
    const loader = jest.fn();

    await expect(service.getOrSet('k', loader)).resolves.toEqual({ id: 1 });
    expect(loader).not.toHaveBeenCalled();
  });

  it('calls the loader and stores the result with a TTL in ms on a miss', async () => {
    const loader = jest.fn().mockResolvedValue({ id: 2 });

    await expect(service.getOrSet('k', loader, 60)).resolves.toEqual({
      id: 2,
    });
    expect(cache.set).toHaveBeenCalledWith('k', { id: 2 }, 60_000);
  });

  it('never caches null results', async () => {
    const loader = jest.fn().mockResolvedValue(null);

    await expect(service.getOrSet('k', loader)).resolves.toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('fails open: serves from the loader when Redis errors', async () => {
    cache.get.mockRejectedValue(new Error('ECONNREFUSED'));
    cache.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const loader = jest.fn().mockResolvedValue('fresh');

    await expect(service.getOrSet('k', loader)).resolves.toBe('fresh');
  });

  it('fails open: serves from the loader when Redis hangs', async () => {
    cache.get.mockImplementation(() => new Promise(() => undefined));
    cache.set.mockImplementation(() => new Promise(() => undefined));
    const loader = jest.fn().mockResolvedValue('fresh');

    await expect(service.getOrSet('k', loader)).resolves.toBe('fresh');
  });

  it('invalidates several keys at once', async () => {
    await service.del('a', 'b');

    expect(cache.mdel).toHaveBeenCalledWith(['a', 'b']);
  });

  it('does not hit Redis when there is nothing to invalidate', async () => {
    await service.del();

    expect(cache.mdel).not.toHaveBeenCalled();
  });
});

describe('cacheKey', () => {
  it('joins domain and segments with ":"', () => {
    expect(cacheKey('items', 'detail', 42)).toBe('items:detail:42');
  });
});
