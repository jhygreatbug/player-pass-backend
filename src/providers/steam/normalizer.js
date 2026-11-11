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

// 保留 Steam 返回的全部搜索结果和字段，只额外补充 appId/image/source 三个便捷字段。
// 不过滤 type、不校验 id/名称、不去重，仅在最后按 limit 截断条数。
export function normalizeSearchResults(items, limit = 10) {
  if (!Array.isArray(items)) return [];
  const max = Number.isSafeInteger(limit) && limit > 0 ? limit : 10;
  return items
    .map((item) => {
      if (!isPlainObject(item)) return item;
      return {
        ...item,
        appId: Number.isSafeInteger(item.id) && item.id > 0 ? item.id : null,
        image: nonEmptyString(item.tiny_image),
        source: 'steam',
      };
    })
    .slice(0, max);
}

function hasChineseDetails(source) {
  const name = nonEmptyString(source.name);
  const description = nonEmptyString(source.short_description);
  return Boolean(name && description && hasChineseCharacters(htmlToPlainText(description)));
}

// 不做内容过滤：即使缺少中文资料也返回完整数据，并用 chineseDataAvailable 标记。
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
    chineseDataAvailable: hasChineseDetails(source),
    raw: source,
    source: 'steam',
    language: 'schinese',
    sourceUrl: `https://store.steampowered.com/app/${appId}/`,
  };
}
