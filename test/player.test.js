import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS } from '../src/config.js';
import { CacheService } from '../src/services/cache-service.js';
import { GameService } from '../src/services/game-service.js';
import {
  TEST_ENV,
  callWorker,
  installFetchMock,
  jsonResponse,
  steamOwnedPayload,
  steamPlayerGame,
  steamRecentPayload,
  workerRequest,
} from './helpers.js';

const STEAM_ID = '76561197960287930';
const RECENT_PATH = `/api/v1/players/${STEAM_ID}/recent`;
const MOST_PLAYED_PATH = `/api/v1/players/${STEAM_ID}/most-played`;

class SimpleCache {
  constructor() {
    this.store = new Map();
  }

  async match(request) {
    const key = typeof request === 'string' ? request : request.url;
    const body = this.store.get(key);
    if (body === undefined) return undefined;
    return new Response(body, { headers: { 'Content-Type': 'application/json' } });
  }

  async put(request, response) {
    const key = typeof request === 'string' ? request : request.url;
    this.store.set(key, await response.text());
  }
}

test('最近游玩：返回标准化字段并透传 key/steamid/count', async (t) => {
  const calls = installFetchMock(t, () =>
    jsonResponse(steamRecentPayload([steamPlayerGame()]))
  );

  const response = await callWorker(workerRequest(`${RECENT_PATH}?limit=5`));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body, {
    success: true,
    data: {
      steamId: STEAM_ID,
      games: [
        {
          appId: 367520,
          name: 'Hollow Knight',
          playtimeForeverMinutes: 3000,
          playtimeTwoWeeksMinutes: 120,
          lastPlayedAt: '2023-11-14T22:13:20.000Z',
          icon: 'https://media.steampowered.com/steamcommunity/public/images/apps/367520/iconhash.jpg',
          source: 'steam',
        },
      ],
      total: 1,
    },
  });

  const requested = new URL(calls[0].url);
  assert.equal(requested.origin, 'https://api.steampowered.com');
  assert.equal(requested.pathname, '/IPlayerService/GetRecentlyPlayedGames/v1/');
  assert.equal(requested.searchParams.get('key'), 'test-key');
  assert.equal(requested.searchParams.get('steamid'), STEAM_ID);
  assert.equal(requested.searchParams.get('count'), '5');
  assert.equal(requested.searchParams.get('format'), 'json');
});

test('游玩时长榜：按累计时长降序、过滤 0 时长并汇总总时长', async (t) => {
  const calls = installFetchMock(t, () =>
    jsonResponse(
      steamOwnedPayload(
        [
          steamPlayerGame({ appid: 1, name: 'A', playtime_forever: 100 }),
          steamPlayerGame({ appid: 2, name: 'B', playtime_forever: 500 }),
          steamPlayerGame({
            appid: 3,
            name: 'C',
            playtime_forever: 0,
            rtime_last_played: 0,
          }),
          steamPlayerGame({ appid: 4, name: 'D', playtime_forever: 250 }),
        ],
        4
      )
    )
  );

  const response = await callWorker(workerRequest(`${MOST_PLAYED_PATH}?limit=2`));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(
    body.data.games.map((game) => [game.appId, game.playtimeForeverMinutes]),
    [
      [2, 500],
      [4, 250],
    ]
  );
  assert.equal(body.data.total, 2);
  assert.equal(body.data.ownedGameCount, 4);
  assert.equal(body.data.totalPlaytimeMinutes, 850);

  const requested = new URL(calls[0].url);
  assert.equal(requested.pathname, '/IPlayerService/GetOwnedGames/v1/');
  assert.equal(requested.searchParams.get('steamid'), STEAM_ID);
  assert.equal(requested.searchParams.get('include_appinfo'), '1');
  assert.equal(requested.searchParams.get('include_played_free_games'), '1');
});

test('玩家游戏缺失图片、时间与两周时长时返回 null / 0', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(steamRecentPayload([{ appid: 42, name: 'Some Game' }]))
  );

  const response = await callWorker(workerRequest(RECENT_PATH));
  assert.equal(response.status, 200);
  const { data } = await response.json();

  assert.deepEqual(data.games, [
    {
      appId: 42,
      name: 'Some Game',
      playtimeForeverMinutes: 0,
      playtimeTwoWeeksMinutes: 0,
      lastPlayedAt: null,
      icon: null,
      source: 'steam',
    },
  ]);
});

test('无效 SteamID 返回 400 INVALID_STEAM_ID 且不请求 Steam', async (t) => {
  const calls = installFetchMock(t, () => {
    throw new Error('不应请求 Steam');
  });

  for (const steamId of [
    'abc',
    '0',
    '00022202',
    '12345678901',
    '4294967296',
    '7656119796028793',
    '765611979602879301',
    '86561197960287930',
  ]) {
    const response = await callWorker(
      workerRequest(`/api/v1/players/${steamId}/recent`)
    );
    assert.equal(response.status, 400, steamId);
    assert.equal((await response.json()).error.code, 'INVALID_STEAM_ID');
  }
  assert.equal(calls.length, 0);
});

