# Game Data Service

一个独立部署在 **Cloudflare Workers** 上的游戏资料查询服务。通过 Steam 商店接口获取游戏数据，对外提供统一、稳定的 REST + JSON API，供其他应用复用。

- 不需要 Steam API Key，不需要 Twitch OAuth。
- 不使用数据库，不使用服务端框架，无第三方运行时依赖。
- 只使用 Cloudflare Workers 免费套餐即可部署。
- 中文资料来自 Steam 商店的官方简体中文本地化内容，不做机器翻译。

> 版本：1.0.0（第一阶段）

---

## 1. 功能概览

| 能力 | 说明 |
|---|---|
| 游戏搜索 | 按关键词搜索 Steam 游戏，返回 AppID、名称、缩略图 |
| 游戏详情 | 按 AppID 获取名称、简介、详细描述、封面、截图、开发商、发行商、类型、发行日期、平台 |
| 中文校验 | 详情必须存在名称与官方简体中文简介，否则返回 `CHINESE_DATA_UNAVAILABLE` |
| 缓存 | 搜索结果缓存 1 小时，游戏详情缓存 7 天（依赖部署环境的 Cache API 能力） |
| 跨域 | 支持浏览器 CORS，可配置允许来源 |
| 防护 | 参数校验、8 秒上游超时、错误码、按客户端频率限制 |

---

## 2. 技术架构

| 项目 | 技术 |
|---|---|
| 运行环境 | Cloudflare Workers |
| 编程语言 | JavaScript（ES Modules） |
| 部署工具 | Wrangler 4 |
| 数据来源 | Steam Store API |
| HTTP 请求 | 原生 `fetch` |
| 缓存 | Cloudflare Cache API（部署环境支持时） |
| 数据存储 | 第一阶段无 |
| API 格式 | REST + JSON |

请求链路：

```text
客户端
  │  GET /api/v1/...
  ▼
src/index.js           入口：CORS、方法限制、频率限制、错误兜底
  │
  ▼
src/router.js          路由、参数校验、统一响应
  │
  ▼
src/services/          业务编排、缓存读取/写入
  │            │
  ▼            ▼
Cache API    src/providers/steam/   Steam 适配、标准化、中文校验
                   │
                   ▼
          store.steampowered.com
```

设计要点：

- 上游数据与内部数据结构解耦，Provider 层负责把 Steam 响应转换为统一结构。
- 服务层不感知 Steam 细节，未来可以新增 IGDB、RAWG 等 Provider。
- 不引入 Express、ORM、依赖注入框架等不必要的抽象。

---

## 3. 项目目录

```text
.
├── src/
│   ├── index.js                    Worker 入口：CORS、限流、错误处理
│   ├── router.js                   HTTP 路由
│   ├── config.js                   统一配置与运行时环境变量解析
│   ├── providers/
│   │   └── steam/
│   │       ├── client.js           Steam HTTP 客户端（超时、状态码、JSON 校验）
│   │       ├── search.js           游戏搜索
│   │       ├── detail.js           游戏详情
│   │       └── normalizer.js       数据标准化与中文资料校验
│   ├── services/
│   │   ├── game-service.js         业务编排（搜索/详情 + 缓存）
│   │   └── cache-service.js        Cache API 封装与缓存 Key 构造
│   ├── middleware/
│   │   ├── cors.js                 CORS 响应头与 OPTIONS 预检
│   │   ├── error-handler.js        统一错误响应
│   │   └── rate-limit.js           单实例内存频率限制
│   └── utils/
│       ├── response.js             统一 JSON 响应
│       ├── validation.js           参数校验、中文字符检测
│       ├── html.js                 HTML 转纯文本（仅用于中文校验）
│       └── errors.js               业务错误类型
├── test/
│   ├── search.test.js              搜索接口测试
│   ├── detail.test.js              详情接口测试
│   ├── normalizer.test.js          标准化、中文校验、参数校验测试
│   ├── cache.test.js               缓存命中/过期/失败降级/隔离测试
│   └── helpers.js                  测试工具（模拟 fetch、构造响应）
├── package.json
├── wrangler.toml
├── .gitignore
└── README.md
```

