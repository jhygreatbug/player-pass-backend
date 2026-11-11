import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS } from '../src/config.js';
import {
  callWorker,
  installFetchMock,
  jsonResponse,
  steamDetailData,
  steamDetailPayload,
  workerRequest,
} from './helpers.js';

function detailPath(appId) {
  return `/api/v1/games/${appId}`;
}

test('正常详情：返回标准化字段并保留上游 HTML 原文', async (t) => {
  const calls = installFetchMock(t, () =>
    jsonResponse(steamDetailPayload(367520, steamDetailData()))
  );

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body, {
    success: true,
    data: {
      appId: 367520,
      name: '空洞骑士',
      description: '<p>在《空洞骑士》中打造属于自己的冒险之旅！</p>',
      detailedDescription: '<p>探索幽深的洞穴，与被感染的生物战斗。</p>',
      about: '<h2>关于这款游戏</h2><p>手绘风格的动作冒险游戏。</p>',
      cover: 'https://cdn.example.com/367520/header.jpg',
      capsule: 'https://cdn.example.com/367520/capsule_184x69.jpg',
      screenshots: [
        {
          id: 0,
          thumbnail: 'https://cdn.example.com/367520/ss1.600x338.jpg',
          full: 'https://cdn.example.com/367520/ss1.1920x1080.jpg',
        },
      ],
      developers: ['Team Cherry'],
      publishers: ['Team Cherry'],
      genres: ['动作', '独立'],
      releaseDate: '2017 年 2 月 24 日',
      platforms: { windows: true, mac: true, linux: true },
      source: 'steam',
      language: 'schinese',
      sourceUrl: 'https://store.steampowered.com/app/367520/',
    },
  });

  const requested = new URL(calls[0].url);
  assert.equal(requested.pathname, '/api/appdetails');
  assert.equal(requested.searchParams.get('appids'), '367520');
  assert.equal(requested.searchParams.get('l'), 'schinese');
  assert.equal(requested.searchParams.get('cc'), 'cn');
});

test('无效 AppID 返回 400 INVALID_PARAMS 且不请求 Steam', async (t) => {
  const calls = installFetchMock(t, () => {
    throw new Error('不应请求 Steam');
  });

  for (const value of ['abc', '0', '-1', '1.5', '99999999999999999999']) {
    const response = await callWorker(workerRequest(detailPath(value)));
    assert.equal(response.status, 400, `AppID=${value}`);
    assert.equal((await response.json()).error.code, 'INVALID_PARAMS');
  }
  assert.equal(calls.length, 0);
});

test('游戏不存在返回 404 GAME_NOT_FOUND', async (t) => {
  installFetchMock(t, () => jsonResponse({ 999999999: { success: false } }));

  const response = await callWorker(workerRequest(detailPath(999999999)));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'GAME_NOT_FOUND');
});

test('Steam 详情响应中缺少对应 AppID 时返回 404', async (t) => {
  installFetchMock(t, () => jsonResponse({}));

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'GAME_NOT_FOUND');
});

test('缺少游戏名称返回 422 CHINESE_DATA_UNAVAILABLE', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(steamDetailPayload(367520, steamDetailData({ name: undefined })))
  );

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'CHINESE_DATA_UNAVAILABLE');
});

test('缺少简介返回 422 CHINESE_DATA_UNAVAILABLE', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(steamDetailPayload(367520, steamDetailData({ short_description: undefined })))
  );

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'CHINESE_DATA_UNAVAILABLE');
});

test('简介只有英文时返回 422 CHINESE_DATA_UNAVAILABLE', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(
      steamDetailPayload(
        367520,
        steamDetailData({ short_description: 'Hollow Knight is a challenging adventure.' })
      )
    )
  );

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, 'CHINESE_DATA_UNAVAILABLE');
  assert.equal(body.success, false);
});

test('简介只有 HTML 标签时返回 422', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(
      steamDetailPayload(
        367520,
        steamDetailData({ short_description: '<br><img src="https://img/x.jpg">' })
      )
    )
  );

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'CHINESE_DATA_UNAVAILABLE');
});

test('图片字段缺失时返回 null / 空数组而不是失败', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(
      steamDetailPayload(
        367520,
        steamDetailData({
          header_image: undefined,
          capsule_imagev5: undefined,
          capsule_image: undefined,
          screenshots: undefined,
        })
      )
    )
  );

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.cover, null);
  assert.equal(data.capsule, null);
  assert.deepEqual(data.screenshots, []);
});

test('可选字段缺失时使用 null 或空数组', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(
      steamDetailPayload(
        367520,
        steamDetailData({
          developers: undefined,
          publishers: undefined,
          genres: undefined,
          release_date: undefined,
          platforms: undefined,
          detailed_description: undefined,
          about_the_game: undefined,
        })
      )
    )
  );

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data.developers, []);
  assert.deepEqual(data.publishers, []);
  assert.deepEqual(data.genres, []);
  assert.equal(data.releaseDate, null);
  assert.deepEqual(data.platforms, { windows: false, mac: false, linux: false });
  assert.equal(data.detailedDescription, null);
  assert.equal(data.about, null);
});

test('Steam 详情请求超时返回 504', async (t) => {
  const originalTimeout = DEFAULTS.steam.timeoutMs;
  DEFAULTS.steam.timeoutMs = 20;
  t.after(() => {
    DEFAULTS.steam.timeoutMs = originalTimeout;
  });

  installFetchMock(
    t,
    (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        );
      })
  );

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'UPSTREAM_TIMEOUT');
});

test('Steam 详情返回非 JSON 时返回 502', async (t) => {
  installFetchMock(t, () => new Response('<html>not json</html>', { status: 200 }));

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');
});

test('Steam 详情 success=true 但缺少 data 时返回 502', async (t) => {
  installFetchMock(t, () => jsonResponse({ 367520: { success: true } }));

  const response = await callWorker(workerRequest(detailPath(367520)));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');
});