test('好友码会先换算成 17 位 SteamID64 再请求 Steam', async (t) => {
  const calls = installFetchMock(t, () =>
    jsonResponse(steamRecentPayload([steamPlayerGame()]))
  );

  // 76561197960287930 的 accountID 是 22202，好友码即 22202。
  const response = await callWorker(
    workerRequest('/api/v1/players/22202/recent?limit=5')
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.steamId, STEAM_ID);

  const requested = new URL(calls[0].url);
  assert.equal(requested.searchParams.get('steamid'), STEAM_ID);
});

test('玩家接口的非法 limit 返回 400 INVALID_PARAMS', async (t) => {
  const calls = installFetchMock(t, () => {
    throw new Error('不应请求 Steam');
  });

  for (const value of ['0', '51', 'abc', '1.5', '-1']) {
    const response = await callWorker(
      workerRequest(`${MOST_PLAYED_PATH}?limit=${value}`)
    );
    assert.equal(response.status, 400, `limit=${value}`);
    assert.equal((await response.json()).error.code, 'INVALID_PARAMS');
  }
  assert.equal(calls.length, 0);
});

test('未配置 STEAM_API_KEY 时返回 500 且不请求 Steam', async (t) => {
  t.mock.method(console, 'error', () => {});
  const calls = installFetchMock(t, () => {
    throw new Error('不应请求 Steam');
  });
  const env = { ...TEST_ENV, STEAM_API_KEY: '' };

  const response = await callWorker(workerRequest(RECENT_PATH), env);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'STEAM_API_KEY_MISSING');
  assert.equal(calls.length, 0);
});

test('玩家资料私有或无数据返回 404 PLAYER_DATA_UNAVAILABLE', async (t) => {
  installFetchMock(t, () => jsonResponse({ response: {} }));

  for (const path of [RECENT_PATH, MOST_PLAYED_PATH]) {
    const response = await callWorker(workerRequest(path));
    assert.equal(response.status, 404, path);
    assert.equal((await response.json()).error.code, 'PLAYER_DATA_UNAVAILABLE');
  }
});

test('公开资料但游戏列表为空时正常返回空列表', async (t) => {
  installFetchMock(t, (url) =>
    new URL(url).pathname.includes('GetRecentlyPlayedGames')
      ? jsonResponse({ response: { total_count: 0, games: [] } })
      : jsonResponse({ response: { game_count: 0, games: [] } })
  );

  const recent = await callWorker(workerRequest(RECENT_PATH));
  assert.equal(recent.status, 200);
  assert.deepEqual((await recent.json()).data.games, []);

  const mostPlayed = await callWorker(workerRequest(MOST_PLAYED_PATH));
  assert.equal(mostPlayed.status, 200);
  const body = await mostPlayed.json();
  assert.deepEqual(body.data.games, []);
  assert.equal(body.data.ownedGameCount, 0);
  assert.equal(body.data.totalPlaytimeMinutes, 0);
});

test('Steam Web API 鉴权失败返回 502 且不泄露 Key', async (t) => {
  t.mock.method(console, 'error', () => {});
  installFetchMock(t, () => new Response('<html>Unauthorized</html>', { status: 401 }));

  const response = await callWorker(workerRequest(RECENT_PATH));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.ok(text.includes('鉴权') || text.includes('API Key'));
  assert.ok(!text.includes('test-key'));
});

test('Steam Web API 超时返回 504', async (t) => {
  t.mock.method(console, 'error', () => {});
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

  const response = await callWorker(workerRequest(RECENT_PATH));
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'UPSTREAM_TIMEOUT');
});

test('玩家最近游玩命中缓存，且不同 SteamID 不串缓存', async (t) => {
  const cache = new SimpleCache();
  const service = new GameService({
    cacheService: new CacheService({ cache }),
    steamApiKey: 'test-key',
  });
  const calls = installFetchMock(t, () =>
    jsonResponse(steamRecentPayload([steamPlayerGame()]))
  );
  const requestUrl = (steamId) =>
    `https://game-data-service.example.com/api/v1/players/${steamId}/recent?limit=10`;

  const first = await service.getRecentlyPlayedGames({
    steamId: STEAM_ID,
    limit: 10,
    requestUrl: requestUrl(STEAM_ID),
  });
  assert.equal(first.cacheStatus, 'MISS');
  assert.equal(calls.length, 1);

  const second = await service.getRecentlyPlayedGames({
    steamId: STEAM_ID,
    limit: 10,
    requestUrl: requestUrl(STEAM_ID),
  });
  assert.equal(second.cacheStatus, 'HIT');
  assert.equal(calls.length, 1);

  const otherSteamId = '76561198000000000';
  await service.getRecentlyPlayedGames({
    steamId: otherSteamId,
    limit: 10,
    requestUrl: requestUrl(otherSteamId),
  });
  assert.equal(calls.length, 2);
});
