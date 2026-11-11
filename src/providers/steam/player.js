import { DEFAULTS } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import { fetchSteamJson } from './client.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toMinutes(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function toIsoTime(value) {
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function iconUrl(appId, hash) {
  if (typeof hash !== 'string' || hash.trim() === '') return null;
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`;
}

function normalizePlayerGame(game) {
  if (!isPlainObject(game)) return null;
  if (!Number.isSafeInteger(game.appid) || game.appid <= 0) return null;

  return {
    appId: game.appid,
    name: typeof game.name === 'string' && game.name.trim() !== '' ? game.name : null,
    playtimeForeverMinutes: toMinutes(game.playtime_forever),
    playtimeTwoWeeksMinutes: toMinutes(game.playtime_2weeks),
    lastPlayedAt: toIsoTime(game.rtime_last_played),
    icon: iconUrl(game.appid, game.img_icon_url),
    source: 'steam',
  };
}

function normalizePlayerGames(games) {
  if (!Array.isArray(games)) return [];
  return games.map(normalizePlayerGame).filter(Boolean);
}

async function fetchPlayerService(method, params, apiKey) {
  if (typeof apiKey !== 'string' || apiKey === '') {
    throw new AppError('STEAM_API_KEY_MISSING', '服务未配置 STEAM_API_KEY', 500);
  }

  const url = new URL(`${DEFAULTS.steamWebApi.baseUrl}/IPlayerService/${method}/v1/`);
  url.searchParams.set('key', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('format', 'json');

  try {
    return await fetchSteamJson(url.toString());
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.upstreamStatus === 401 || error.upstreamStatus === 403)
    ) {
      console.error('[steam] Web API 鉴权失败，请检查 STEAM_API_KEY 配置');
      throw new AppError(
        'UPSTREAM_ERROR',
        'Steam Web API 鉴权失败，请检查 API Key 配置',
        502
      );
    }
    throw error;
  }
}

export async function getSteamRecentlyPlayedGames(steamId, limit, apiKey) {
  const payload = await fetchPlayerService(
    'GetRecentlyPlayedGames',
    { steamid: steamId, count: limit },
    apiKey
  );

  const response = isPlainObject(payload?.response) ? payload.response : null;
  if (!response || !Array.isArray(response.games)) {
    throw new AppError('PLAYER_DATA_UNAVAILABLE', '玩家资料不可用或未公开', 404);
  }

  const games = normalizePlayerGames(response.games).slice(0, limit);
  return { steamId, games, total: games.length };
}

export async function getSteamMostPlayedGames(steamId, limit, apiKey) {
  const payload = await fetchPlayerService(
    'GetOwnedGames',
    {
      steamid: steamId,
      include_appinfo: 1,
      include_played_free_games: 1,
    },
    apiKey
  );

  const response = isPlainObject(payload?.response) ? payload.response : null;
  if (!response || !Array.isArray(response.games)) {
    throw new AppError('PLAYER_DATA_UNAVAILABLE', '玩家资料不可用或未公开', 404);
  }

  const allGames = normalizePlayerGames(response.games);
  const totalPlaytimeMinutes = allGames.reduce(
    (sum, game) => sum + game.playtimeForeverMinutes,
    0
  );
  const games = allGames
    .filter((game) => game.playtimeForeverMinutes > 0)
    .sort((a, b) => b.playtimeForeverMinutes - a.playtimeForeverMinutes)
    .slice(0, limit);

  return {
    steamId,
    games,
    total: games.length,
    ownedGameCount: Number.isSafeInteger(response.game_count)
      ? response.game_count
      : allGames.length,
    totalPlaytimeMinutes,
  };
}
