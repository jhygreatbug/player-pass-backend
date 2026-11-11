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
  steamDetailData,
  steamDetailPayload,
  steamSearchItem,
  steamSearchPayload,
  workerRequest,
} from './helpers.js';

const SEARCH_REQUEST_URL =
  'https://game-data-service.example.com/api/v1/games/search?q=hollow&limit=10';

class FakeCache {
  constructor(clock) {
    this.clock = clock;
    this.store = new Map();
    this.failOnMatch = false;
    this.failOnPut = false;
  }

  async match(request) {
    if (this.failOnMatch) throw new Error('cache match failed');
    const key = typeof request === 'string' ? request : request.url;
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.clock.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return new Response(entry.body, { headers: { 'Content-Type': 'application/json' } });
  }

  async put(request, response) {
    if (this.failOnPut) throw new Error('cache put failed');
    const key = typeof request === 'string' ? request : request.url;
    const body = await response.text();
    const maxAge = (response.headers.get('Cache-Control') ?? '').match(/max-age=(\d+)/);
    const ttlSeconds = maxAge ? Number(maxAge[1]) : 0;
    this.store.set(key, { body, expiresAt: this.clock.now() + ttlSeconds * 1000 });
  }
}

function createClock() {
  return {
    time: 1_700_000_000_000,
    now() {
      return this.time;
    },
    advance(ms) {
      this.time += ms;
    },
  };
}

function createService(clock) {
  const cache = new FakeCache(clock);
  const service = new GameService({ cacheService: new CacheService({ cache }) });
  return { cache, service };
}

test('命中缓存时不重复请求 Steam', async (t) => {
  const clock = createClock();
  const { service } = createService(clock);
  const calls = installFetchMock(t, () =>
    jsonResponse(steamSearchPayload([steamSearchItem()]))
  );

  const first = await service.searchGames({
    query: 'hollow',
    limit: 10,
    requestUrl: SEARCH_REQUEST_URL,
  });
  assert.equal(first.cacheStatus, 'MISS');
  assert.equal(calls.length, 1);

  const second = await service.searchGames({
    query: 'hollow',
    limit: 10,
    requestUrl: SEARCH_REQUEST_URL,
  });
  assert.equal(second.cacheStatus, 'HIT');
  assert.equal(calls.length, 1);
  assert.deepEqual(second.data, first.data);
});

test('缓存过期后重新请求 Steam', async (t) => {
  const clock = createClock();
  const { service } = createService(clock);
  const calls = installFetchMock(t, () =>
    jsonResponse(steamSearchPayload([steamSearchItem()]))
  );

  await service.searchGames({ query: 'hollow', limit: 10, requestUrl: SEARCH_REQUEST_URL });

  clock.advance(DEFAULTS.cache.searchTtlSeconds * 1000 + 1);
  const expired = await service.searchGames({
    query: 'hollow',
    limit: 10,
    requestUrl: SEARCH_REQUEST_URL,
  });

  assert.equal(expired.cacheStatus, 'MISS');
  assert.equal(calls.length, 2);
});

test('缓存写入失败不影响正常响应', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const clock = createClock();
  const { cache, service } = createService(clock);
  cache.failOnPut = true;
  const calls = installFetchMock(t, () =>
    jsonResponse(steamSearchPayload([steamSearchItem()]))
  );

  const result = await service.searchGames({
    query: 'hollow',
    limit: 10,
    requestUrl: SEARCH_REQUEST_URL,
  });

  assert.equal(result.cacheStatus, 'MISS');
  assert.equal(result.data.total, 1);
  assert.equal(calls.length, 1);
});

test('缓存读取失败时降级请求 Steam', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const clock = createClock();
  const { cache, service } = createService(clock);
  cache.failOnMatch = true;
  const calls = installFetchMock(t, () =>
    jsonResponse(steamSearchPayload([steamSearchItem()]))
  );

  const result = await service.searchGames({
    query: 'hollow',
    limit: 10,
    requestUrl: SEARCH_REQUEST_URL,
  });

  assert.equal(result.cacheStatus, 'BYPASS');
  assert.equal(result.data.total, 1);
  assert.equal(calls.length, 1);
});

