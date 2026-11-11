import { DEFAULTS } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import { fetchSteamJson } from './client.js';
import { assertChineseDetails, normalizeAppDetails } from './normalizer.js';

export async function getSteamAppDetails(appId) {
  const url = new URL(DEFAULTS.steam.appDetailsUrl);
  url.searchParams.set('appids', String(appId));
  url.searchParams.set('l', DEFAULTS.steam.language);
  url.searchParams.set('cc', DEFAULTS.steam.countryCode);

  const payload = await fetchSteamJson(url.toString());

  if (!payload || typeof payload !== 'object') {
    throw new AppError('UPSTREAM_ERROR', 'Steam 详情接口返回了异常数据', 502);
  }

  const entry = payload[String(appId)];
  if (!entry || typeof entry !== 'object' || entry.success !== true) {
    throw new AppError('GAME_NOT_FOUND', '游戏不存在或无法获取该游戏的资料', 404);
  }
  if (!entry.data || typeof entry.data !== 'object') {
    throw new AppError('UPSTREAM_ERROR', 'Steam 详情接口返回的数据结构不符合预期', 502);
  }

  const details = normalizeAppDetails(appId, entry.data);
  assertChineseDetails(details);
  return details;
}
