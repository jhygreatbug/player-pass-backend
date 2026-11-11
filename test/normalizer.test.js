import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAppDetails,
  normalizeSearchResults,
} from '../src/providers/steam/normalizer.js';
import { decodeHtmlEntities, htmlToPlainText } from '../src/utils/html.js';
import {
  hasChineseCharacters,
  parseAppId,
  parseLimit,
  parseSearchQuery,
  parseSteamId,
} from '../src/utils/validation.js';

test('normalizeSearchResults 保留全部结果、顺序和原始字段，只按 limit 截断', () => {
  const items = [
    { type: 'app', id: 3, name: 'Third', tiny_image: 'https://img/3.jpg', price: { final: 100 } },
    { type: 'sub', id: 4, name: 'Not an app' },
    { type: 'app', id: 1, name: 'First', tiny_image: null },
    { type: 'app', id: 3, name: 'Third duplicated' },
    { type: 'app', id: 0, name: 'Zero' },
    { type: 'app', id: '2', name: 'String id' },
    { type: 'app', id: 5, name: '   ' },
    { type: 'app', id: 6 },
  ];

  const games = normalizeSearchResults(items, 10);

  assert.equal(games.length, 8);
  assert.deepEqual(
    games.map((game) => game.appId),
    [3, 4, 1, 3, null, null, 5, 6]
  );
  assert.deepEqual(games[0], {
    ...items[0],
    appId: 3,
    image: 'https://img/3.jpg',
    source: 'steam',
  });
  assert.equal(games[1].type, 'sub');
  assert.equal(games[1].appId, 4);
  assert.equal(games[3].name, 'Third duplicated');
  assert.equal(games[4].name, 'Zero');
  assert.equal(games[5].id, '2');
  assert.equal(games[6].name, '   ');
  assert.equal(games[7].image, null);
});

test('normalizeSearchResults 只截断条数，不丢弃非对象项', () => {
  const items = Array.from({ length: 5 }, (_, index) => ({
    type: 'app',
    id: index + 1,
    name: `Game ${index + 1}`,
    tiny_image: null,
  }));

  assert.equal(normalizeSearchResults(items, 2).length, 2);
  assert.deepEqual(normalizeSearchResults(null), []);
  assert.deepEqual(normalizeSearchResults([], 10), []);

  const withNull = normalizeSearchResults([null, { type: 'app', id: 9, name: 'Nine' }], 10);
  assert.equal(withNull.length, 2);
  assert.equal(withNull[0], null);
  assert.equal(withNull[1].appId, 9);
});

test('normalizeAppDetails 完成字段映射、保留 raw 并标记中文可用', () => {
  const raw = {
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
    metacritic: { score: 90 },
  };

  const details = normalizeAppDetails(42, raw);

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
    chineseDataAvailable: true,
    raw,
    source: 'steam',
    language: 'schinese',
    sourceUrl: 'https://store.steampowered.com/app/42/',
  });
  assert.equal(details.raw.metacritic.score, 90);
});

test('normalizeAppDetails 在可选字段缺失时返回 null 或空集合', () => {
  const raw = { name: 'X', short_description: '中文' };
  const details = normalizeAppDetails(1, raw);

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
  assert.equal(details.chineseDataAvailable, true);
  assert.deepEqual(details.raw, raw);
});

test('normalizeAppDetails 在 capsule_imagev5 缺失时回退到 capsule_image', () => {
  const details = normalizeAppDetails(1, { capsule_image: 'https://img/capsule.jpg' });
  assert.equal(details.capsule, 'https://img/capsule.jpg');
  assert.equal(details.chineseDataAvailable, false);
});

test('chineseDataAvailable 根据名称与简介内容计算，不阻止返回', () => {
  assert.equal(
    normalizeAppDetails(1, {
      name: 'Game',
      short_description: 'Hollow Knight is a challenging adventure.',
    }).chineseDataAvailable,
    false
  );
  assert.equal(
    normalizeAppDetails(1, {
      name: '游戏',
      short_description: '<br><img src="https://img/x.jpg">',
    }).chineseDataAvailable,
    false
  );
  assert.equal(
    normalizeAppDetails(1, {
      name: 'Game',
      short_description: '<p>这是一款动作冒险游戏。</p>',
    }).chineseDataAvailable,
    true
  );
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

test('parseSteamId 接受 17 位 SteamID64 与数字好友码', () => {
  assert.equal(parseSteamId('76561197960287930'), '76561197960287930');
  assert.equal(parseSteamId(' 76561197960287930 '), '76561197960287930');
  // 好友码就是 accountID，本地换算为 SteamID64。
  assert.equal(parseSteamId('22202'), '76561197960287930');
  assert.equal(parseSteamId(' 22202 '), '76561197960287930');
  assert.equal(parseSteamId('1'), '76561197960265729');
  assert.equal(parseSteamId('4294967295'), '76561202255233023');
  // accountID 接近 32 位上限时前缀会进位到 7656120，直接传该 ID 也应有效。
  assert.equal(parseSteamId('76561202255233023'), '76561202255233023');
});

test('parseSteamId 拒绝非法 ID 与超出范围的好友码', () => {
  for (const value of [
    '',
    '   ',
    'abc',
    '0',
    '00022202',
    '12345678901',
    '4294967296',
    '76561197960265728',
    '76561202255233024',
    '7656119796028793',
    '765611979602879301',
    '86561197960287930',
  ]) {
    assert.throws(
      () => parseSteamId(value),
      (error) => error.code === 'INVALID_STEAM_ID' && error.status === 400
    );
  }
});

test('HTML 工具函数清理标签并解码实体（用于中文可用性标记）', () => {
  assert.equal(htmlToPlainText('<p>你好<br>世界</p>'), '你好 世界');
  assert.equal(htmlToPlainText('&lt;中文&gt; &amp; <b>标签</b>'), '<中文> & 标签');
  assert.equal(decodeHtmlEntities('&#20320;&#x597D;'), '你好');
  assert.equal(htmlToPlainText('<script>alert(1)</script>文字'), '文字');
});
