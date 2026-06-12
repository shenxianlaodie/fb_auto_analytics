# FB Auto Analytics

Facebook 广告发布与数据分析平台。将 **Facebook Marketing API** 广告数据与 **Shoplazza** 店铺 UTM 转化数据打通，支持广告管理、仪表盘、跨账户汇总、SPU 排行、批量发布等功能。

---

## 目录

- [功能概览](#功能概览)
- [系统架构](#系统架构)
- [数据策略（DB-First）](#数据策略db-first)
- [各功能数据来源与处理](#各功能数据来源与处理)
- [指标口径](#指标口径)
- [定时同步任务](#定时同步任务)
- [环境配置](#环境配置)
- [本地开发](#本地开发)
- [生产部署](#生产部署)
- [项目结构](#项目结构)
- [API 概览](#api-概览)
- [权限与角色](#权限与角色)
- [常见问题](#常见问题)

---

## 功能概览

| 页面 | 路径 | 说明 |
|------|------|------|
| 数据仪表盘 | `/` | 花费、UTM 转化、ROAS 总览；按广告系列排行 |
| 广告管理 | `/ads` | 三层 Tab（系列 / 组 / 广告）；FB 指标 + Shoplazza UTM 合并展示 |
| 创建广告 | `/ads/create` | 三步向导：系列 → 组 → 广告；支持草稿 |
| 跨账户汇总 | `/cross-account` | 多广告账户花费与 UTM 汇总对比 |
| SPU TOP 榜 | `/spu-top` | 按店铺 SPU 近 14 天销售排行 |
| 批量发布 | `/batch` | CSV 模板上传，批量创建广告 |
| 店铺 Token | `/shop-tokens` | 管理 Shoplazza Open API 凭证（管理员） |
| 店铺映射 | `/shop-mapping` | 广告账户 ↔ 店铺绑定（管理员） |
| Token 池 | `/token-pool` | 管理多个 Facebook Access Token（管理员） |
| 用户管理 | `/users` | 钉钉用户角色管理（管理员） |

**登录方式**：钉钉 OAuth 登录 → 首次使用需绑定 Facebook Token（`/connect-facebook`）。

---

## 系统架构

```
┌─────────────┐     HTTPS      ┌──────────────────────────────────────┐
│  React 前端  │ ◄────────────► │  fb-web（Express API + 静态资源）      │
└─────────────┘                └──────────────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
            ┌──────────────┐         ┌──────────────┐         ┌─────────────────┐
            │  PostgreSQL   │         │ Facebook API │         │ Shoplazza API   │
            │  (主业务库)    │         │ Graph API    │         │ Open API        │
            └──────────────┘         └──────────────┘         └─────────────────┘
                    ▲
                    │ 定时写入
            ┌──────────────┐
            │  fb-sync      │  独立进程：Cron 定时同步
            │  (syncWorker) │
            └──────────────┘
```

| 层 | 技术 |
|---|------|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + Zustand + Recharts |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | PostgreSQL |
| 外部 API | Facebook Marketing API (Graph API)、Shoplazza Open API |
| 认证 | 钉钉 OAuth + JWT；Facebook Token 池轮换 |

**进程说明**：

- `fb-web`：对外提供 API 与前端页面；用户浏览页面时触发「热同步」
- `fb-sync`：后台 Cron，定时拉取 Facebook / Shoplazza 数据写入数据库

---

## 数据策略（DB-First）

核心业务页面（广告管理、仪表盘、跨账户汇总）采用 **DB-First**：

1. 前端请求 → 后端**立即从 PostgreSQL 读库**返回
2. 同时后台异步触发同步（若 TTL 过期）
3. 同步完成后，前端轮询或下次刷新看到新数据

**时区**：业务日期统一按 **东八区（UTC+8）** 计算「今天」，可通过环境变量 `APP_TIMEZONE_OFFSET=8` 调整。

**Facebook 同步范围**：仅同步 **当日有花费（spend > 0）** 的广告及其所属系列/组，以降低 API 调用量、减少限流。

---

## 各功能数据来源与处理

### 1. 广告管理（`/ads`）

**数据来源**

| 数据 | 来源 | 存储表 |
|------|------|--------|
| 花费、CPM | Facebook Insights API | `fb_ads` |
| 系列/组/广告名称、状态、预算 | Facebook Graph API（按 ID 批量拉取） | `fb_campaigns`、`fb_adsets`、`fb_ads_meta` |
| UV、加购、结账、订单、销售额 | Shoplazza UTM API | `shoplazza_utm` |
| 账户-店铺绑定 | 管理员配置 | `account_shop_mapping` |

**获取方式**

1. **花费指标（MetricsSync）**
   - API：`GET act_{account_id}/insights`
   - 参数：`level=ad`，`filtering: spend > 0`，`time_range` 为查询日期
   - 字段：`ad_id, ad_name, adset_id, campaign_id, spend, cpm`
   - 写入 `fb_ads`（按 `ad_account_id + ad_id + date_start + date_end` 去重）

2. **结构同步（StructureSync）**
   - 先用同一次 insights 拿到有花费广告的 `ad_id / campaign_id / adset_id`
   - 再用 Facebook **Batch API** 按 ID 批量拉取系列、组、广告详情
   - 写入 `fb_campaigns`、`fb_adsets`、`fb_ads_meta`

3. **UTM 同步（UtmMatchService）**
   - API：Shoplazza 店铺 Open API
   - 拉取 `utm_content`（对应广告 ID）和 `utm_campaign`（活动关键词）
   - 写入 `shoplazza_utm`（`dimension` 区分维度）

**数据处理方法（读库合并）**

- 服务：`HierarchyService.getHierarchyFromDb()`
- 以 `fb_ads_meta` 为广告列表主表，关联 `fb_ads` 花费
- UTM 匹配规则：
  - **utm_content**：`fb_ads.ad_id` = `shoplazza_utm.utm_value`（精确匹配）
  - **utm_campaign**：广告 `post_id` / `story_id` 被 `utm_campaign` 值包含匹配
- 系列/组花费：由子级广告花费向上汇总（rollup）
- 投放状态：子级有 `ACTIVE` → 父级显示投放中

**前端交互**

- 打开页面 / 切换账户或日期 → `GET /api/analytics/hierarchy`（读库 + 触发热同步）
- 点击刷新 → `POST /api/analytics/refresh`（强制同步）
- 每 60 秒静默读库；切回标签页时读库

---

### 2. 数据仪表盘（`/`）

**数据来源**：与广告管理相同，读 `HierarchyService` 汇总结果（`DashboardService`）。

**获取方式**

- `GET /api/analytics/dashboard?accountId=&dateStart=&dateEnd=`
- 从数据库聚合：总花费、UTM UV/订单/销售额、ROAS、系列花费排行

**数据处理**：对广告层级数据做加总，不额外调用 Facebook 实时 API。

---

### 3. 跨账户汇总（`/cross-account`）

**数据来源**：`ad_accounts` 全量账户 + 各账户 `HierarchyService` 汇总。

**获取方式**

- `GET /api/analytics/cross-account?dateStart=&dateEnd=`
- 并行读库，按账户汇总 spend / UTM 指标

---

### 4. SPU TOP 榜（`/spu-top`）

**数据来源**：Shoplazza 店铺商品销售数据。

**获取方式**

- Cron 每 5 分钟：`SpuTopSyncService.syncAllShopsSpuTop()`
- API：Shoplazza 按 SPU 聚合近 **14 天**销售指标
- 写入 `shoplazza_spu_top`；保留 **30 天**历史快照

**数据处理**

- 按店铺拉取 → 清洗合并 → 计算综合得分 `composite_score` → 排行展示
- 管理员可手动调整列顺序、刷新

---

### 5. 创建广告 / 编辑 / 复制（`/ads/create`、`EditModal`）

**数据来源**：实时调用 Facebook Marketing API（不经由同步表）。

**获取方式**

- 创建/更新/复制：`POST/PUT` → `campaignService` / `adsetService` / `adService`
- 元数据（主页、Pixel、兴趣）：`GET /api/meta/pages|pixels|interests`
- 图片/视频上传：`POST /api/upload/image|video` → Facebook Ad Images/Videos API
- 草稿：`ad_drafts` 表本地存储

**数据处理**：操作成功后触发 `reload()` 读库刷新列表。

---

### 6. 批量发布（`/batch`）

**数据来源**：用户上传 CSV + Facebook API 逐条创建。

**获取方式**

- 下载模板：`GET /api/batch/template`
- 上传：`POST /api/batch/upload` → 解析 CSV → `BatchService` 逐行调用 FB API
- 进度：`GET /api/batch/status/:jobId`（`batch_jobs` 表）

---

### 7. 店铺 Token & 店铺映射

| 配置 | 作用 |
|------|------|
| `shop_credentials` | Shoplazza Open API 的 `shop_id`、`access_token`、域名 |
| `account_shop_mapping` | 将广告账户名/ID 映射到具体店铺，用于 UTM 数据关联 |

未配置映射的账户：FB 花费正常显示，UTM 列为 `-`。

---

### 8. Token 池（`/token-pool`）

**作用**：管理多个 Facebook Access Token，供同步与 API 调用轮换使用。

**Token 选取优先级**（`tokenPool.getTokenForAccount`）：

1. `assigned_accounts` 中绑定了该账户的 Token
2. `ad_accounts.user_id` 关联的用户 Token
3. 池内轮换可用 Token

**限流保护**：

- 账户级限流（FB 错误码 17 + subcode 2446079）→ 账户冷却 10 分钟
- 配额水位 ≥80% 降频，≥95% 熔断跳过同步
- 限流事件在 Token 池页面「最近限流记录」中展示

---

## 指标口径

| 前端指标 | 计算公式 | 分子来源 | 分母来源 |
|----------|----------|----------|----------|
| 已花费金额 | `spend` | Facebook | — |
| CPM | `cpm` | Facebook | — |
| 成效（订单） | `orders` | Shoplazza UTM | — |
| 单次成效花费 | `spend ÷ orders` | Facebook | Shoplazza |
| 单次连接点击花费 | `spend ÷ uv` | Facebook | Shoplazza |
| 单次加购费用 | `spend ÷ add_to_cart` | Facebook | Shoplazza |
| 单次结账费用 | `spend ÷ begin_checkout` | Facebook | Shoplazza |
| ROAS | `sales ÷ spend` | Shoplazza | Facebook |

**说明**：

- 「成效」= Shoplazza `utm_content` 维度下的 `orders`，**不是** Facebook Pixel 网站购物转化
- UTM 未匹配时相关列显示 `-`，广告行可能标红提示
- 投放状态由子级汇总，与 FB 后台「系列自身状态」可能略有差异

---

## 定时同步任务

由 `server/src/syncWorker.ts`（`fb-sync` 进程）调度：

| 任务 | 频率 | 说明 |
|------|------|------|
| Facebook 指标 + 结构 | 每 **5 分钟** | 仅有花费账户；TTL 5 分钟 |
| Shoplazza UTM | 每 **5 分钟** | 按店铺全量拉 utm_content / utm_campaign |
| SPU TOP | 每 **5 分钟** | 各店铺 14 天 SPU 销售 |
| 历史指标回填 | 每天 **03:30** | 过去 30 天按天写入 `fb_ads`，供历史日期查询 |

**热路径（用户浏览时）**

| 类型 | TTL |
|------|-----|
| 活跃账户 metrics | 2～5 分钟（按账户规模分档） |
| 活跃账户 structure | 5 分钟 |
| 活跃店铺 UTM | 2 分钟 |

**冷路径筛选**：Cron 遍历 `ad_accounts` 全部账户，仅 **当日有花费** 或 **用户正在查看** 或 **sync_priority=true** 的账户纳入同步队列。

---

## 环境配置

```bash
cp .env.example server/.env
```

主要环境变量：

```env
# Facebook App
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_REDIRECT_URI=https://your-domain/api/tokens/connect-callback
FACEBOOK_API_VERSION=v19.0
FB_PROXY=                          # 可选，访问 FB API 的代理

# JWT
JWT_SECRET=

# 服务
SERVER_PORT=3000
APP_TIMEZONE_OFFSET=8              # 业务时区，默认东八区

# PostgreSQL（主库）
PG_HOST=
PG_PORT=5432
PG_USER=
PG_PASSWORD=
PG_DATABASE=fb_ad_analytics
PG_SSL=false

# Shoplazza（可与主库同实例，库名可相同）
SHOPLAZZA_PG_DATABASE=fb_ad_analytics
SHOPLAZZA_API_VERSION=2025-06
SHOPLAZZA_TIME_ZONE=8

# 钉钉登录
DINGTALK_APP_KEY=
DINGTALK_APP_SECRET=
DINGTALK_REDIRECT_URI=https://your-domain/api/auth/dingtalk-callback
```

### Facebook App 配置要点

1. [Facebook Developers](https://developers.facebook.com/) 创建「商务」类型应用
2. 添加 **Marketing API** 产品
3. OAuth 重定向 URI 配置为 Token 绑定回调地址
4. 所需权限：`ads_read`、`ads_management`、`public_profile`、`email`

### 首次使用流程

1. 钉钉登录系统
2. 管理员在 **Token 池** 添加 Facebook 长效 Token（或用户自行绑定）
3. 管理员配置 **店铺 Token** 与 **店铺映射**
4. 选择广告账户，等待 5 分钟内自动同步，或手动点击刷新

---

## 本地开发

```bash
# 安装依赖
cd server && npm install
cd ../client && npm install

# 终端 1：后端 API
cd server
npm run dev          # tsx watch，默认 http://localhost:3000

# 终端 2：前端
cd client
npm run dev          # Vite，默认 http://localhost:5173

# 终端 3：定时同步（可选，本地调试同步逻辑）
cd server
npx tsx src/syncWorker.ts
```

生产环境前后端可合并：`client npm run build` 后由 Express 托管 `client/dist` 静态资源。

---

## 生产部署

```bash
# 编译
cd server && npm run build
cd ../client && npm run build

# PM2 示例（两个进程）
pm2 start server/dist/app.js --name fb-web
pm2 start server/dist/syncWorker.js --name fb-sync
```

| 进程 | 职责 |
|------|------|
| `fb-web` | HTTPS API + 前端静态资源 |
| `fb-sync` | 定时同步，必须独立运行 |

查看同步日志：

```bash
pm2 logs fb-sync
pm2 logs fb-web
```

---

## 项目结构

```
fb_auto_analytics/
├── client/                          # React 前端
│   └── src/
│       ├── pages/                   # 页面（Dashboard、AdsManager、SpuTop…）
│       ├── components/              # 通用组件、图表
│       ├── store/                   # Zustand 状态（账户、日期、向导草稿）
│       └── services/api.ts          # Axios 封装
├── server/
│   └── src/
│       ├── routes/                  # API 路由
│       ├── services/                # 业务逻辑
│       │   ├── metricsSyncService.ts    # FB 花费同步（仅 spend>0）
│       │   ├── structureSyncService.ts  # FB 结构同步（insights+batch）
│       │   ├── utmMatchService.ts       # Shoplazza UTM 同步
│       │   ├── hierarchyService.ts      # 读库合并 FB+UTM
│       │   ├── syncSchedulerService.ts  # 同步调度（热/冷路径）
│       │   ├── tokenPool.ts             # FB Token 池
│       │   └── shoplazzaClient.ts       # Shoplazza API 客户端
│       ├── models/                  # 数据库访问层
│       └── syncWorker.ts            # Cron 入口（fb-sync）
├── docs/                            # 设计文档与计划
├── .env.example
└── README.md
```

### 核心数据表

| 表名 | 用途 |
|------|------|
| `fb_ads` | 广告级花费指标（按天） |
| `fb_campaigns` / `fb_adsets` / `fb_ads_meta` | 广告结构元数据 |
| `shoplazza_utm` | 店铺 UTM 转化（utm_content / utm_campaign） |
| `account_shop_mapping` | 广告账户 ↔ 店铺映射 |
| `shop_credentials` | 店铺 API 凭证 |
| `fb_token_pool` | Facebook Token 池 |
| `sync_state` | 各账户/店铺同步时间与 refreshing 状态 |
| `shoplazza_spu_top` | SPU 销售排行快照 |
| `ad_drafts` | 创建广告向导草稿 |

---

## API 概览

### 认证

```
GET  /api/auth/login              钉钉登录 URL
GET  /api/auth/dingtalk-callback  钉钉回调
GET  /api/auth/status             登录状态
GET  /api/auth/me                 当前用户
```

### 分析与同步（DB-First，推荐）

```
GET  /api/analytics/hierarchy     广告三层结构 + FB/UTM 指标
GET  /api/analytics/dashboard     仪表盘汇总
GET  /api/analytics/cross-account 跨账户汇总
POST /api/analytics/refresh       强制同步并返回最新读库结果
POST /api/analytics/sync          触发同步（不阻塞）
GET  /api/analytics/spu-top       SPU TOP 榜
```

### 广告 CRUD（实时 FB API）

```
GET/POST/PUT/DELETE  /api/campaigns
GET/POST/PUT/DELETE  /api/adsets
GET/POST/PUT/DELETE  /api/ads
POST                 /api/campaigns/:id/copy
POST                 /api/adsets/:id/copy
POST                 /api/ads/:id/copy
POST                 /api/bulk/status          批量开停
```

### 配置与管理

```
GET/POST/DELETE  /api/analytics/shop-mappings
GET/POST/DELETE  /api/analytics/shop-tokens
GET/POST/PUT/DELETE  /api/tokens              Token 池（管理员）
GET  /api/accounts                            广告账户列表
GET  /api/batch/template|status/:id           批量发布
```

---

## 权限与角色

| 角色 | 能力 |
|------|------|
| 普通用户 | 查看分析、管理自己有权访问的广告账户 |
| 管理员 | 店铺 Token、店铺映射、Token 池、用户管理、SPU 榜配置 |

登录凭证为 JWT（7 天有效），存于前端 localStorage。

---

## 常见问题

### 广告管理显示全 0 / 暂无广告系列

1. 确认账户今日是否有花费（无花费不会同步）
2. 检查 **店铺映射** 是否配置（不影响 FB 花费，但影响 UTM）
3. 查看 `pm2 logs fb-sync` 是否有限流（`2446079`）或权限错误（`403`）
4. 等待冷却结束后点击刷新，或联系管理员检查 Token 池

### 花费正确但成效为 `-`

UTM 未匹配。确认 Shoplazza 的 `utm_content` 与 Facebook `ad_id` 一致，且店铺映射正确。

### 账户一直限流

大账户 + 频繁刷新会触发 Facebook **广告账户级** API 配额。建议：

- 减少手动刷新频率
- 等待 10～30 分钟冷却
- 在 Token 池查看限流记录

### 数据延迟多久？

- 冷路径：最多约 5 分钟（Cron 周期）
- 热路径（正在浏览的账户）：2～5 分钟
- 手动刷新：触发后立即排队同步，通常 1～2 分钟内更新

---

## 许可证

内部项目，未经授权请勿对外分发。
