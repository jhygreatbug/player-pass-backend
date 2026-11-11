import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS } from '../src/config.js';
import {
  TEST_ENV,
  callWorker,
  installFetchMock,
  jsonResponse,
  steamSearchItem,
  steamSearchPayload,
  workerRequest,
} from './helpers.js';

const SEARCH_PATH = '/api/v1/games/search';

function searchUrl(query, extra = '') {
  return `${SEARCH_PATH}?q=${encodeURIComponent(query)}${extra}`;
}

test('中文关键词搜索：透传 term 并返回标准化结果', async (t) => {
  const calls = installFetchMock(t, () =>
    jsonResponse(steamSearchPayload([steamSearchItem({ name: '空洞骑士' })]))
  );

  const response = await callWorker(workerRequest(searchUrl('空洞骑士')));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body, {
    success: true,
    data: {
      games: [
        {
          appId: 367520,
          name: '空洞骑士',
          image: 'https://cdn.example.com/367520/capsule_231x87.jpg',
          source: 'steam',
        },
      ],
      total: 1,
    },
  });

  const requested = new URL(calls[0].url);
  assert.equal(requested.origin, 'https://store.steampowered.com');
  assert.equal(requested.pathname, '/api/storesearch/');
  assert.equal(requested.searchParams.get('term'), '空洞骑士');
  assert.equal(requested.searchParams.get('l'), 'schinese');
  assert.equal(requested.searchParams.get('cc'), 'cn');
});

test('英文关键词搜索', async (t) => {
  const calls = installFetchMock(t, () =>
    jsonResponse(steamSearchPayload([steamSearchItem({ name: 'Hollow Knight' })]))
  );

  const response = await callWorker(workerRequest(searchUrl('Hollow Knight')));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.games[0].name, 'Hollow Knight');
  assert.equal(new URL(calls[0].url).searchParams.get('term'), 'Hollow Knight');
});

test('缺少或空白关键词返回 400 INVALID_PARAMS', async (t) => {
  const calls = installFetchMock(t, () => {
    throw new Error('不应请求 Steam');
  });

  for (const path of [SEARCH_PATH, `${SEARCH_PATH}?q=`, `${SEARCH_PATH}?q=%20%20`]) {
    const response = await callWorker(workerRequest(path));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_PARAMS');
  }
  assert.equal(calls.length, 0);
});

test('超过 100 字符的关键词返回 400，恰好 100 字符可通过', async (t) => {
  installFetchMock(t, () => jsonResponse(steamSearchPayload([])));

  const tooLong = await callWorker(workerRequest(searchUrl('a'.repeat(101))));
  assert.equal(tooLong.status, 400);
  assert.equal((await tooLong.json()).error.code, 'INVALID_PARAMS');

  const boundary = await callWorker(workerRequest(searchUrl('a'.repeat(100))));
  assert.equal(boundary.status, 200);
});

test('Steam 返回空结果是正常响应', async (t) => {
  installFetchMock(t, () => jsonResponse({ total: 0, items: [] }));

  const response = await callWorker(workerRequest(searchUrl('nothing-here')));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { games: [], total: 0 });
});

test('Steam 搜索响应缺少 items 时返回 502', async (t) => {
  installFetchMock(t, () => jsonResponse({ total: 3 }));

  const response = await callWorker(workerRequest(searchUrl('broken')));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');
});

test('Steam 搜索明确返回 success=false 时返回 502', async (t) => {
  installFetchMock(t, () => jsonResponse({ success: false, items: [] }));

  const response = await callWorker(workerRequest(searchUrl('broken')));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');
});

test('过滤非 app、无效 AppID 与缺失名称的结果', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(
      steamSearchPayload([
        steamSearchItem({ id: 10 }),
        steamSearchItem({ id: 11, type: 'sub' }),
        steamSearchItem({ id: 0 }),
        steamSearchItem({ id: '12' }),
        steamSearchItem({ id: 13, name: '   ' }),
        steamSearchItem({ id: 14 }),
      ])
    )
  );

  const response = await callWorker(workerRequest(searchUrl('filter')));
  const body = await response.json();
  assert.deepEqual(
    body.data.games.map((game) => game.appId),
    [10, 14]
  );
  assert.equal(body.data.total, 2);
});

test('重复 AppID 去重并保留首次出现顺序', async (t) => {
  installFetchMock(t, () =>
    jsonResponse(
      steamSearchPayload([
        steamSearchItem({ id: 5, name: 'A' }),
        steamSearchItem({ id: 6, name: 'B' }),
        steamSearchItem({ id: 5, name: 'A duplicated' }),
        steamSearchItem({ id: 7, name: 'C' }),
      ])
    )
  );

  const response = await callWorker(workerRequest(searchUrl('dedupe')));
  const body = await response.json();
  assert.deepEqual(
    body.data.games.map((game) => game.name),
    ['A', 'B', 'C']
  );
});

