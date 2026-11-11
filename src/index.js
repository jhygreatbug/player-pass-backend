import { API_PREFIX, getRuntimeConfig } from './config.js';
import { applyCorsHeaders, preflightResponse } from './middleware/cors.js';
import { handleError } from './middleware/error-handler.js';
import { getClientKey, RateLimiter } from './middleware/rate-limit.js';
import { routeRequest } from './router.js';
import { errorResponse } from './utils/response.js';

const searchPath = `${API_PREFIX}/games/search`;
const detailPathPattern = new RegExp(`^${API_PREFIX}/games/[^/]+$`);

const rateLimiter = new RateLimiter();

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

function isRateLimitedPath(pathname) {
  const path = normalizePath(pathname);
  return path === searchPath || detailPathPattern.test(path);
}

export default {
  async fetch(request, env = {}) {
    const runtimeConfig = getRuntimeConfig(env);
    const url = new URL(request.url);
    const allowedOrigins = runtimeConfig.cors.allowedOrigins;

    if (request.method === 'OPTIONS') {
      return preflightResponse(request, allowedOrigins);
    }

    let response;
    try {
      if (request.method !== 'GET') {
        response = errorResponse(405, 'METHOD_NOT_ALLOWED', '仅支持 GET 和 OPTIONS 请求', {
          headers: { Allow: 'GET, OPTIONS' },
        });
      } else if (isRateLimitedPath(url.pathname)) {
        const limitResult = rateLimiter.check(getClientKey(request), runtimeConfig.rateLimit);
        if (!limitResult.allowed) {
          response = errorResponse(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试', {
            headers: { 'Retry-After': String(limitResult.retryAfterSeconds) },
          });
        }
      }

      if (!response) {
        response = await routeRequest(request);
      }
    } catch (error) {
      response = handleError(error, { method: request.method, path: url.pathname });
    }

    return applyCorsHeaders(response, request, allowedOrigins);
  },
};
