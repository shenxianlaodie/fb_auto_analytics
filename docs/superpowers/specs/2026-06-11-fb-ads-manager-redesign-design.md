# 广告管理页面 FB Ads Manager 化改造 — 设计文档

日期：2026-06-11
状态：已与需求方确认

## 1. 背景与目标

现有 `/ads` 广告管理页为 Campaign → AdSet → Ad 三层嵌套展开表格，创建/编辑为简单弹窗表单。本次改造目标：交互与功能对齐 Facebook Ads Manager（广告管理工具），分为两大块：

1. **管理界面**：FB 风格三层 Tab 平铺表格 + 勾选联动筛选 + 批量操作 + 复制
2. **创建向导**：完整分步创建流程（系列 → 组 → 广告），含受众定向、版位、预算排期、创意上传、实时预览、本地草稿、一键发布

### 范围边界（已确认）

- 营销目标只支持 **销售（转化）** 一种；购买类型固定竞拍
- 数据指标列维持现有前端展示的列，不新增 Breakdown/图表面板
- 受众定向：地区/年龄/性别 + 兴趣搜索（不做自定义受众/Lookalike）
- 版位：自动版位 + 平台级手动勾选（Facebook/Instagram/Messenger/Audience Network 四平台，不做具体位置级）
- 创意：单图片 + 视频（不做轮播 Carousel）
- 草稿：本地草稿（向导中途保存、下次继续编辑）
- 批量操作：批量开启/暂停 + 复制（不做批量删除、批量改预算）

## 2. 整体架构与路由

- `/ads`（路由不变）→ 重构后的 `AdsManager`：三层 Tab 管理界面
- `/ads/create` → 新增全屏创建向导；`/ads/create?draftId=x` 加载草稿继续编辑
- 数据展示链路不动：仍走 `GET /api/analytics/hierarchy`（DB-First）+ 60 秒轮询；前端将三层树扁平化分发到三个 Tab，后端零新增查询压力
- 写操作（创建/复制/批量状态/草稿）走新增或现有 REST API，成功后沿用现有 `writeBack` 写回本地库，列表即时可见
- 删除遗留无路由页面 `client/src/pages/Campaigns.tsx`、`AdSets.tsx`、`Ads.tsx` 及其专用 hooks（`useCampaigns/useAdSets/useAds` 中仅被遗留页使用的部分）

## 3. 管理界面设计

### 3.1 布局

```
顶栏：同步状态 + 刷新 + 日期区间 + 搜索 + [+ 创建] 按钮（绿色，FB 风格，旁带草稿下拉）
Tab 栏：[广告系列 (N)] [广告组 (N)] [广告 (N)]
联动提示条：「已筛选：2 个广告系列 ✕」（勾选上层后切换下层时显示，可一键清除）
批量操作条：勾选行后浮现 → [批量开启] [批量暂停] [复制] [取消选择]
表格：勾选框 | 开/关 Switch | 名称（hover 浮现 编辑/复制 快捷按钮）| 投放状态 | 现有全部指标列
```

### 3.2 交互

- **勾选联动**：系列 Tab 勾选 → 广告组/广告 Tab 自动只显示所选系列下数据；组 Tab 勾选同理过滤广告 Tab（与 FB 一致）。切换 Tab 不清除勾选；联动提示条可一键清除筛选。
- **复制**：弹窗选择复制份数、是否以暂停状态创建；广告组/广告还可选目标系列/组。调 FB 官方 `/copies` 接口，成功后写回本地库并刷新。
- **批量开/暂停**：后端逐条容错执行，前端汇总提示「成功 N 条、失败 M 条（含原因）」。
- **保留现有能力**：双击编辑预算、列顺序自定义（ColumnOrderSettings 按 Tab 维度复用）、UTM 未匹配标红、广告编号精确搜索、名称模糊搜索、日期区间（UTC+8）。
- **名称行内编辑**：hover 出现铅笔图标，点击变输入框，回车保存（调现有 PUT 接口）。

### 3.3 状态管理

- 新增 Zustand store `adsManagerStore`：当前 Tab、各层勾选 id 集合、联动筛选状态。
- hierarchy 数据加载与轮询逻辑从组件抽到 hook `useHierarchy`，三个 Tab 共享同一份数据。

## 4. 创建向导设计

### 4.1 布局

仿 FB：左侧树形步骤导航（广告系列 → 广告组 → 广告，显示完成状态），中间表单区，第 3 步右侧实时预览，底部操作栏（保存草稿 / 上一步 / 下一步 / 发布）。

### 4.2 步骤 1：广告系列

- 系列名称（必填）
- 营销目标：固定显示「销售」；购买类型：固定显示「竞拍」
- 预算优化（CBO）开关：开启则在本步填系列级日预算或总预算；关闭则预算在步骤 2 填

### 4.3 步骤 2：广告组

