import { DEFAULTS } from '../../config.js';
import { AppError } from '../../utils/errors.js';

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError';
}

function timeoutError(timeoutMs) {
  return new AppError(
    'UPSTREAM_TIMEOUT',
    `请求 Steam 接口超时（超过 ${timeoutMs} 毫秒）`,
    504
  );
}

export async function fetchSteamJson(urlString) {
  const controller = new AbortController();
  const timeoutMs = DEFAULTS.steam.timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetch(urlString, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      if (isAbortError(error)) throw timeoutError(timeoutMs);
      throw new AppError('UPSTREAM_ERROR', '无法连接 Steam 接口', 502);
    }

    if (!response.ok) {
      throw new AppError(
        'UPSTREAM_ERROR',
        `Steam 接口返回 HTTP 状态码 ${response.status}`,
        502
      );
    }

    try {
      return await response.json();
    } catch (error) {
      if (isAbortError(error)) throw timeoutError(timeoutMs);
      throw new AppError('UPSTREAM_ERROR', 'Steam 接口返回了无法解析的 JSON 数据', 502);
    }
  } finally {
    clearTimeout(timer);
  }
}
