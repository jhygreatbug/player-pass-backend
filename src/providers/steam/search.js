import { DEFAULTS } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import { fetchSteamJson } from './client.js';
import { normalizeSearchResults } from './normalizer.js';

export async function searchSteamGames(query, limit) {
  const url = new URL(DEFAULTS.steam.searchUrl);
  url.searchParams.set('term', query);
  url.searchParams.set('l', DEFAULTS.steam.language);
  url.searchParams.set('cc', DEFAULTS.steam.countryCode);

  const payload = await fetchSteamJson(url.toString());

  if (!payload || typeof payload !== 'object') {
    throw new AppError('UPSTREAM_ERROR', 'Steam 搜索接口返回了异常数据', 502);
  }
  // 实测 storesearch 响应通常只有 total/items，不包含 success 字段；
  // 仅在明确返回 success=false 时视为上游失败。
  if (payload.success === false) {
    throw new AppError('UPSTREAM_ERROR', 'Steam 搜索接口返回失败状态', 502);
  }
  if (!Array.isArray(payload.items)) {
    throw new AppError('UPSTREAM_ERROR', 'Steam 搜索接口返回的数据结构不符合预期', 502);
  }

  return {
    games: normalizeSearchResults(payload.items, limit),
    upstreamTotal: Number.isSafeInteger(payload.total) ? payload.total : null,
  };
}
