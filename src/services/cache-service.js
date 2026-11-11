import { API_PREFIX, DEFAULTS } from '../config.js';

function buildCacheKey(requestUrl, pathname, params) {
  const url = new URL(requestUrl);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Cloudflare 文档明确说明：workers.dev 域名下 Cache API 操作不会生效。
// 这种情况下不能宣称缓存已生效，统一按 BYPASS 处理。
function isCacheUnavailableHost(keyUrl) {
  try {
    return new URL(keyUrl).hostname.endsWith('.workers.dev');
  } catch {
    return true;
  }
}

export function buildSearchCacheKey(requestUrl, { query, limit }) {
  return buildCacheKey(requestUrl, `${API_PREFIX}/games/search`, {
    q: query,
    limit: String(limit),
    l: DEFAULTS.steam.language,
    cc: DEFAULTS.steam.countryCode,
  });
}

export function buildDetailCacheKey(requestUrl, appId) {
  return buildCacheKey(requestUrl, `${API_PREFIX}/games/${appId}`, {
    l: DEFAULTS.steam.language,
    cc: DEFAULTS.steam.countryCode,
  });
}

export function buildPlayerRecentCacheKey(requestUrl, steamId, limit) {
  return buildCacheKey(requestUrl, `${API_PREFIX}/players/${steamId}/recent`, {
    limit: String(limit),
  });
}

export function buildPlayerMostPlayedCacheKey(requestUrl, steamId, limit) {
  return buildCacheKey(requestUrl, `${API_PREFIX}/players/${steamId}/most-played`, {
    limit: String(limit),
  });
}

export class CacheService {
  constructor({ cache } = {}) {
    this.injectedCache = cache;
  }

  resolveCache() {
    if (this.injectedCache !== undefined) return this.injectedCache;
    return globalThis.caches?.default ?? null;
  }

  async match(keyUrl) {
    if (isCacheUnavailableHost(keyUrl)) return { status: 'bypass', value: null };
    const cache = this.resolveCache();
    if (!cache) return { status: 'bypass', value: null };

    try {
      const cached = await cache.match(new Request(keyUrl, { method: 'GET' }));
      if (!cached) return { status: 'miss', value: null };
      return { status: 'hit', value: await cached.json() };
    } catch (error) {
      console.warn('[cache] 读取缓存失败，降级为直接请求上游:', error?.message ?? error);
      return { status: 'bypass', value: null };
    }
  }

  async put(keyUrl, value, ttlSeconds) {
    if (isCacheUnavailableHost(keyUrl)) return false;
    const cache = this.resolveCache();
    if (!cache) return false;

    try {
      const response = new Response(JSON.stringify(value), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
        },
      });
      await cache.put(new Request(keyUrl, { method: 'GET' }), response);
      return true;
    } catch (error) {
      console.warn('[cache] 写入缓存失败（不影响本次响应）:', error?.message ?? error);
      return false;
    }
  }
}
