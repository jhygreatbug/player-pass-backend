import worker from '../src/index.js';

export const TEST_ENV = {
  CORS_ALLOWED_ORIGINS: '*',
  RATE_LIMIT_MAX: '100000',
  RATE_LIMIT_WINDOW_SECONDS: '60',
};

export function installFetchMock(t, responder) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url, init });
    return responder(url, init, calls);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return calls;
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function workerRequest(
  path,
  { method = 'GET', headers = {}, base = 'https://game-data-service.example.com' } = {}
) {
  return new Request(`${base}${path}`, { method, headers });
}

export function callWorker(request, env = TEST_ENV) {
  return worker.fetch(request, env, {});
}

export function steamSearchItem(overrides = {}) {
  return {
    type: 'app',
    id: 367520,
    name: 'Hollow Knight',
    tiny_image: 'https://cdn.example.com/367520/capsule_231x87.jpg',
    ...overrides,
  };
}

export function steamSearchPayload(items) {
  return { total: items.length, items };
}

export function steamDetailData(overrides = {}) {
  return {
    type: 'game',
    name: '空洞骑士',
    short_description: '<p>在《空洞骑士》中打造属于自己的冒险之旅！</p>',
    detailed_description: '<p>探索幽深的洞穴，与被感染的生物战斗。</p>',
    about_the_game: '<h2>关于这款游戏</h2><p>手绘风格的动作冒险游戏。</p>',
    header_image: 'https://cdn.example.com/367520/header.jpg',
    capsule_imagev5: 'https://cdn.example.com/367520/capsule_184x69.jpg',
    capsule_image: 'https://cdn.example.com/367520/capsule_231x87.jpg',
    screenshots: [
      {
        id: 0,
        path_thumbnail: 'https://cdn.example.com/367520/ss1.600x338.jpg',
        path_full: 'https://cdn.example.com/367520/ss1.1920x1080.jpg',
      },
    ],
    developers: ['Team Cherry'],
    publishers: ['Team Cherry'],
    genres: [
      { id: '1', description: '动作' },
      { id: '23', description: '独立' },
    ],
    release_date: { coming_soon: false, date: '2017 年 2 月 24 日' },
    platforms: { windows: true, mac: true, linux: true },
    ...overrides,
  };
}

export function steamDetailPayload(appId, data) {
  return { [String(appId)]: { success: true, data } };
}