test('不同 AppID 不会串缓存', async (t) => {
  const clock = createClock();
  const { service } = createService(clock);
  const calls = installFetchMock(t, (url) => {
    const appId = Number(new URL(url).searchParams.get('appids'));
    return jsonResponse(
      steamDetailPayload(appId, steamDetailData({ name: `游戏 ${appId}` }))
    );
  });
  const requestUrl = (appId) =>
    `https://game-data-service.example.com/api/v1/games/${appId}`;

  const firstA = await service.getGameDetails({ appId: 1, requestUrl: requestUrl(1) });
  const firstB = await service.getGameDetails({ appId: 2, requestUrl: requestUrl(2) });
  assert.equal(firstA.data.appId, 1);
  assert.equal(firstB.data.appId, 2);
  assert.equal(calls.length, 2);

  const secondA = await service.getGameDetails({ appId: 1, requestUrl: requestUrl(1) });
  const secondB = await service.getGameDetails({ appId: 2, requestUrl: requestUrl(2) });
  assert.equal(secondA.cacheStatus, 'HIT');
  assert.equal(secondB.cacheStatus, 'HIT');
  assert.equal(secondA.data.name, '游戏 1');
  assert.equal(secondB.data.name, '游戏 2');
  assert.equal(calls.length, 2);
});

test('错误与超时结果不会被缓存', async (t) => {
  const clock = createClock();
  const { cache, service } = createService(clock);
  const originalTimeout = DEFAULTS.steam.timeoutMs;
  DEFAULTS.steam.timeoutMs = 20;
  t.after(() => {
    DEFAULTS.steam.timeoutMs = originalTimeout;
  });

  const calls = installFetchMock(
    t,
    (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        );
      })
  );

  for (let index = 0; index < 2; index += 1) {
    await assert.rejects(
      service.searchGames({ query: 'slow', limit: 10, requestUrl: SEARCH_REQUEST_URL }),
      (error) => error.code === 'UPSTREAM_TIMEOUT'
    );
  }

  assert.equal(calls.length, 2);
  assert.equal(cache.store.size, 0);
});

test('Worker 集成：第二次请求命中缓存并返回 X-Cache: HIT', async (t) => {
  const clock = createClock();
  const fakeCache = new FakeCache(clock);
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', {
    value: { default: fakeCache },
    configurable: true,
    writable: true,
  });
  t.after(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'caches', originalDescriptor);
    } else {
      delete globalThis.caches;
    }
  });

  const calls = installFetchMock(t, () =>
    jsonResponse(steamSearchPayload([steamSearchItem()]))
  );
  const path = '/api/v1/games/search?q=integrated';

  const first = await callWorker(workerRequest(path), TEST_ENV);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('X-Cache'), 'MISS');
  const firstBody = await first.json();

  const second = await callWorker(workerRequest(path), TEST_ENV);
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('X-Cache'), 'HIT');
  assert.equal(calls.length, 1);

  const secondBody = await second.json();
  assert.deepEqual(secondBody.data, firstBody.data);
});

test('workers.dev 部署下不宣称缓存生效，返回 X-Cache: BYPASS', async (t) => {
  const clock = createClock();
  const fakeCache = new FakeCache(clock);
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', {
    value: { default: fakeCache },
    configurable: true,
    writable: true,
  });
  t.after(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'caches', originalDescriptor);
    } else {
      delete globalThis.caches;
    }
  });

  const calls = installFetchMock(t, () =>
    jsonResponse(steamSearchPayload([steamSearchItem()]))
  );
  const base = 'https://game-data-service.account.workers.dev';
  const path = '/api/v1/games/search?q=workers-dev';

  const first = await callWorker(workerRequest(path, { base }), TEST_ENV);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('X-Cache'), 'BYPASS');

  const second = await callWorker(workerRequest(path, { base }), TEST_ENV);
  assert.equal(second.headers.get('X-Cache'), 'BYPASS');
  assert.equal(calls.length, 2);
  assert.equal(fakeCache.store.size, 0);
});
