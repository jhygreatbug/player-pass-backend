export const SERVICE_NAME = 'game-data-service';
export const SERVICE_VERSION = '1.0.0';
export const API_PREFIX = '/api/v1';

export const DEFAULTS = {
  steam: {
    searchUrl: 'https://store.steampowered.com/api/storesearch/',
    appDetailsUrl: 'https://store.steampowered.com/api/appdetails',
    language: 'schinese',
    countryCode: 'cn',
    timeoutMs: 8000,
  },
  cache: {
    searchTtlSeconds: 60 * 60,
    detailTtlSeconds: 60 * 60 * 24 * 7,
  },
  search: {
    defaultLimit: 10,
    maxLimit: 10,
    maxQueryLength: 100,
  },
  rateLimit: {
    maxRequests: 120,
    windowSeconds: 60,
  },
};

function parseIntInRange(raw, fallback, min, max) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

export function parseAllowedOrigins(raw) {
  if (typeof raw !== 'string' || raw.trim() === '' || raw.trim() === '*') {
    return ['*'];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getRuntimeConfig(env = {}) {
  return {
    cors: {
      allowedOrigins: parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
    },
    rateLimit: {
      maxRequests: parseIntInRange(env.RATE_LIMIT_MAX, DEFAULTS.rateLimit.maxRequests, 1, 100000),
      windowSeconds: parseIntInRange(
        env.RATE_LIMIT_WINDOW_SECONDS,
        DEFAULTS.rateLimit.windowSeconds,
        1,
        3600
      ),
    },
  };
}
