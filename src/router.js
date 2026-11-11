import { API_PREFIX, SERVICE_NAME, SERVICE_VERSION } from './config.js';
import { GameService } from './services/game-service.js';
import { errorResponse, jsonResponse, successResponse } from './utils/response.js';
import {
  parseAppId,
  parseLimit,
  parsePlayerLimit,
  parseSearchQuery,
  parseSteamId,
} from './utils/validation.js';

const HEALTH_PATH = `${API_PREFIX}/health`;
const SEARCH_PATH = `${API_PREFIX}/games/search`;
const DETAIL_PATH_PATTERN = new RegExp(`^${API_PREFIX}/games/([^/]+)$`);
const PLAYER_RECENT_PATTERN = new RegExp(`^${API_PREFIX}/players/([^/]+)/recent$`);
const PLAYER_MOST_PLAYED_PATTERN = new RegExp(
  `^${API_PREFIX}/players/([^/]+)/most-played$`
);

export async function routeRequest(request, { gameService = new GameService() } = {}) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (pathname === HEALTH_PATH) {
    return jsonResponse({
      success: true,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
    });
  }

  if (pathname === SEARCH_PATH) {
    const query = parseSearchQuery(url.searchParams.get('q'));
    const limit = parseLimit(url.searchParams.get('limit'));
    const { data, cacheStatus } = await gameService.searchGames({
      query,
      limit,
      requestUrl: request.url,
    });
    return successResponse(data, { headers: { 'X-Cache': cacheStatus } });
  }

  const detailMatch = pathname.match(DETAIL_PATH_PATTERN);
  if (detailMatch) {
    const appId = parseAppId(detailMatch[1]);
    const { data, cacheStatus } = await gameService.getGameDetails({
      appId,
      requestUrl: request.url,
    });
    return successResponse(data, { headers: { 'X-Cache': cacheStatus } });
  }

  const recentMatch = pathname.match(PLAYER_RECENT_PATTERN);
  if (recentMatch) {
    const steamId = parseSteamId(recentMatch[1]);
    const limit = parsePlayerLimit(url.searchParams.get('limit'));
    const { data, cacheStatus } = await gameService.getRecentlyPlayedGames({
      steamId,
      limit,
      requestUrl: request.url,
    });
    return successResponse(data, { headers: { 'X-Cache': cacheStatus } });
  }

  const mostPlayedMatch = pathname.match(PLAYER_MOST_PLAYED_PATTERN);
  if (mostPlayedMatch) {
    const steamId = parseSteamId(mostPlayedMatch[1]);
    const limit = parsePlayerLimit(url.searchParams.get('limit'));
    const { data, cacheStatus } = await gameService.getMostPlayedGames({
      steamId,
      limit,
      requestUrl: request.url,
    });
    return successResponse(data, { headers: { 'X-Cache': cacheStatus } });
  }

  return errorResponse(404, 'NOT_FOUND', '接口不存在');
}
