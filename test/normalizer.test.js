import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertChineseDetails,
  normalizeAppDetails,
  normalizeSearchResults,
} from '../src/providers/steam/normalizer.js';
import { AppError } from '../src/utils/errors.js';
import { decodeHtmlEntities, htmlToPlainText } from '../src/utils/html.js';
import {
  hasChineseCharacters,
  parseAppId,
  parseLimit,
  parseSearchQuery,
} from '../src/utils/validation.js';

test('normalizeSearchResults 过滤无效项、去重并保持顺序', () => {
  const games = normalizeSearchResults(
    [
      { type: 'app', id: 3, name: 'Third', tiny_image: 'https://img/3.jpg' },
      { type: 'sub', id: 4, name: 'Not an app' },
      { type: 'app', id: 1, name: 'First', tiny_image: null },
      { type: 'app', id: 3, name: 'Third duplicated' },
      { type: 'app', id: 0, name: 'Zero' },
      { type: 'app', id: '2', name: 'String id' },
      { type: 'app', id: 5, name: '   ' },
      { type: 'app', id: 6 },
    ],
    10
  );

  assert.deepEqual(games, [
    { appId: 3, name: 'Third', image: 'https://img/3.jpg', source: 'steam' },
    { appId: 1, name: 'First', image: null, source: 'steam' },
  ]);
});

test('normalizeSearchResults 遵守 limit 且容忍非数组输入', () => {
  const items = Array.from({ length: 5 }, (_, index) => ({
    type: 'app',
    id: index + 1,
    name: `Game ${index + 1}`,
    tiny_image: null,
  }));

  assert.equal(normalizeSearchResults(items, 2).length, 2);
  assert.deepEqual(normalizeSearchResults(null), []);
  assert.deepEqual(normalizeSearchResults([], 10), []);
});

test('normalizeAppDetails 完成字段映射并保留 HTML 原文', () => {
  const details = normalizeAppDetails(42, {
    name: 'Hollow Knight',
    short_description: '<b>中文简介</b>',
    detailed_description: '<p>详细描述</p>',
    about_the_game: '<p>关于</p>',
    header_image: 'https://img/header.jpg',
    capsule_imagev5: 'https://img/capsule_v5.jpg',
    capsule_image: 'https://img/capsule.jpg',
    screenshots: [
      { id: 7, path_thumbnail: 'https://img/t.jpg', path_full: 'https://img/f.jpg' },
      'bad',
    ],
    developers: ['Team Cherry', '', 42],
    publishers: ['Team Cherry'],
    genres: [{ id: '1', description: '动作' }, { id: '2' }, 'bad'],
    release_date: { coming_soon: false, date: '2017 年 2 月 24 日' },
    platforms: { windows: true, mac: 'true', linux: 1 },
  });

  assert.deepEqual(details, {
    appId: 42,
    name: 'Hollow Knight',
    description: '<b>中文简介</b>',
    detailedDescription: '<p>详细描述</p>',
    about: '<p>关于</p>',
    cover: 'https://img/header.jpg',
    capsule: 'https://img/capsule_v5.jpg',
    screenshots: [{ id: 7, thumbnail: 'https://img/t.jpg', full: 'https://img/f.jpg' }],
    developers: ['Team Cherry'],
    publishers: ['Team Cherry'],
    genres: ['动作'],
    releaseDate: '2017 年 2 月 24 日',
    platforms: { windows: true, mac: false, linux: false },
    source: 'steam',
    language: 'schinese',
    sourceUrl: 'https://store.steampowered.com/app/42/',
  });
});

test('normalizeAppDetails 在可选字段缺失时返回 null 或空集合', () => {
  const details = normalizeAppDetails(1, { name: 'X', short_description: '中文' });

  assert.equal(details.detailedDescription, null);
  assert.equal(details.about, null);
  assert.equal(details.cover, null);
  assert.equal(details.capsule, null);
  assert.deepEqual(details.screenshots, []);
  assert.deepEqual(details.developers, []);
  assert.deepEqual(details.publishers, []);
  assert.deepEqual(details.genres, []);
  assert.equal(details.releaseDate, null);
  assert.deepEqual(details.platforms, { windows: false, mac: false, linux: false });
});

test('normalizeAppDetails 在 capsule_imagev5 缺失时回退到 capsule_image', () => {
  const details = normalizeAppDetails(1, { capsule_image: 'https://img/capsule.jpg' });
  assert.equal(details.capsule, 'https://img/capsule.jpg');
});

test('assertChineseDetails 接受英文品牌名 + 中文简介', () => {
  assert.doesNotThrow(() =>
    assertChineseDetails({ name: 'Hollow Knight', description: '<p>这是一款动作冒险游戏。</p>' })
  );
});

test('assertChineseDetails 拒绝缺失名称、缺失简介、纯英文简介和纯 HTML', () => {
  const cases = [
    { name: null, description: '中文简介' },
    { name: '游戏', description: null },
    { name: 'Game', description: 'Hollow Knight is a challenging adventure.' },
    { name: '游戏', description: '<br><img src="https://img/x.jpg">' },
  ];

  for (const details of cases) {
    assert.throws(
      () => assertChineseDetails(details),
      (error) =>
        error instanceof AppError &&
        error.code === 'CHINESE_DATA_UNAVAILABLE' &&
        error.status === 422
    );
  }
});

test('hasChineseCharacters 只识别 CJK 字符', () => {
  assert.equal(hasChineseCharacters('空洞骑士'), true);
  assert.equal(hasChineseCharacters('Hollow Knight'), false);
  assert.equal(hasChineseCharacters(''), false);
  assert.equal(hasChineseCharacters(null), false);
});

test('parseSearchQuery 去空格并校验长度', () => {
  assert.equal(parseSearchQuery('  空洞骑士  '), '空洞骑士');
  assert.throws(() => parseSearchQuery('   '), (error) => error.code === 'INVALID_PARAMS');
  assert.throws(
    () => parseSearchQuery('a'.repeat(101)),
    (error) => error.code === 'INVALID_PARAMS'
  );
  assert.equal(parseSearchQuery('a'.repeat(100)).length, 100);
});

test('parseLimit 默认 10 且限制在 1-10', () => {
  assert.equal(parseLimit(null), 10);
  assert.equal(parseLimit(''), 10);
  assert.equal(parseLimit('3'), 3);
  for (const value of ['0', '11', 'abc', '1.5', '-2']) {
    assert.throws(() => parseLimit(value), (error) => error.code === 'INVALID_PARAMS');
  }
});

test('parseAppId 只接受正整数', () => {
  assert.equal(parseAppId('367520'), 367520);
  for (const value of ['0', '-1', '1.5', 'abc', '', '99999999999999999999']) {
    assert.throws(() => parseAppId(value), (error) => error.code === 'INVALID_PARAMS');
  }
});

test('HTML 工具函数清理标签并解码实体（仅用于校验）', () => {
  assert.equal(htmlToPlainText('<p>你好<br>世界</p>'), '你好 世界');
  assert.equal(htmlToPlainText('&lt;中文&gt; &amp; <b>标签</b>'), '<中文> & 标签');
  assert.equal(decodeHtmlEntities('&#20320;&#x597D;'), '你好');
  assert.equal(htmlToPlainText('<script>alert(1)</script>文字'), '文字');
});
