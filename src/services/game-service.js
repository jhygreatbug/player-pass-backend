import { DEFAULTS } from '../config.js';
import { getSteamAppDetails } from '../providers/steam/detail.js';
import {
  getSteamMostPlayedGames,
  getSteamRecentlyPlayedGames,
} from '../providers/steam/player.js';
import { searchSteamGames } from '../providers/steam/search.js';
import {
  CacheService,
  buildDetailCacheKey,
  buildPlayerMostPlayedCacheKey,
  buildPlayerRecentCacheKey,
  buildSearchCacheKey,
} from './cache-service.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidCachedSearch(value) {
  return (
    isPlainObject(value) &&
    Array.isArray(value.games) &&
    Number.isSafeInteger(value.total) &&
    Object.prototype.hasOwnProperty.call(value, 'upstreamTotal')
  );
}

function isValidCachedDetail(value, appId) {
  return (
    isPlainObject(value) &&
    value.appId === appId &&
    isPlainObject(value.raw) &&
    typeof value.chineseDataAvailable === 'boolean' &&
    typeof value.sourceUrl === 'string'
  );
}

function isValidCachedPlayerList(value, steamId) {
  return isPlainObject(value) && value.steamId === steamId && Array.isArray(value.games);
}

export class GameService {
  constructor({ cacheService, steamApiKey = '' } = {}) {
    this.cacheService = cacheService ?? new CacheService();
    this.steamApiKey = steamApiKey;
  }

  async searchGames({ query, limit, requestUrl }) {
    const cacheKey = buildSearchCacheKey(requestUrl, { query, limit });
    const cached = await this.cacheService.match(cacheKey);
    if (cached.status === 'hit' && isValidCachedSearch(cached.value)) {
      return { data: cached.value, cacheStatus: 'HIT' };
    }

    const { games, upstreamTotal } = await searchSteamGames(query, limit);
    const data = { games, total: games.length, upstreamTotal };
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

  async getRecentlyPlayedGames({ steamId, limit, requestUrl }) {
    const cacheKey = buildPlayerRecentCacheKey(requestUrl, steamId, limit);
    const cached = await this.cacheService.match(cacheKey);
    if (cached.status === 'hit' && isValidCachedPlayerList(cached.value, steamId)) {
      return { data: cached.value, cacheStatus: 'HIT' };
    }

    const data = await getSteamRecentlyPlayedGames(steamId, limit, this.steamApiKey);
    await this.cacheService.put(cacheKey, data, DEFAULTS.cache.playerRecentTtlSeconds);

    return {
      data,
      cacheStatus: cached.status === 'bypass' ? 'BYPASS' : 'MISS',
    };
  }

  async getMostPlayedGames({ steamId, limit, requestUrl }) {
    const cacheKey = buildPlayerMostPlayedCacheKey(requestUrl, steamId, limit);
    const cached = await this.cacheService.match(cacheKey);
    if (cached.status === 'hit' && isValidCachedPlayerList(cached.value, steamId)) {
      return { data: cached.value, cacheStatus: 'HIT' };
    }

    const data = await getSteamMostPlayedGames(steamId, limit, this.steamApiKey);
    await this.cacheService.put(cacheKey, data, DEFAULTS.cache.playerMostPlayedTtlSeconds);

    return {
      data,
      cacheStatus: cached.status === 'bypass' ? 'BYPASS' : 'MISS',
    };
  }
}
