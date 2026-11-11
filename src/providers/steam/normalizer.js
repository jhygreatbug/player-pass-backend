import { AppError } from '../../utils/errors.js';
import { htmlToPlainText } from '../../utils/html.js';
import { hasChineseCharacters } from '../../utils/validation.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim() !== '');
}

function normalizeScreenshots(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map((screenshot) => ({
    id: Number.isSafeInteger(screenshot.id) ? screenshot.id : null,
    thumbnail: nonEmptyString(screenshot.path_thumbnail),
    full: nonEmptyString(screenshot.path_full),
  }));
}

function normalizeGenres(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainObject)
    .map((genre) => nonEmptyString(genre.description))
    .filter(Boolean);
}

export function normalizeSearchResults(items, limit = 10) {
  if (!Array.isArray(items)) return [];
  const max = Number.isSafeInteger(limit) && limit > 0 ? limit : 10;

  const seenAppIds = new Set();
  const games = [];

  for (const item of items) {
    if (games.length >= max) break;
    if (!isPlainObject(item)) continue;
    if (item.type !== 'app') continue;
    if (!Number.isSafeInteger(item.id) || item.id <= 0) continue;
    if (seenAppIds.has(item.id)) continue;

    const name = nonEmptyString(item.name);
    if (!name) continue;

    seenAppIds.add(item.id);
    games.push({
      appId: item.id,
      name,
      image: nonEmptyString(item.tiny_image),
      source: 'steam',
    });
  }

  return games;
}

export function normalizeAppDetails(appId, data) {
  const source = isPlainObject(data) ? data : {};

  return {
    appId,
    name: nonEmptyString(source.name),
    description: nonEmptyString(source.short_description),
    detailedDescription: nonEmptyString(source.detailed_description),
    about: nonEmptyString(source.about_the_game),
    cover: nonEmptyString(source.header_image),
    capsule: nonEmptyString(source.capsule_imagev5) ?? nonEmptyString(source.capsule_image),
    screenshots: normalizeScreenshots(source.screenshots),
    developers: stringList(source.developers),
    publishers: stringList(source.publishers),
    genres: normalizeGenres(source.genres),
    releaseDate: nonEmptyString(source.release_date?.date),
    platforms: {
      windows: source.platforms?.windows === true,
      mac: source.platforms?.mac === true,
      linux: source.platforms?.linux === true,
    },
    source: 'steam',
    language: 'schinese',
    sourceUrl: `https://store.steampowered.com/app/${appId}/`,
  };
}

export function assertChineseDetails(details) {
  const name = nonEmptyString(details?.name);
  const description = nonEmptyString(details?.description);

  if (!name || !description || !hasChineseCharacters(htmlToPlainText(description))) {
    throw new AppError('CHINESE_DATA_UNAVAILABLE', '该游戏没有可用的官方简体中文资料', 422);
  }
}