- 组名称（必填）
- 转化发生位置：固定「网站」；像素：下拉（`GET /api/meta/pixels`）；转化事件：默认 Purchase，可选 AddToCart、InitiateCheckout 等常用事件
- 预算与排期：日预算或总预算二选一（CBO 开启时隐藏）；开始时间默认立即；结束时间可选（总预算时必填）
- 受众：
  - 地区：国家多选搜索（前端内置国家列表）
  - 年龄：18–65+ 范围选择
  - 性别：全部 / 男 / 女
  - 兴趣定向：搜索框对接 `GET /api/meta/interests?q=`，多选标签展示
- 版位：「优势版位（自动，推荐）」/「手动版位」二选一；手动时勾选 Facebook / Instagram / Messenger / Audience Network（对应 targeting.publisher_platforms）

### 4.4 步骤 3：广告

- 广告名称（必填）
- 身份：Facebook 主页下拉（`GET /api/meta/pages`，解决现有创建链路 page_id 缺失问题）
- 格式：单图片 / 视频
- 素材上传：对接已有 `POST /api/upload/image`、`POST /api/upload/video`；视频需额外上传缩略图（图片）
- 文案：主要文本、标题、描述、CTA 按钮下拉（SHOP_NOW/LEARN_MORE 等常用项）、落地页 URL（必填，校验 URL 格式）
- 右侧实时预览：模拟 FB 移动端 Feed 帖子卡片（主页头像名称 + 文案 + 素材 + 标题/描述/CTA），随输入实时更新

### 4.5 发布

- 点击发布弹确认窗，含「以暂停状态发布」勾选（默认勾选，防误烧钱）
- 单次请求 `POST /api/publish` 提交完整 payload，后端串行执行：createCampaign → createAdSet →（上传已在前端完成，携带 image_hash/video_id）→ createAdCreative → createAd
- 返回分层结果 `{ campaignResult, adsetResult, adResult }`；中途失败提示失败层级与 FB 错误信息；已创建层级以暂停状态保留在 FB 并写回本地库
- 发布成功后跳回 `/ads` 并自动删除对应草稿

### 4.6 草稿

- 任意步骤可保存：整个向导表单状态（含已上传素材的 hash/id 与预览 URL）存为 JSONB
- `/ads` 页「创建」按钮旁下拉显示当前账户草稿列表（名称 + 更新时间），支持继续编辑、删除

## 5. 后端 API 与数据库

### 5.1 新增表

```sql
CREATE TABLE IF NOT EXISTS ad_drafts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '未命名草稿',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.2 新增 API（均走 authMiddleware + 现有 FB 限流队列）

| 端点 | 功能 |
|---|---|
| `GET /api/meta/pages` | FB 主页列表（`me/accounts`，返回 id/name/头像） |
| `GET /api/meta/pixels?accountId=` | 像素列表（`act_{id}/adspixels`） |
| `GET /api/meta/interests?q=` | 兴趣搜索（封装已有 `facebookClient.searchInterests`） |
| `POST /api/campaigns/:id/copy` | FB `/copies`，body: `{ count, statusOption }` |
| `POST /api/adsets/:id/copy` | 同上，可选 `targetCampaignId` |
| `POST /api/ads/:id/copy` | 同上，可选 `targetAdsetId` |
| `POST /api/bulk/status` | `{ level: 'campaign'\|'adset'\|'ad', ids: [], status }`，逐条容错，返回成功/失败明细 |
| `POST /api/publish` | 向导一键发布完整链路，返回分层结果 |
| `GET/POST/PUT/DELETE /api/drafts` | 草稿 CRUD（按 user_id + account_id 隔离） |

### 5.3 复用

- 创建/更新/删除单条：现有 `/api/campaigns|adsets|ads`
- 素材上传：现有 `/api/upload/image|video`
- 写回本地库：现有 `writeBack*` 函数，复制/发布成功后调用

## 6. 错误处理

- FB 错误优先透传 `error_user_msg`（FB 返回的用户可读错误），无则显示通用信息 + error code
- 发布接口分层返回状态，前端按层展示成功/失败；失败层级之前已创建的对象保留（暂停状态）
- 批量操作单条失败不中断，结果明细返回

## 7. 验证方式

- TypeScript 编译（client + server）与 lint 通过
- 浏览器实测关键流程：三 Tab 联动筛选、批量开/暂停、复制、完整向导发布（含图片与视频）、草稿保存/恢复/删除、名称行内编辑、预算双击编辑回归

## 8. 实施顺序（两个子阶段）

1. **阶段一：管理界面改造**（三层 Tab + 联动 + 批量 + 复制 + 行内编辑；后端 copy/bulk API）
2. **阶段二：创建向导**（向导页面 + meta/pages/pixels/interests API + publish API + 草稿表与 CRUD；删除遗留页面）