---

## 4. 本地环境准备

要求：

- **Node.js 20 或更高版本**（Wrangler 4 的要求；`package.json` 已声明 `engines.node >= 20`）
- npm
- 无需 Steam API Key
- 无需数据库

检查版本：

```bash
node -v
npm -v
```

如果使用 nvm：

```bash
nvm install 20
nvm use 20
```

安装依赖：

```bash
npm install
```

---

## 5. Cloudflare 账号准备

仅部署时需要：

1. 注册并登录 [Cloudflare](https://dash.cloudflare.com/)，免费套餐即可。
2. 在终端登录 Wrangler：

```bash
npx wrangler login
```

3. 确认登录状态：

```bash
npx wrangler whoami
```

`wrangler.toml` 中的 `name = "player-pass"` 是 Worker 名称，也决定 `workers.dev` 域名的前缀（`player-pass.<你的账号子域>.workers.dev`）。如果该名称已被占用，改成自己的名称并同步更新部署地址即可。

---

## 6. 本地运行

```bash
npm run dev
```

Wrangler 默认在 `http://localhost:8787` 启动本地 Worker。常用验证命令：

```bash
curl http://localhost:8787/api/v1/health
```

```bash
curl 'http://localhost:8787/api/v1/games/search?q=Hollow%20Knight'
```

```bash
curl 'http://localhost:8787/api/v1/games/367520'
```

> 搜索关键词请使用 `encodeURIComponent` 编码。Steam 搜索接口对中文关键词的匹配能力有限，建议先用英文或游戏原名搜索；详情接口会返回 Steam 的官方简体中文内容（见第 12 节）。

---

## 7. 测试方法

```bash
npm test
```

测试使用 Node.js 内置测试运行器（`node --test`），不依赖真实 Steam 服务：所有 Steam 响应均由测试代码模拟（`test/helpers.js` 替换全局 `fetch`）。

当前共 54 个测试，覆盖：

- 搜索：中文/英文关键词、空关键词、超长关键词、空结果、异常结构、非 app 过滤、无效 AppID 过滤、去重、limit、非 JSON、HTTP 错误、超时（含响应体读取超时）。
- 详情：正常详情、无效 AppID、游戏不存在、缺少名称、缺少简介、纯英文简介、纯 HTML 简介、图片/可选字段缺失、超时、非 JSON、`success=true` 但缺少 `data`。
- 标准化与校验：字段映射、HTML 原文保留、capsule 回退、中文检测、AppID/limit/关键词校验、HTML 实体解码。
- 缓存：命中不重复请求、过期后重新请求、写入失败不影响响应、读取失败降级、不同 AppID 不串缓存、错误结果不缓存、Worker 全链路集成、workers.dev 下 `BYPASS`。
- 接口行为：CORS 预检、来源白名单、405 方法限制、404 路由、429 频率限制。

---

## 8. Cloudflare 部署方法

```bash
npm run deploy
```

等价于 `npx wrangler deploy`。首次部署前需要完成 `npx wrangler login`。

部署成功后，Wrangler 会输出 Worker 地址，形如：

```text
https://player-pass.<你的账号子域>.workers.dev
```

部署后验证：

```bash
curl https://player-pass.<你的账号子域>.workers.dev/api/v1/health
```

### 环境变量

在 `wrangler.toml` 的 `[vars]` 中配置（修改后重新部署），也可以在 Cloudflare Dashboard 的 Worker 设置中修改：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | `*` | 允许的来源，逗号分隔；`*` 表示允许所有来源 |
| `RATE_LIMIT_MAX` | `120` | 每个客户端的请求上限（每窗口） |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | 频率限制窗口（秒） |

生产环境建议把 `CORS_ALLOWED_ORIGINS` 改成明确的来源列表，例如：

```toml
[vars]
CORS_ALLOWED_ORIGINS = "https://app.example.com,https://admin.example.com"
RATE_LIMIT_MAX = "120"
RATE_LIMIT_WINDOW_SECONDS = "60"
```

### 自定义域名与缓存

`workers.dev` 域名可以正常提供 API，但 **Cloudflare 的 Cache API 在 `*.workers.dev` 上不生效**。如果需要真正的持久缓存：

1. 在 Cloudflare 中托管一个域名（接入该域名的 DNS）。
2. 在 Dashboard 的 Workers & Pages → 选择该 Worker → Settings → Domains & Routes → 添加 Custom Domain（或配置 Route）。
3. 通过自定义域名访问服务。

本服务会检测 `*.workers.dev` 主机名并直接返回 `X-Cache: BYPASS`，不会把未生效的缓存伪装成命中。详见第 14 节。

---

## 9. API 接口文档

统一前缀：`/api/v1`

所有接口只接受 `GET` 与 `OPTIONS`。成功响应为 `application/json; charset=utf-8`。

### 9.1 健康检查

```http
GET /api/v1/health
```

响应：

```json
{
  "success": true,
  "service": "game-data-service",
  "version": "1.0.0"
}
```

### 9.2 搜索游戏

```http
GET /api/v1/games/search?q=Hollow%20Knight&limit=10
```

参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `q` | 是 | 游戏名称，不能为空，最长 100 个字符 |
| `limit` | 否 | 返回数量，默认 10，范围 1–10 |

响应：

```json
{
  "success": true,
  "data": {
    "games": [
      {
        "appId": 367520,
        "name": "Hollow Knight",
        "image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/.../capsule_231x87.jpg",
        "source": "steam"
      }
    ],
    "total": 1
  }
}
```

说明：

- 只返回 `type=app` 的结果。
- 过滤无效 AppID 与缺少名称的结果。
- 按 AppID 去重，保留 Steam 原始返回顺序。
- `total` 是本次实际返回的条数（搜索接口没有分页）。
- 搜索结果中的 `name` 是 Steam 返回的原文，可能是英文；**不代表官方简体中文名称**。中文资料以详情接口的校验结果为准。
- 搜索接口不保证结果一定具有简体中文资料，详情接口负责进一步校验。

### 9.3 获取游戏详情

```http
GET /api/v1/games/367520
```

响应：

```json
{
  "success": true,
  "data": {
    "appId": 367520,
    "name": "Hollow Knight",
    "description": "在《空洞骑士》中打造属于自己的冒险之旅！……",
    "detailedDescription": "<p>……</p>",
    "about": "<h2>关于这款游戏</h2><p>……</p>",
    "cover": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/.../header.jpg",
    "capsule": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/.../capsule_184x69.jpg",
    "screenshots": [
      {
        "id": 0,
        "thumbnail": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/....600x338.jpg",
        "full": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/....1920x1080.jpg"
      }
    ],
    "developers": ["Team Cherry"],
    "publishers": ["Team Cherry"],
    "genres": ["动作", "冒险", "独立"],
    "releaseDate": "2017 年 2 月 24 日",
    "platforms": {
      "windows": true,
      "mac": true,
      "linux": true
    },
    "source": "steam",
    "language": "schinese",
    "sourceUrl": "https://store.steampowered.com/app/367520/"
  }
}
```

字段来源与缺失时的取值：

| API 字段 | Steam 字段 | 缺失时 |
|---|---|---|
| `appId` | 路径参数 | — |
| `name` | `data.name` | `null`（触发 422） |
| `description` | `data.short_description` | `null`（触发 422） |
| `detailedDescription` | `data.detailed_description` | `null` |
| `about` | `data.about_the_game` | `null` |
| `cover` | `data.header_image` | `null` |
| `capsule` | `data.capsule_imagev5`，回退 `data.capsule_image` | `null` |
| `screenshots[].id` | `id` | `null` |
| `screenshots[].thumbnail` | `path_thumbnail` | `null` |
| `screenshots[].full` | `path_full` | `null` |
| `developers` / `publishers` | 同名数组 | `[]` |
| `genres` | `genres[].description` 组成的字符串数组 | `[]` |
| `releaseDate` | `release_date.date` | `null` |
| `platforms` | `platforms.windows/mac/linux` | `false` |
| `source` | 固定 `steam` | — |
| `language` | 固定 `schinese` | — |
| `sourceUrl` | 由 AppID 构造的 Steam 商店地址 | — |

说明：

- 缺少的可选字段返回 `null` 或空数组，不凭空补充内容。
- 图片 URL 与 HTML 描述保留 Steam 上游真实内容，不做改写。
- `detailedDescription`、`about`、`description` 可能包含 HTML；服务端保留原始格式，前端展示前必须自行清理（见第 15 节）。
- 游戏名称允许是英文品牌名（例如 `Hollow Knight`）；中文简介必须存在且包含中文字符。

### 9.4 错误响应

```json
{
  "success": false,
  "error": {
    "code": "CHINESE_DATA_UNAVAILABLE",
    "message": "该游戏没有可用的官方简体中文资料"
  }
}
```

| 错误码 | HTTP 状态 | 说明 |
|---|---:|---|
| `INVALID_PARAMS` | 400 | 参数错误（关键词为空/超长、AppID 非正整数、limit 越界） |
| `GAME_NOT_FOUND` | 404 | 游戏不存在或无法获取 |
| `CHINESE_DATA_UNAVAILABLE` | 422 | 缺少符合要求的简体中文资料 |
| `UPSTREAM_ERROR` | 502 | Steam 接口异常（HTTP 错误、非 JSON、结构异常） |
| `UPSTREAM_TIMEOUT` | 504 | Steam 请求超时（8 秒） |
| `RATE_LIMITED` | 429 | 客户端请求频率超限 |
| `INTERNAL_ERROR` | 500 | 服务内部错误 |
| `METHOD_NOT_ALLOWED` | 405 | 使用了 GET/OPTIONS 以外的方法（响应含 `Allow` 请求头） |
| `NOT_FOUND` | 404 | 接口路径不存在 |

### 9.5 响应头

| 响应头 | 说明 |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` |
| `X-Cache` | `HIT`（命中缓存）、`MISS`（未命中，已请求上游）、`BYPASS`（当前环境不支持缓存，直接请求上游） |
| `Retry-After` | 仅 429 响应，建议重试的秒数 |
| `Access-Control-Allow-Origin` 等 | 按 CORS 配置返回；`X-Cache` 通过 `Access-Control-Expose-Headers` 暴露 |

`X-Cache` 便于调用方和运维判断缓存行为；即使缓存不可用，接口本身仍然正常工作。

---

## 10. 前端集成示例

搜索：

```javascript
const response = await fetch(
  `${API_BASE_URL}/api/v1/games/search?q=${encodeURIComponent(keyword)}`
);
const result = await response.json();

if (!result.success) {
  // result.error.code 用于区分错误类型
}
```

详情：

```javascript
const response = await fetch(`${API_BASE_URL}/api/v1/games/367520`);
const result = await response.json();

if (!result.success) {
  switch (result.error.code) {
    case 'GAME_NOT_FOUND':
      // 游戏不存在
      break;
    case 'CHINESE_DATA_UNAVAILABLE':
      // 缺少官方简体中文资料
      break;
    case 'UPSTREAM_TIMEOUT':
    case 'UPSTREAM_ERROR':
      // 上游暂时不可用，可提示稍后重试
      break;
    default:
      break;
  }
}
```

前端可以区分：搜索成功、没有搜索结果（`success: true` 且 `games: []`）、游戏不存在、缺少官方简体中文资料、上游暂时不可用。

---

## 11. 安全设计

### 11.1 参数校验

- AppID 必须是正整数，拒绝 `0`、负数、小数、非数字、超出安全整数范围的值。
- 搜索关键词不能为空（去除首尾空格后），最长 100 个字符。
- `limit` 必须是 1–10 的整数，默认 10。
- 上游 URL 完全由服务端固定构造，用户参数只作为查询参数值写入，不允许构造任意上游地址。

### 11.2 上游请求

- 使用原生 `fetch`，8 秒超时（`AbortController`）。
- 检查 HTTP 状态码、JSON 解析、Steam `success` 字段与数据结构。
- 异常映射为 `UPSTREAM_ERROR` / `UPSTREAM_TIMEOUT`，不向客户端返回上游错误堆栈。
- 服务端日志只记录方法、路径、错误码和消息，不记录完整上游响应。

### 11.3 CORS 与方法限制

- 只允许 `GET` 和 `OPTIONS`，其他方法返回 405。
- 开发环境默认 `CORS_ALLOWED_ORIGINS=*`；生产环境可配置具体来源白名单。
- 预检请求返回 `Access-Control-Allow-Methods: GET, OPTIONS`、`Access-Control-Max-Age`。

### 11.4 频率限制

- 按客户端 IP 限制请求频率（默认 120 次/60 秒）。
- 超限返回 429 `RATE_LIMITED`，并带 `Retry-After`。
- 该实现基于 Worker 实例内存，属于尽力而为的防护：不同边缘节点、不同实例之间不共享计数，重新部署会重置。它不能替代 Cloudflare 平台级 WAF/Rate Limiting 规则。第一阶段不引入 KV/Durable Objects 等持久化设施。

### 11.5 HTML 内容安全（重要）

Steam 的 `short_description`、`about_the_game`、`detailed_description` 可能包含 HTML。本服务按上游原文返回，不做服务端清洗，以保留格式语义。**前端不得把未清理的 HTML 直接注入 DOM**，否则可能执行描述中的脚本或事件处理器。

推荐使用 DOMPurify 清理后再渲染：

```javascript
import DOMPurify from 'dompurify';

element.innerHTML = DOMPurify.sanitize(game.detailedDescription ?? '', {
  USE_PROFILES: { html: true },
});
```

如果只需要纯文本，可以设置 `element.textContent = ...`，但需要先自行把 HTML 转为纯文本。任何情况下都不要直接使用 `innerHTML = game.detailedDescription`。

---

## 12. Steam 数据来源及限制

使用两个商店接口（`l=schinese`、`cc=cn`）：

```text
GET https://store.steampowered.com/api/storesearch/?term=<关键词>&l=schinese&cc=cn
GET https://store.steampowered.com/api/appdetails?appids=<AppID>&l=schinese&cc=cn
```

限制与注意事项：

- 这两个接口不是具有正式稳定性承诺的公共 API，Steam 可能随时调整结构、限流或临时不可用。本项目已对状态码、非 JSON、字段缺失做防御处理，但仍需关注上游变化。
- 实测（2026-11-11）：
  - `storesearch` 响应通常只有 `total` 与 `items`，没有 `success` 字段；本项目只在明确返回 `success: false` 时按上游错误处理。
  - `storesearch` 对中文关键词的匹配能力有限。例如 `term=空洞骑士` 返回 0 条，而 `term=Hollow Knight` 能正确返回结果。因此建议客户端使用英文名或游戏原名搜索；这是 Steam 上游行为，本项目不做翻译或伪造结果。
  - 搜索结果的 `name` 是 Steam 搜索索引中的原文（经常是英文），不能当作官方简体中文名称。
  - `appdetails` 对不存在的 AppID 返回 HTTP 200 + `{"<appid>":{"success":false}}`，本项目转换为 404 `GAME_NOT_FOUND`。
  - 不同游戏的字段完整度差异很大：有的没有截图、发行日期、开发商等；缺失字段按约定返回 `null` 或 `[]`。
- 中文内容固定请求 `schinese` 本地化。详情接口只有在名称存在且简介包含中文字符时才返回成功，不会用英文资料冒充中文。

---

## 13. 中文资料校验规则

详情接口在返回前执行以下校验：

1. `name` 必须存在（非空字符串）。
2. `short_description` 必须存在（非空字符串）。
3. `short_description` 去除 HTML 标签、解码 HTML 实体后，必须包含中文字符（CJK 统一表意文字）。
4. 任一条不满足，返回 HTTP 422 + `CHINESE_DATA_UNAVAILABLE`。
5. 游戏名称允许是英文品牌名，不强制包含汉字。

说明：

- 中文字符检测只用于识别明显缺少中文的资料，不能作为语言质量或官方授权的绝对证明。
- 不做自动翻译，不把英文描述标记为简体中文，不把缺失的中文描述伪装成成功结果。
- 搜索接口不做该校验；搜索结果只代表 Steam 搜索命中，详情接口负责最终的中文可用性判断。

---

## 14. 缓存策略与部署环境限制

| 数据 | 缓存时间 | 缓存条件 |
|---|---|---|
| 游戏搜索结果 | 1 小时 | 仅成功响应 |
| 游戏详情 | 7 天 | 仅通过中文校验的成功响应 |
| 错误 / 超时结果 | 不缓存 | — |

实现方式与保证：

- 使用 Cloudflare Cache API（`caches.default`）存储 JSON 数据。
- 缓存 Key 由“当前请求的 origin + 规范化路径 + 完整查询条件”组成：
  - 搜索：`/api/v1/games/search?q=<关键词>&limit=<数量>&l=schinese&cc=cn`
  - 详情：`/api/v1/games/<AppID>?l=schinese&cc=cn`
  - 不同 AppID、不同关键词、不同 limit 使用不同的 Key，不会串数据。
- 缓存读取失败时降级为直接请求 Steam；缓存写入失败不影响本次响应。
- 响应头 `X-Cache` 为 `HIT` / `MISS` / `BYPASS`。
- 缓存 TTL 通过响应头 `Cache-Control: max-age/s-maxage` 声明；实际保留时间受 Cloudflare 缓存淘汰策略影响，TTL 是上限而不是保证。

### 部署环境差异（重要）

- **`*.workers.dev` 域名：Cache API 操作不生效**（Cloudflare 官方限制）。本服务检测到 `*.workers.dev` 主机名时会跳过缓存读写，并返回 `X-Cache: BYPASS`，不会宣称缓存已生效。此时每次请求都会访问 Steam。
- **自定义域名 / Zone Route：Cache API 可用。** 把自定义域名绑定到该 Worker 后，缓存才会真正生效。
- 缓存按数据中心生效，不做全局复制；不同边缘节点可能各自请求一次上游。
- `wrangler dev` 本地运行时，Cache API 由本地运行时模拟，可能在本地看到 `HIT`；这只能证明代码路径正常，不代表生产环境已经持久缓存。
- 第一阶段不引入 KV、R2、D1。如果必须在 workers.dev 上获得持久缓存，后续可以增加 KV 作为降级/补充方案（属于后续扩展，不在当前范围）。

降级行为总结：

| 场景 | 行为 |
|---|---|
| 无 Cache API / workers.dev | `BYPASS`，直接请求 Steam，正常返回 |
| 缓存未命中 | `MISS`，请求 Steam 后尝试写入 |
| 缓存命中 | `HIT`，直接返回缓存 JSON |
| 缓存读取异常 | 记录日志，降级请求 Steam |
| 缓存写入异常 | 记录日志，忽略，正常返回 |
| 上游错误 / 超时 | 不写入缓存，返回对应错误码 |

---

## 15. 扩展其他数据源

Provider 层与业务层解耦，后续可以新增 IGDB、RAWG 等数据源：

1. 新建 `src/providers/<source>/`，提供 `client.js`、`search.js`、`detail.js`、`normalizer.js`。
2. 标准化函数输出与 Steam Provider 相同的数据结构（`appId` 可改为 `sourceId` 等，但需要保持 API 契约一致）。
3. 在 `GameService` 中按配置选择 Provider，或在路由层增加数据源选择参数。
4. 在响应的 `source` 字段中返回新的数据源标识。

第一阶段只实现 Steam，不引入多数据源切换、数据库持久化或定时同步。

---

## 16. 第一阶段范围外

以下功能明确不在本阶段实现：

- 用户登录、权限管理、收藏、游戏库、游戏时长、账号绑定。
- 评论、社区、推荐、排行榜。
- 后台管理、资料手动编辑、自动翻译、多语言切换。
- IGDB、RAWG 等其他数据源。
- 数据库持久化、定时同步全部 Steam 游戏数据。
- KV/R2/D1 存储。

---

## 17. 已知限制

- Steam 搜索接口对中文关键词支持有限（见第 12 节）。
- `workers.dev` 域名上缓存不生效，需自定义域名才能启用 Cache API。
- 频率限制为单实例内存实现，不是全局配额。
- Steam 接口非正式公共 API，存在结构变化、限流和不可用风险。
- 搜索没有分页，最多返回 10 条。
