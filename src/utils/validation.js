import { DEFAULTS } from '../config.js';
import { AppError, invalidParams } from './errors.js';

// 只用于识别明显缺失中文的资料，不能作为语言质量或官方授权的绝对证明。
// CJK 统一表意文字：扩展 A、基本区、兼容区。
const CHINESE_PATTERN = /[㐀-䶿一-鿿豈-﫿]/;

export function hasChineseCharacters(text) {
  return typeof text === 'string' && CHINESE_PATTERN.test(text);
}

export function parseSearchQuery(raw) {
  const query = typeof raw === 'string' ? raw.trim() : '';
  if (query === '') {
    throw invalidParams('搜索关键词 q 不能为空');
  }
  if (query.length > DEFAULTS.search.maxQueryLength) {
    throw invalidParams(`搜索关键词长度不能超过 ${DEFAULTS.search.maxQueryLength} 个字符`);
  }
  return query;
}

export function parseLimit(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return DEFAULTS.search.defaultLimit;
  }
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw invalidParams(`limit 必须是 1 到 ${DEFAULTS.search.maxLimit} 之间的整数`);
  }
  const limit = Number.parseInt(raw, 10);
  if (limit < 1 || limit > DEFAULTS.search.maxLimit) {
    throw invalidParams(`limit 必须是 1 到 ${DEFAULTS.search.maxLimit} 之间的整数`);
  }
  return limit;
}

export function parseAppId(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d+$/.test(value)) {
    throw invalidParams('AppID 必须是正整数');
  }
  const appId = Number(value);
  if (!Number.isSafeInteger(appId) || appId <= 0) {
    throw invalidParams('AppID 必须是正整数');
  }
  return appId;
}

export function parseSteamId(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  // 个人账号的 SteamID64 固定以 7656119 开头，共 17 位。
  if (!/^7656119\d{10}$/.test(value)) {
    throw new AppError('INVALID_STEAM_ID', 'SteamID 必须是 64 位个人账号 ID', 400);
  }
  return value;
}

export function parsePlayerLimit(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return DEFAULTS.player.defaultLimit;
  }
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw invalidParams(`limit 必须是 1 到 ${DEFAULTS.player.maxLimit} 之间的整数`);
  }
  const limit = Number.parseInt(raw, 10);
  if (limit < 1 || limit > DEFAULTS.player.maxLimit) {
    throw invalidParams(`limit 必须是 1 到 ${DEFAULTS.player.maxLimit} 之间的整数`);
  }
  return limit;
}