test('limit 生效，默认返回最多 10 条', async (t) => {
  const items = Array.from({ length: 12 }, (_, index) =>
    steamSearchItem({ id: index + 1, name: `Game ${index + 1}` })
  );
  installFetchMock(t, () => jsonResponse(steamSearchPayload(items)));

  const defaultResponse = await callWorker(workerRequest(searchUrl('many')));
  const defaultBody = await defaultResponse.json();
  assert.equal(defaultBody.data.games.length, 10);
  assert.equal(defaultBody.data.total, 10);

  const limitedResponse = await callWorker(workerRequest(searchUrl('many', '&limit=2')));
  const limitedBody = await limitedResponse.json();
  assert.equal(limitedBody.data.games.length, 2);
  assert.equal(limitedBody.data.total, 2);
});

test('非法 limit 返回 400', async (t) => {
  const calls = installFetchMock(t, () => jsonResponse(steamSearchPayload([])));

  for (const value of ['0', '11', 'abc', '1.5', '-1']) {
    const response = await callWorker(workerRequest(searchUrl('test', `&limit=${value}`)));
    assert.equal(response.status, 400, `limit=${value}`);
    assert.equal((await response.json()).error.code, 'INVALID_PARAMS');
  }
  assert.equal(calls.length, 0);
});

test('Steam 返回非 JSON 时返回 502', async (t) => {
  installFetchMock(t, () => new Response('<html>not json</html>', { status: 200 }));

  const response = await callWorker(workerRequest(searchUrl('html')));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');
});

test('Steam 返回 HTTP 错误状态时返回 502', async (t) => {
  installFetchMock(t, () => jsonResponse({ error: 'boom' }, 500));

  const response = await callWorker(workerRequest(searchUrl('boom')));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');
});

test('Steam 请求超时返回 504', async (t) => {
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

  const response = await callWorker(workerRequest(searchUrl('slow')));
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'UPSTREAM_TIMEOUT');
});

test('Steam 响应体读取超时同样返回 504', async (t) => {
  const originalTimeout = DEFAULTS.steam.timeoutMs;
  DEFAULTS.steam.timeoutMs = 20;
  t.after(() => {
    DEFAULTS.steam.timeoutMs = originalTimeout;
  });

  installFetchMock(t, (url, init) => ({
    ok: true,
    status: 200,
    json: () =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        );
      }),
  }));

  const response = await callWorker(workerRequest(searchUrl('slow-body')));
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'UPSTREAM_TIMEOUT');
});

test('超过频率限制返回 429 RATE_LIMITED', async (t) => {
  installFetchMock(t, () => jsonResponse(steamSearchPayload([])));
  const env = { ...TEST_ENV, RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_SECONDS: '60' };
  const headers = { 'CF-Connecting-IP': '203.0.113.77' };

  for (let index = 0; index < 2; index += 1) {
    const response = await callWorker(workerRequest(searchUrl(`ok-${index}`), { headers }), env);
    assert.equal(response.status, 200);
  }

  const limited = await callWorker(workerRequest(searchUrl('limited'), { headers }), env);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers.get('Retry-After')) >= 1);
});

test('非 GET/OPTIONS 方法返回 405', async () => {
  const response = await callWorker(workerRequest('/api/v1/health', { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, OPTIONS');
  assert.equal((await response.json()).error.code, 'METHOD_NOT_ALLOWED');
});

test('OPTIONS 预检请求返回 CORS 头', async () => {
  const response = await callWorker(
    workerRequest(SEARCH_PATH, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example.com',
        'Access-Control-Request-Method': 'GET',
      },
    })
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
});

test('配置来源白名单时只允许列出的来源', async () => {
  const env = {
    ...TEST_ENV,
    CORS_ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com',
  };

  const allowed = await callWorker(
    workerRequest('/api/v1/health', { headers: { Origin: 'https://app.example.com' } }),
    env
  );
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://app.example.com');
  assert.equal(allowed.headers.get('Vary'), 'Origin');

  const denied = await callWorker(
    workerRequest('/api/v1/health', { headers: { Origin: 'https://evil.example.com' } }),
    env
  );
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});

test('未知路由返回 404', async () => {
  const response = await callWorker(workerRequest('/api/v1/unknown'));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'NOT_FOUND');
});
