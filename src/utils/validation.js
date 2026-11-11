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

// 个人账号 SteamID64 = 76561197960265728 + accountID，accountID 占 32 位。
// 已知账号的 ID 以 7656119 开头，但 accountID 接近上限时前缀会进位到 7656120。
const STEAM_ID64_BASE = 76561197960265728n;
const MAX_ACCOUNT_ID = 0xffffffffn;
const STEAM_ID64_PATTERN = /^\d{17}$/;
// 好友码就是账号的 accountID（SteamID3 里的 N），1–10 位数字，无前导零。
const FRIEND_CODE_PATTERN = /^[1-9]\d{0,9}$/;

export function parseSteamId(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';

  if (STEAM_ID64_PATTERN.test(value)) {
    const steamId = BigInt(value);
    if (steamId > STEAM_ID64_BASE && steamId <= STEAM_ID64_BASE + MAX_ACCOUNT_ID) {
      return value;
    }
  } else if (FRIEND_CODE_PATTERN.test(value)) {
    // 好友码在本地换算即可得到 SteamID64，不需要调用 Steam。
    const accountId = BigInt(value);
    if (accountId <= MAX_ACCOUNT_ID) {
      return (STEAM_ID64_BASE + accountId).toString();
    }
  }

  throw new AppError(
    'INVALID_STEAM_ID',
    'SteamID 必须是 64 位个人账号 ID 或数字好友码',
    400
  );
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
