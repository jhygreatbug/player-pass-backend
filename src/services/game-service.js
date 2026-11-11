import { DEFAULTS } from '../config.js';
import { getSteamAppDetails } from '../providers/steam/detail.js';
import { searchSteamGames } from '../providers/steam/search.js';
import {
  CacheService,
  buildDetailCacheKey,
  buildSearchCacheKey,
} from './cache-service.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidCachedSearch(value) {
  return (
    isPlainObject(value) &&
    Array.isArray(value.games) &&
    Number.isSafeInteger(value.total)
  );
}

function isValidCachedDetail(value, appId) {
  return (
    isPlainObject(value) &&
    value.appId === appId &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.sourceUrl === 'string'
  );
}

export class GameService {
  constructor({ cacheService } = {}) {
    this.cacheService = cacheService ?? new CacheService();
  }

  async searchGames({ query, limit, requestUrl }) {
    const cacheKey = buildSearchCacheKey(requestUrl, { query, limit });
    const cached = await this.cacheService.match(cacheKey);
    if (cached.status === 'hit' && isValidCachedSearch(cached.value)) {
      return { data: cached.value, cacheStatus: 'HIT' };
    }

    const games = await searchSteamGames(query, limit);
    const data = { games, total: games.length };
    await this.cacheService.put(cacheKey, data, DEFAULTS.cache.searchTtlSeconds);

    return {
      data,
      cacheStatus: cached.status === 'bypass' ? 'BYPASS' : 'MISS',
    };
  }

  async getGameDetails({ appId, requestUrl }) {
    const cacheKey = buildDetailCacheKey(requestUrl, appId);
    const cached = await this.cacheService.match(cacheKey);
    if (cached.status === 'hit' && isValidCachedDetail(cached.value, appId)) {
      return { data: cached.value, cacheStatus: 'HIT' };
    }

    const details = await getSteamAppDetails(appId);
    await this.cacheService.put(cacheKey, details, DEFAULTS.cache.detailTtlSeconds);

    return {
      data: details,
      cacheStatus: cached.status === 'bypass' ? 'BYPASS' : 'MISS',
    };
  }
}
