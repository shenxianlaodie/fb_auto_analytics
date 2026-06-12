# 广告创建向导（阶段二）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/ads/create` FB 风格分步创建向导（系列 → 组 → 广告），含受众/版位/预算/创意上传/实时预览/本地草稿/一键发布，并清理遗留页面。

**Architecture:** 前端向导用 Zustand store 保存全部表单状态，任意步骤可存草稿（JSONB 入 PostgreSQL `ad_drafts` 表）。发布走单一 `POST /api/publish`，服务端 `PublishService` 串行创建 Campaign → AdSet → Creative → Ad，分层返回结果并 `upsert` 写回本地结构表。新增 `/api/meta/*`（主页/像素/兴趣）支撑表单下拉。FB 参数构建为纯函数，用 vitest 做 TDD。

**Tech Stack:** React 18 + Ant Design 5 + Zustand；Express + PostgreSQL + FacebookClient（Graph API v19）；vitest（仅 server 纯函数测试）。

**前置条件:** 阶段一计划（`2026-06-11-ads-manager-tabs.md`）已完成，`server/src/utils/fbError.ts` 已存在。

**提交身份约定:** 同阶段一：`git -c user.name='shenxianlaodie' -c user.email='shenxianlaodie@users.noreply.github.com' commit -m "..."`。

---

## 文件结构总览

```
server/src/
  models/database.ts                   [修改] initDatabase 增加 ad_drafts 表
  models/adDraft.ts                    [新增] 草稿 CRUD
  routes/drafts.ts                     [新增] /api/drafts
  routes/meta.ts                       [新增] /api/meta/pages|pixels|interests
  services/facebookClient.ts           [修改] getPages / getAdsPixels
  services/publishService.ts           [新增] PublishPayload 类型 + 参数构建纯函数 + 发布编排
  services/__tests__/publishService.test.ts  [新增] vitest 测试
  routes/publish.ts                    [新增] POST /api/publish
  app.ts                               [修改] 注册 drafts/meta/publish
  package.json                         [修改] vitest devDep + test script

client/src/
  pages/AdCreate/
    constants.ts                       [新增] 国家/CTA/转化事件/平台常量
    wizardStore.ts                     [新增] 向导状态 + 校验 + payload 构建
    index.tsx                          [新增] 向导壳（步骤导航/底部操作栏/草稿/发布）
    CampaignStep.tsx                   [新增] 步骤1
    AdSetStep.tsx                      [新增] 步骤2
    AdStep.tsx                         [新增] 步骤3（含上传）
    AdPreview.tsx                      [新增] 实时预览
  App.tsx                              [修改] 注册 ads/create 路由
  pages/AdsManager/index.tsx           [修改] 创建按钮 → 向导 + 草稿下拉
  pages/Campaigns.tsx / AdSets.tsx / Ads.tsx        [删除]
  hooks/useCampaigns.ts / useAdSets.ts / useAds.ts  [删除]
```

---

### Task 1: 后端 — ad_drafts 表与草稿 CRUD

**Files:**
- Modify: `server/src/models/database.ts`（`initDatabase` 内 ALTER 语句区，约 L305-323 之后）
- Create: `server/src/models/adDraft.ts`
- Create: `server/src/routes/drafts.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: `database.ts` 增加建表语句**

在 `initDatabase` 中 `await client.query(\`ALTER TABLE shoplazza_spu_top ADD COLUMN IF NOT EXISTS composite_score ...\`);` 之后追加：

```ts
    await client.query(`
      CREATE TABLE IF NOT EXISTS ad_drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '未命名草稿',
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ad_drafts_user_account
      ON ad_drafts(user_id, account_id, updated_at DESC)
    `);
```

- [ ] **Step 2: 创建 `server/src/models/adDraft.ts`**

```ts
import { query } from './database';

export interface AdDraftRecord {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  payload: any;
  created_at: string;
  updated_at: string;
}

export async function listDrafts(userId: string, accountId: string): Promise<AdDraftRecord[]> {
  return query(
    `SELECT * FROM ad_drafts WHERE user_id = $1 AND account_id = $2 ORDER BY updated_at DESC`,
    [userId, accountId]
  );
}

export async function getDraft(id: string, userId: string): Promise<AdDraftRecord | null> {
  const rows = await query(
    `SELECT * FROM ad_drafts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

export async function createDraft(
  userId: string,
  accountId: string,
  name: string,
  payload: unknown
): Promise<AdDraftRecord> {
  const rows = await query(
    `INSERT INTO ad_drafts (user_id, account_id, name, payload)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, accountId, name, JSON.stringify(payload)]
  );
  return rows[0];
}

export async function updateDraft(
  id: string,
  userId: string,
  name: string,
  payload: unknown
): Promise<AdDraftRecord | null> {
  const rows = await query(
    `UPDATE ad_drafts SET name = $3, payload = $4, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, name, JSON.stringify(payload)]
  );
  return rows[0] || null;
}

export async function deleteDraft(id: string, userId: string): Promise<void> {
  await query(`DELETE FROM ad_drafts WHERE id = $1 AND user_id = $2`, [id, userId]);
}
```

- [ ] **Step 3: 创建 `server/src/routes/drafts.ts`**

```ts
import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createDraft, deleteDraft, getDraft, listDrafts, updateDraft } from '../models/adDraft';

export const draftsRouter = Router();
draftsRouter.use(authMiddleware);

// GET /api/drafts?accountId=
draftsRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) {
      res.status(400).json({ error: '缺少 accountId' });
      return;
    }
    res.json(await listDrafts(req.userId!, accountId as string));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drafts/:id
draftsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const draft = await getDraft(req.params.id, req.userId!);
    if (!draft) {
      res.status(404).json({ error: '草稿不存在' });
      return;
    }
    res.json(draft);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drafts  { accountId, name, payload }
draftsRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, name, payload } = req.body;
    if (!accountId || !payload) {
      res.status(400).json({ error: '缺少 accountId 或 payload' });
      return;
    }
    res.json(await createDraft(req.userId!, accountId, name || '未命名草稿', payload));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drafts/:id  { name, payload }
draftsRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, payload } = req.body;
    const draft = await updateDraft(req.params.id, req.userId!, name || '未命名草稿', payload);
    if (!draft) {
      res.status(404).json({ error: '草稿不存在' });
      return;
    }
    res.json(draft);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/drafts/:id
draftsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await deleteDraft(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: `app.ts` 注册**

导入区追加：

```ts
import { draftsRouter } from './routes/drafts';
```

在 `app.use('/api/bulk', bulkRouter);` 之后追加：

```ts
app.use('/api/drafts', draftsRouter);
```

- [ ] **Step 5: 编译验证**

Run: `cd /root/fb_auto_analytics/server && npm run build`
Expected: 退出码 0。

- [ ] **Step 6: Commit**

```bash
git add server/src/models/database.ts server/src/models/adDraft.ts server/src/routes/drafts.ts server/src/app.ts
git commit -m "feat(server): 广告草稿表与 /api/drafts CRUD"
```

---

### Task 2: 后端 — meta 路由（主页/像素/兴趣）

**Files:**
- Modify: `server/src/services/facebookClient.ts`（`searchTargeting` 方法附近）
- Create: `server/src/routes/meta.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: `facebookClient.ts` 增加方法**

在 `// --- Targeting Search ---` 注释之前插入：

```ts
  // --- Pages & Pixels ---

  /** 当前 Token 用户管理的 Facebook 主页 */
  async getPages(accessToken: string): Promise<any[]> {
    const resp = await this.get('me/accounts', accessToken, {
      fields: 'id,name,picture{url}',
      limit: 100,
    });
    return resp.data || [];
  }

  /** 广告账户下的像素列表 */
  async getAdsPixels(accountId: string, accessToken: string): Promise<any[]> {
    const resp = await this.get(`act_${accountId}/adspixels`, accessToken, {
      fields: 'id,name',
      limit: 100,
    });
    return resp.data || [];
  }
```

- [ ] **Step 2: 创建 `server/src/routes/meta.ts`**

```ts
import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { FacebookClient } from '../services/facebookClient';
import { fbErrorMessage } from '../utils/fbError';

export const metaRouter = Router();
metaRouter.use(authMiddleware);

// GET /api/meta/pages — FB 主页列表
metaRouter.get('/pages', async (req: AuthRequest, res: Response) => {
  try {
    const pages = await FacebookClient.getInstance().getPages(req.accessToken!);
    res.json(pages.map((p: any) => ({
      id: p.id,
      name: p.name,
      pictureUrl: p.picture?.data?.url || null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});

// GET /api/meta/pixels?accountId= — 像素列表
metaRouter.get('/pixels', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) {
      res.status(400).json({ error: '缺少 accountId' });
      return;
    }
    const pixels = await FacebookClient.getInstance().getAdsPixels(
      String(accountId).replace('act_', ''),
      req.accessToken!
    );
    res.json(pixels);
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});

// GET /api/meta/interests?q= — 兴趣定向搜索
metaRouter.get('/interests', async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) {
      res.json([]);
      return;
    }
    const results = await FacebookClient.getInstance().searchTargeting(
      req.accessToken!,
      String(q).trim(),
      'adinterest'
    );
    res.json(results.map((r: any) => ({
      id: r.id,
      name: r.name,
      audienceSize: r.audience_size_upper_bound || r.audience_size || null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});
```

- [ ] **Step 3: `app.ts` 注册**

导入区追加 `import { metaRouter } from './routes/meta';`，在 `app.use('/api/drafts', draftsRouter);` 之后追加：

```ts
app.use('/api/meta', metaRouter);
```

- [ ] **Step 4: 编译验证**

Run: `cd /root/fb_auto_analytics/server && npm run build`
Expected: 退出码 0。

- [ ] **Step 5: Commit**

```bash
git add server/src/services/facebookClient.ts server/src/routes/meta.ts server/src/app.ts
git commit -m "feat(server): /api/meta 主页/像素/兴趣搜索端点"
```

---

### Task 3: 后端 — PublishService 参数构建（TDD）

**Files:**
- Modify: `server/package.json`（vitest）
- Create: `server/src/services/publishService.ts`
- Create: `server/src/services/__tests__/publishService.test.ts`

- [ ] **Step 1: 安装 vitest 并加 test 脚本**

Run: `cd /root/fb_auto_analytics/server && npm install -D vitest`

`server/package.json` 的 `scripts` 中追加：

```json
    "test": "vitest run"
```

注意：`tsconfig.json` 若有 `include: ["src"]` 则测试文件已被覆盖；若 `tsc` 构建会把测试编译进 dist 导致 vitest 类型报错，在 `tsconfig.json` 的 `exclude` 中加入 `"src/**/__tests__/**"`（仅排除构建，vitest 不受影响）。

- [ ] **Step 2: 先写失败测试 `server/src/services/__tests__/publishService.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  PublishPayload,
  buildAdParams,
  buildAdSetParams,
  buildCampaignParams,
  buildCreativeParams,
  buildTargeting,
} from '../publishService';

function basePayload(): PublishPayload {
  return {
    accountId: 'act_123',
    publishStatus: 'PAUSED',
    campaign: { name: '测试系列', cboEnabled: false, budgetType: 'daily' },
    adset: {
      name: '测试组',
      pixelId: 'px_1',
      conversionEvent: 'PURCHASE',
      budgetType: 'daily',
      budgetCents: 1000,
      countries: ['US', 'CA'],
      ageMin: 18,
      ageMax: 45,
      gender: 'all',
      interests: [],
      placementMode: 'auto',
    },
    ad: {
      name: '测试广告',
      pageId: 'page_1',
      format: 'image',
      imageHash: 'imghash',
      primaryText: '正文',
      headline: '标题',
      description: '描述',
      cta: 'SHOP_NOW',
      linkUrl: 'https://shop.example.com/p/1',
    },
  };
}

describe('buildCampaignParams', () => {
  it('非 CBO：固定销售目标，无预算字段', () => {
    const params = buildCampaignParams(basePayload());
    expect(params).toEqual({
      name: '测试系列',
      objective: 'OUTCOME_SALES',
      buying_type: 'AUCTION',
      special_ad_categories: [],
      status: 'PAUSED',
    });
  });

  it('CBO 日预算：预算与竞价策略在系列层', () => {
    const p = basePayload();
    p.campaign.cboEnabled = true;
    p.campaign.budgetCents = 5000;
    const params = buildCampaignParams(p);
    expect(params.daily_budget).toBe(5000);
    expect(params.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP');
    expect(params.lifetime_budget).toBeUndefined();
  });
});

describe('buildTargeting', () => {
  it('全部性别不传 genders；兴趣为空不传 flexible_spec；自动版位不传平台', () => {
    const t = buildTargeting(basePayload().adset);
    expect(t).toEqual({
      geo_locations: { countries: ['US', 'CA'] },
      age_min: 18,
      age_max: 45,
    });
  });

  it('女性 + 兴趣 + 手动平台', () => {
    const a = basePayload().adset;
    a.gender = 'female';
    a.interests = [{ id: '6003', name: 'Shopping' }];
    a.placementMode = 'manual';
    a.platforms = ['facebook', 'instagram'];
    const t = buildTargeting(a);
    expect(t.genders).toEqual([2]);
    expect(t.flexible_spec).toEqual([{ interests: [{ id: '6003', name: 'Shopping' }] }]);
    expect(t.publisher_platforms).toEqual(['facebook', 'instagram']);
  });
});

describe('buildAdSetParams', () => {
  it('非 CBO：组层日预算 + 像素转化目标', () => {
    const params = buildAdSetParams(basePayload(), 'camp_1');
    expect(params.campaign_id).toBe('camp_1');
    expect(params.daily_budget).toBe(1000);
    expect(params.optimization_goal).toBe('OFFSITE_CONVERSIONS');
    expect(params.billing_event).toBe('IMPRESSIONS');
    expect(params.promoted_object).toEqual({ pixel_id: 'px_1', custom_event_type: 'PURCHASE' });
    expect(params.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP');
  });

  it('CBO：组层无预算、无竞价策略；排期透传', () => {
    const p = basePayload();
    p.campaign.cboEnabled = true;
    p.adset.startTime = '2026-06-12T00:00:00+0800';
    p.adset.endTime = '2026-06-20T00:00:00+0800';
    const params = buildAdSetParams(p, 'camp_1');
    expect(params.daily_budget).toBeUndefined();
    expect(params.bid_strategy).toBeUndefined();
    expect(params.start_time).toBe('2026-06-12T00:00:00+0800');
    expect(params.end_time).toBe('2026-06-20T00:00:00+0800');
  });
});

describe('buildCreativeParams', () => {
  it('单图片创意：link_data + image_hash + CTA', () => {
    const params = buildCreativeParams(basePayload());
    expect(params.object_story_spec.page_id).toBe('page_1');
    expect(params.object_story_spec.link_data).toEqual({
      link: 'https://shop.example.com/p/1',
      message: '正文',
      name: '标题',
      description: '描述',
      image_hash: 'imghash',
      call_to_action: { type: 'SHOP_NOW', value: { link: 'https://shop.example.com/p/1' } },
    });
  });

  it('视频创意：video_data + 缩略图 hash', () => {
    const p = basePayload();
    p.ad.format = 'video';
    p.ad.videoId = 'vid_1';
    p.ad.thumbnailHash = 'thumbhash';
    const params = buildCreativeParams(p);
    expect(params.object_story_spec.video_data).toEqual({
      video_id: 'vid_1',
      image_hash: 'thumbhash',
      title: '标题',
      message: '正文',
      link_description: '描述',
      call_to_action: { type: 'SHOP_NOW', value: { link: 'https://shop.example.com/p/1' } },
    });
  });
});

describe('buildAdParams', () => {
  it('引用 adset 与 creative id', () => {
    expect(buildAdParams(basePayload(), 'as_1', 'cr_1')).toEqual({
      name: '测试广告',
      adset_id: 'as_1',
      creative: { creative_id: 'cr_1' },
      status: 'PAUSED',
    });
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd /root/fb_auto_analytics/server && npm test`
Expected: FAIL，提示 `publishService` 模块不存在。

- [ ] **Step 4: 创建 `server/src/services/publishService.ts`**

```ts
import { FacebookClient } from './facebookClient';
import { upsertFbAdMeta, upsertFbAdset, upsertFbCampaign } from '../models/fbStructure';
import { fbErrorMessage } from '../utils/fbError';

// --- 类型 ---

export interface PublishPayload {
  accountId: string;
  publishStatus: 'PAUSED' | 'ACTIVE';
  campaign: {
    name: string;
    cboEnabled: boolean;
    budgetType: 'daily' | 'lifetime';
    budgetCents?: number;
  };
  adset: {
    name: string;
    pixelId: string;
    conversionEvent: string;
    budgetType: 'daily' | 'lifetime';
    budgetCents?: number;
    startTime?: string;
    endTime?: string;
    countries: string[];
    ageMin: number;
    ageMax: number;
    gender: 'all' | 'male' | 'female';
    interests: { id: string; name: string }[];
    placementMode: 'auto' | 'manual';
    platforms?: string[];
  };
  ad: {
    name: string;
    pageId: string;
    format: 'image' | 'video';
    imageHash?: string;
    videoId?: string;
    thumbnailHash?: string;
    primaryText: string;
    headline: string;
    description?: string;
    cta: string;
    linkUrl: string;
  };
}

export interface LevelResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface PublishResult {
  campaign: LevelResult;
  adset: LevelResult;
  ad: LevelResult;
}

// --- 纯函数：FB 参数构建 ---

export function buildCampaignParams(p: PublishPayload): Record<string, any> {
  const params: Record<string, any> = {
    name: p.campaign.name,
    objective: 'OUTCOME_SALES',
    buying_type: 'AUCTION',
    special_ad_categories: [],
    status: p.publishStatus,
  };
  if (p.campaign.cboEnabled && p.campaign.budgetCents) {
    if (p.campaign.budgetType === 'daily') params.daily_budget = p.campaign.budgetCents;
    else params.lifetime_budget = p.campaign.budgetCents;
    params.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
  }
  return params;
}

export function buildTargeting(a: PublishPayload['adset']): Record<string, any> {
  const targeting: Record<string, any> = {
    geo_locations: { countries: a.countries },
    age_min: a.ageMin,
    age_max: a.ageMax,
  };
  if (a.gender === 'male') targeting.genders = [1];
  if (a.gender === 'female') targeting.genders = [2];
  if (a.interests.length > 0) {
    targeting.flexible_spec = [
      { interests: a.interests.map((i) => ({ id: i.id, name: i.name })) },
    ];
  }
  if (a.placementMode === 'manual' && a.platforms?.length) {
    targeting.publisher_platforms = a.platforms;
  }
  return targeting;
}

export function buildAdSetParams(p: PublishPayload, campaignId: string): Record<string, any> {
  const a = p.adset;
  const params: Record<string, any> = {
    name: a.name,
    campaign_id: campaignId,
    status: p.publishStatus,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    promoted_object: { pixel_id: a.pixelId, custom_event_type: a.conversionEvent },
    targeting: buildTargeting(a),
  };
  if (!p.campaign.cboEnabled) {
    params.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
    if (a.budgetCents) {
      if (a.budgetType === 'daily') params.daily_budget = a.budgetCents;
      else params.lifetime_budget = a.budgetCents;
    }
  }
  if (a.startTime) params.start_time = a.startTime;
  if (a.endTime) params.end_time = a.endTime;
  return params;
}

export function buildCreativeParams(p: PublishPayload): Record<string, any> {
  const ad = p.ad;
  const cta = { type: ad.cta, value: { link: ad.linkUrl } };
  if (ad.format === 'video') {
    return {
      name: `${ad.name} - 创意`,
      object_story_spec: {
        page_id: ad.pageId,
        video_data: {
          video_id: ad.videoId,
          image_hash: ad.thumbnailHash,
          title: ad.headline,
          message: ad.primaryText,
          link_description: ad.description,
          call_to_action: cta,
        },
      },
    };
  }
  return {
    name: `${ad.name} - 创意`,
    object_story_spec: {
      page_id: ad.pageId,
      link_data: {
        link: ad.linkUrl,
        message: ad.primaryText,
        name: ad.headline,
        description: ad.description,
        image_hash: ad.imageHash,
        call_to_action: cta,
      },
    },
  };
}

export function buildAdParams(p: PublishPayload, adsetId: string, creativeId: string): Record<string, any> {
  return {
    name: p.ad.name,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: p.publishStatus,
  };
}

// --- 发布编排 ---

export class PublishService {
  private fb: FacebookClient;
  private token: string;

  constructor(accessToken: string) {
    this.fb = FacebookClient.getInstance();
    this.token = accessToken;
  }

  /** 串行创建完整链路，逐层捕获错误，已创建层级保留并写回本地库 */
  async publish(p: PublishPayload): Promise<PublishResult> {
    const acct = p.accountId.replace('act_', '');
    const result: PublishResult = {
      campaign: { success: false },
      adset: { success: false },
      ad: { success: false },
    };

    // 1. Campaign
    let campaignId: string;
    try {
      const c = await this.fb.createCampaign(acct, this.token, buildCampaignParams(p));
      campaignId = c.id;
      result.campaign = { success: true, id: c.id };
      await upsertFbCampaign({
        adAccountId: acct,
        campaignId: c.id,
        name: p.campaign.name,
        status: p.publishStatus,
        objective: 'OUTCOME_SALES',
        dailyBudget: p.campaign.cboEnabled && p.campaign.budgetType === 'daily' && p.campaign.budgetCents
          ? String(p.campaign.budgetCents) : null,
        lifetimeBudget: p.campaign.cboEnabled && p.campaign.budgetType === 'lifetime' && p.campaign.budgetCents
          ? String(p.campaign.budgetCents) : null,
      });
    } catch (err: any) {
      result.campaign = { success: false, error: fbErrorMessage(err) };
      return result;
    }

    // 2. AdSet
    let adsetId: string;
    try {
      const a = await this.fb.createAdSet(acct, this.token, buildAdSetParams(p, campaignId));
      adsetId = a.id;
      result.adset = { success: true, id: a.id };
      await upsertFbAdset({
        adAccountId: acct,
        adsetId: a.id,
        campaignId,
        name: p.adset.name,
        status: p.publishStatus,
        dailyBudget: !p.campaign.cboEnabled && p.adset.budgetType === 'daily' && p.adset.budgetCents
          ? String(p.adset.budgetCents) : null,
        lifetimeBudget: !p.campaign.cboEnabled && p.adset.budgetType === 'lifetime' && p.adset.budgetCents
          ? String(p.adset.budgetCents) : null,
      });
    } catch (err: any) {
      result.adset = { success: false, error: fbErrorMessage(err) };
      return result;
    }

    // 3. Creative + Ad
    try {
      const creative = await this.fb.createAdCreative(acct, this.token, buildCreativeParams(p));
      const ad = await this.fb.createAd(acct, this.token, buildAdParams(p, adsetId, creative.id));
      result.ad = { success: true, id: ad.id };
      await upsertFbAdMeta({
        adAccountId: acct,
        adId: ad.id,
        adsetId,
        campaignId,
        name: p.ad.name,
        status: p.publishStatus,
        creative: { id: creative.id },
        postId: null,
        storyId: null,
      });
    } catch (err: any) {
      result.ad = { success: false, error: fbErrorMessage(err) };
    }

    return result;
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd /root/fb_auto_analytics/server && npm test`
Expected: 9 个测试全部 PASS。

- [ ] **Step 6: 编译验证**

Run: `cd /root/fb_auto_analytics/server && npm run build`
Expected: 退出码 0（若 tsc 编译 `__tests__` 报 vitest 类型错误，见 Step 1 的 exclude 说明）。

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/package-lock.json server/tsconfig.json server/src/services/publishService.ts server/src/services/__tests__/publishService.test.ts
git commit -m "feat(server): PublishService 参数构建（TDD）与发布编排"
```

---

### Task 4: 后端 — publish 路由

**Files:**
- Create: `server/src/routes/publish.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: 创建 `server/src/routes/publish.ts`**

```ts
import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { PublishPayload, PublishService } from '../services/publishService';

export const publishRouter = Router();
publishRouter.use(authMiddleware);

// POST /api/publish — 向导一键发布完整链路
publishRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body as PublishPayload;
    if (!payload?.accountId || !payload?.campaign?.name || !payload?.adset?.name || !payload?.ad?.name) {
      res.status(400).json({ error: '发布数据不完整' });
      return;
    }
    const service = new PublishService(req.accessToken!);
    const result = await service.publish(payload);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: `app.ts` 注册**

导入区追加 `import { publishRouter } from './routes/publish';`，在 `app.use('/api/meta', metaRouter);` 之后追加：

```ts
app.use('/api/publish', publishRouter);
```

- [ ] **Step 3: 编译验证 + Commit**

Run: `cd /root/fb_auto_analytics/server && npm run build`
Expected: 退出码 0。

```bash
git add server/src/routes/publish.ts server/src/app.ts
git commit -m "feat(server): POST /api/publish 一键发布端点"
```

---

### Task 5: 前端 — 向导常量与 wizardStore

**Files:**
- Create: `client/src/pages/AdCreate/constants.ts`
- Create: `client/src/pages/AdCreate/wizardStore.ts`

- [ ] **Step 1: 创建 `client/src/pages/AdCreate/constants.ts`**

```ts
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: '美国' }, { code: 'CA', name: '加拿大' }, { code: 'GB', name: '英国' },
  { code: 'AU', name: '澳大利亚' }, { code: 'NZ', name: '新西兰' }, { code: 'DE', name: '德国' },
  { code: 'FR', name: '法国' }, { code: 'IT', name: '意大利' }, { code: 'ES', name: '西班牙' },
  { code: 'NL', name: '荷兰' }, { code: 'BE', name: '比利时' }, { code: 'AT', name: '奥地利' },
  { code: 'CH', name: '瑞士' }, { code: 'IE', name: '爱尔兰' }, { code: 'PT', name: '葡萄牙' },
  { code: 'SE', name: '瑞典' }, { code: 'NO', name: '挪威' }, { code: 'DK', name: '丹麦' },
  { code: 'FI', name: '芬兰' }, { code: 'PL', name: '波兰' }, { code: 'CZ', name: '捷克' },
  { code: 'GR', name: '希腊' }, { code: 'HU', name: '匈牙利' }, { code: 'RO', name: '罗马尼亚' },
  { code: 'JP', name: '日本' }, { code: 'KR', name: '韩国' }, { code: 'SG', name: '新加坡' },
  { code: 'MY', name: '马来西亚' }, { code: 'TH', name: '泰国' }, { code: 'VN', name: '越南' },
  { code: 'PH', name: '菲律宾' }, { code: 'ID', name: '印度尼西亚' }, { code: 'IN', name: '印度' },
  { code: 'HK', name: '中国香港' }, { code: 'TW', name: '中国台湾' }, { code: 'MO', name: '中国澳门' },
  { code: 'AE', name: '阿联酋' }, { code: 'SA', name: '沙特阿拉伯' }, { code: 'IL', name: '以色列' },
  { code: 'TR', name: '土耳其' }, { code: 'BR', name: '巴西' }, { code: 'MX', name: '墨西哥' },
  { code: 'AR', name: '阿根廷' }, { code: 'CL', name: '智利' }, { code: 'CO', name: '哥伦比亚' },
  { code: 'PE', name: '秘鲁' }, { code: 'ZA', name: '南非' }, { code: 'EG', name: '埃及' },
  { code: 'NG', name: '尼日利亚' },
];

export const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: '立即购买' },
  { value: 'LEARN_MORE', label: '了解详情' },
  { value: 'SIGN_UP', label: '注册' },
  { value: 'SUBSCRIBE', label: '订阅' },
  { value: 'GET_OFFER', label: '获取优惠' },
  { value: 'CONTACT_US', label: '联系我们' },
  { value: 'DOWNLOAD', label: '下载' },
];

export const CONVERSION_EVENTS = [
  { value: 'PURCHASE', label: '购买 Purchase' },
  { value: 'ADD_TO_CART', label: '加入购物车 AddToCart' },
  { value: 'INITIATE_CHECKOUT', label: '发起结账 InitiateCheckout' },
  { value: 'ADD_PAYMENT_INFO', label: '添加支付信息' },
  { value: 'COMPLETE_REGISTRATION', label: '完成注册' },
  { value: 'LEAD', label: '潜在客户 Lead' },
];

export const PLATFORM_OPTIONS = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'audience_network', label: 'Audience Network' },
];
```

- [ ] **Step 2: 创建 `client/src/pages/AdCreate/wizardStore.ts`**

```ts
import { create } from 'zustand';

export interface WizardCampaign {
  name: string;
  cboEnabled: boolean;
  budgetType: 'daily' | 'lifetime';
  budgetUsd: number | null;
}

export interface WizardAdset {
  name: string;
  pixelId: string | null;
  conversionEvent: string;
  budgetType: 'daily' | 'lifetime';
  budgetUsd: number | null;
  startTime: string | null; // ISO
  endTime: string | null;
  countries: string[];
  ageMin: number;
  ageMax: number;
  gender: 'all' | 'male' | 'female';
  interests: { id: string; name: string }[];
  placementMode: 'auto' | 'manual';
  platforms: string[];
}

export interface WizardAd {
  name: string;
  pageId: string | null;
  format: 'image' | 'video';
  imageHash: string | null;
  imagePreviewUrl: string | null;     // 本地预览，不入草稿后无法恢复预览图
  videoId: string | null;
  thumbnailHash: string | null;
  thumbnailPreviewUrl: string | null;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  linkUrl: string;
}

interface WizardState {
  draftId: string | null;
  step: number; // 0=系列 1=组 2=广告
  campaign: WizardCampaign;
  adset: WizardAdset;
  ad: WizardAd;
  setStep: (s: number) => void;
  setDraftId: (id: string | null) => void;
  patchCampaign: (p: Partial<WizardCampaign>) => void;
  patchAdset: (p: Partial<WizardAdset>) => void;
  patchAd: (p: Partial<WizardAd>) => void;
  reset: () => void;
  loadDraft: (draftId: string, payload: any) => void;
}

const initialCampaign: WizardCampaign = {
  name: '', cboEnabled: false, budgetType: 'daily', budgetUsd: null,
};

const initialAdset: WizardAdset = {
  name: '', pixelId: null, conversionEvent: 'PURCHASE',
  budgetType: 'daily', budgetUsd: 10, startTime: null, endTime: null,
  countries: ['US'], ageMin: 18, ageMax: 65, gender: 'all',
  interests: [], placementMode: 'auto', platforms: ['facebook', 'instagram'],
};

const initialAd: WizardAd = {
  name: '', pageId: null, format: 'image',
  imageHash: null, imagePreviewUrl: null, videoId: null,
  thumbnailHash: null, thumbnailPreviewUrl: null,
  primaryText: '', headline: '', description: '', cta: 'SHOP_NOW', linkUrl: '',
};

export const useWizardStore = create<WizardState>((set) => ({
  draftId: null,
  step: 0,
  campaign: { ...initialCampaign },
  adset: { ...initialAdset },
  ad: { ...initialAd },

  setStep: (s) => set({ step: s }),
  setDraftId: (id) => set({ draftId: id }),
  patchCampaign: (p) => set((s) => ({ campaign: { ...s.campaign, ...p } })),
  patchAdset: (p) => set((s) => ({ adset: { ...s.adset, ...p } })),
  patchAd: (p) => set((s) => ({ ad: { ...s.ad, ...p } })),

  reset: () => set({
    draftId: null, step: 0,
    campaign: { ...initialCampaign },
    adset: { ...initialAdset },
    ad: { ...initialAd },
  }),

  loadDraft: (draftId, payload) => set({
    draftId,
    step: payload.step ?? 0,
    campaign: { ...initialCampaign, ...payload.campaign },
    adset: { ...initialAdset, ...payload.adset },
    ad: { ...initialAd, ...payload.ad },
  }),
}));

// --- 校验与 payload 构建（纯函数）---

export function validateStep(
  step: number,
  s: { campaign: WizardCampaign; adset: WizardAdset; ad: WizardAd },
): string[] {
  const errors: string[] = [];
  if (step === 0) {
    if (!s.campaign.name.trim()) errors.push('请输入广告系列名称');
    if (s.campaign.cboEnabled && (!s.campaign.budgetUsd || s.campaign.budgetUsd <= 0)) {
      errors.push('已开启预算优化，请输入系列预算');
    }
  }
  if (step === 1) {
    if (!s.adset.name.trim()) errors.push('请输入广告组名称');
    if (!s.adset.pixelId) errors.push('请选择像素');
    if (!s.campaign.cboEnabled && (!s.adset.budgetUsd || s.adset.budgetUsd <= 0)) {
      errors.push('请输入广告组预算');
    }
    const budgetType = s.campaign.cboEnabled ? s.campaign.budgetType : s.adset.budgetType;
    if (budgetType === 'lifetime' && !s.adset.endTime) errors.push('总预算模式必须设置结束时间');
    if (s.adset.countries.length === 0) errors.push('请至少选择一个投放国家/地区');
    if (s.adset.placementMode === 'manual' && s.adset.platforms.length === 0) {
      errors.push('手动版位至少勾选一个平台');
    }
  }
  if (step === 2) {
    if (!s.ad.name.trim()) errors.push('请输入广告名称');
    if (!s.ad.pageId) errors.push('请选择 Facebook 主页');
    if (s.ad.format === 'image' && !s.ad.imageHash) errors.push('请上传图片素材');
    if (s.ad.format === 'video') {
      if (!s.ad.videoId) errors.push('请上传视频素材');
      if (!s.ad.thumbnailHash) errors.push('请上传视频缩略图');
    }
    if (!s.ad.primaryText.trim()) errors.push('请输入主要文本');
    if (!s.ad.headline.trim()) errors.push('请输入标题');
    if (!/^https?:\/\/.+/.test(s.ad.linkUrl)) errors.push('请输入有效的落地页链接（http/https）');
  }
  return errors;
}

const usd2cents = (v: number | null) => (v ? Math.round(v * 100) : undefined);

/** 构建 POST /api/publish 请求体（与 server PublishPayload 对应） */
export function buildPublishBody(
  accountId: string,
  s: { campaign: WizardCampaign; adset: WizardAdset; ad: WizardAd },
  paused: boolean,
) {
  return {
    accountId,
    publishStatus: paused ? 'PAUSED' : 'ACTIVE',
    campaign: {
      name: s.campaign.name,
      cboEnabled: s.campaign.cboEnabled,
      budgetType: s.campaign.budgetType,
      budgetCents: usd2cents(s.campaign.budgetUsd),
    },
    adset: {
      name: s.adset.name,
      pixelId: s.adset.pixelId,
      conversionEvent: s.adset.conversionEvent,
      budgetType: s.adset.budgetType,
      budgetCents: usd2cents(s.adset.budgetUsd),
      startTime: s.adset.startTime || undefined,
      endTime: s.adset.endTime || undefined,
      countries: s.adset.countries,
      ageMin: s.adset.ageMin,
      ageMax: s.adset.ageMax,
      gender: s.adset.gender,
      interests: s.adset.interests,
      placementMode: s.adset.placementMode,
      platforms: s.adset.placementMode === 'manual' ? s.adset.platforms : undefined,
    },
    ad: {
      name: s.ad.name,
      pageId: s.ad.pageId,
      format: s.ad.format,
      imageHash: s.ad.imageHash || undefined,
      videoId: s.ad.videoId || undefined,
      thumbnailHash: s.ad.thumbnailHash || undefined,
      primaryText: s.ad.primaryText,
      headline: s.ad.headline,
      description: s.ad.description || undefined,
      cta: s.ad.cta,
      linkUrl: s.ad.linkUrl,
    },
  };
}

/** 草稿 payload：完整向导状态（预览 URL 为本地 blob 不保存） */
export function buildDraftPayload(s: {
  step: number; campaign: WizardCampaign; adset: WizardAdset; ad: WizardAd;
}) {
  return {
    step: s.step,
    campaign: s.campaign,
    adset: s.adset,
    ad: { ...s.ad, imagePreviewUrl: null, thumbnailPreviewUrl: null },
  };
}
```

- [ ] **Step 3: 编译验证 + Commit**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

```bash
git add client/src/pages/AdCreate/constants.ts client/src/pages/AdCreate/wizardStore.ts
git commit -m "feat(client): 创建向导状态 store、校验与常量"
```

---

### Task 6: 前端 — CampaignStep 与 AdSetStep

**Files:**
- Create: `client/src/pages/AdCreate/CampaignStep.tsx`
- Create: `client/src/pages/AdCreate/AdSetStep.tsx`

- [ ] **Step 1: 创建 `client/src/pages/AdCreate/CampaignStep.tsx`**

```tsx
import React from 'react';
import { Card, Input, InputNumber, Radio, Switch, Tag, Typography } from 'antd';
import { useWizardStore } from './wizardStore';

const label: React.CSSProperties = { display: 'block', fontWeight: 500, marginBottom: 4, marginTop: 16 };

export function CampaignStep() {
  const { campaign, patchCampaign } = useWizardStore();

  return (
    <Card title="广告系列" style={{ maxWidth: 640 }}>
      <span style={{ ...label, marginTop: 0 }}>系列名称 *</span>
      <Input
        maxLength={100}
        placeholder="例如：2026夏季新品-转化"
        value={campaign.name}
        onChange={(e) => patchCampaign({ name: e.target.value })}
      />

      <span style={label}>营销目标</span>
      <Tag color="blue">销售（转化）</Tag>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>本系统固定为销售目标</Typography.Text>

      <span style={label}>购买类型</span>
      <Tag>竞拍</Tag>

      <span style={label}>预算优化（CBO）</span>
      <Switch
        checked={campaign.cboEnabled}
        onChange={(v) => patchCampaign({ cboEnabled: v })}
        checkedChildren="开" unCheckedChildren="关"
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
        开启后在系列层统一分配预算；关闭则在广告组层设置预算。
      </Typography.Paragraph>

      {campaign.cboEnabled && (
        <>
          <span style={label}>系列预算 *</span>
          <Radio.Group
            value={campaign.budgetType}
            onChange={(e) => patchCampaign({ budgetType: e.target.value })}
            style={{ marginBottom: 8 }}
          >
            <Radio.Button value="daily">日预算</Radio.Button>
            <Radio.Button value="lifetime">总预算</Radio.Button>
          </Radio.Group>
          <br />
          <InputNumber
            min={1}
            prefix="$"
            style={{ width: 200 }}
            placeholder="美元"
            value={campaign.budgetUsd}
            onChange={(v) => patchCampaign({ budgetUsd: v })}
          />
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: 创建 `client/src/pages/AdCreate/AdSetStep.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Card, Checkbox, DatePicker, Input, InputNumber, Radio, Select, Spin, Typography, message,
} from 'antd';
import dayjs from 'dayjs';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import { useWizardStore } from './wizardStore';
import { CONVERSION_EVENTS, COUNTRIES, PLATFORM_OPTIONS } from './constants';

const label: React.CSSProperties = { display: 'block', fontWeight: 500, marginBottom: 4, marginTop: 16 };

const AGE_OPTIONS = Array.from({ length: 48 }, (_, i) => ({ value: 18 + i, label: String(18 + i) }))
  .concat([{ value: 65, label: '65+' }]);

export function AdSetStep() {
  const { accountId } = useAccountStore();
  const { campaign, adset, patchAdset } = useWizardStore();
  const [pixels, setPixels] = useState<{ id: string; name: string }[]>([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [interestOptions, setInterestOptions] = useState<{ id: string; name: string; audienceSize: number | null }[]>([]);
  const [interestLoading, setInterestLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accountId) return;
    setPixelsLoading(true);
    api.get('/meta/pixels', { params: { accountId } })
      .then((resp) => setPixels(resp.data || []))
      .catch((err) => message.warning(err.response?.data?.error || '像素列表加载失败'))
      .finally(() => setPixelsLoading(false));
  }, [accountId]);

  const searchInterests = (q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q || q.trim().length < 2) return;
    searchTimer.current = setTimeout(async () => {
      setInterestLoading(true);
      try {
        const resp = await api.get('/meta/interests', { params: { q: q.trim() } });
        setInterestOptions(resp.data || []);
      } catch {
        // 忽略搜索失败
      }
      setInterestLoading(false);
    }, 400);
  };

  return (
    <Card title="广告组" style={{ maxWidth: 640 }}>
      <span style={{ ...label, marginTop: 0 }}>广告组名称 *</span>
      <Input
        maxLength={100}
        value={adset.name}
        onChange={(e) => patchAdset({ name: e.target.value })}
      />

      <span style={label}>转化发生位置</span>
      <Typography.Text>网站</Typography.Text>

      <span style={label}>像素 *</span>
      <Select
        style={{ width: '100%' }}
        placeholder="选择 Facebook 像素"
        loading={pixelsLoading}
        value={adset.pixelId}
        onChange={(v) => patchAdset({ pixelId: v })}
        options={pixels.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }))}
      />

      <span style={label}>转化事件</span>
      <Select
        style={{ width: 280 }}
        value={adset.conversionEvent}
        onChange={(v) => patchAdset({ conversionEvent: v })}
        options={CONVERSION_EVENTS}
      />

      {!campaign.cboEnabled && (
        <>
          <span style={label}>预算 *</span>
          <Radio.Group
            value={adset.budgetType}
            onChange={(e) => patchAdset({ budgetType: e.target.value })}
            style={{ marginBottom: 8 }}
          >
            <Radio.Button value="daily">日预算</Radio.Button>
            <Radio.Button value="lifetime">总预算</Radio.Button>
          </Radio.Group>
          <br />
          <InputNumber
            min={1} prefix="$" style={{ width: 200 }} placeholder="美元"
            value={adset.budgetUsd}
            onChange={(v) => patchAdset({ budgetUsd: v })}
          />
        </>
      )}

      <span style={label}>排期</span>
      <DatePicker
        showTime
        placeholder="开始时间（默认立即）"
        style={{ width: 240, marginRight: 12 }}
        value={adset.startTime ? dayjs(adset.startTime) : null}
        onChange={(d) => patchAdset({ startTime: d ? d.toISOString() : null })}
      />
      <DatePicker
        showTime
        placeholder="结束时间（可选）"
        style={{ width: 240 }}
        value={adset.endTime ? dayjs(adset.endTime) : null}
        onChange={(d) => patchAdset({ endTime: d ? d.toISOString() : null })}
      />

      <span style={label}>地区 *</span>
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        optionFilterProp="label"
        placeholder="选择投放国家/地区"
        value={adset.countries}
        onChange={(v) => patchAdset({ countries: v })}
        options={COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
      />

      <span style={label}>年龄</span>
      <Select
        style={{ width: 100 }}
        value={adset.ageMin}
        onChange={(v) => patchAdset({ ageMin: v })}
        options={AGE_OPTIONS}
      />
      <span style={{ margin: '0 8px' }}>至</span>
      <Select
        style={{ width: 100 }}
        value={adset.ageMax}
        onChange={(v) => patchAdset({ ageMax: v })}
        options={AGE_OPTIONS}
      />

      <span style={label}>性别</span>
      <Radio.Group value={adset.gender} onChange={(e) => patchAdset({ gender: e.target.value })}>
        <Radio.Button value="all">全部</Radio.Button>
        <Radio.Button value="male">男</Radio.Button>
        <Radio.Button value="female">女</Radio.Button>
      </Radio.Group>

      <span style={label}>兴趣定向（可选）</span>
      <Select
        mode="multiple"
        labelInValue
        style={{ width: '100%' }}
        placeholder="搜索兴趣关键词（至少 2 个字符）"
        filterOption={false}
        onSearch={searchInterests}
        notFoundContent={interestLoading ? <Spin size="small" /> : '输入关键词搜索'}
        value={adset.interests.map((i) => ({ value: i.id, label: i.name }))}
        onChange={(vals: { value: string; label: React.ReactNode }[]) =>
          patchAdset({ interests: vals.map((v) => ({ id: v.value, name: String(v.label) })) })
        }
        options={interestOptions.map((o) => ({
          value: o.id,
          label: o.audienceSize ? `${o.name}（受众约 ${(o.audienceSize / 1e6).toFixed(1)}M）` : o.name,
        }))}
      />

      <span style={label}>版位</span>
      <Radio.Group
        value={adset.placementMode}
        onChange={(e) => patchAdset({ placementMode: e.target.value })}
      >
        <Radio value="auto">优势版位（自动，推荐）</Radio>
        <Radio value="manual">手动版位</Radio>
      </Radio.Group>
      {adset.placementMode === 'manual' && (
        <div style={{ marginTop: 8 }}>
          <Checkbox.Group
            options={PLATFORM_OPTIONS}
            value={adset.platforms}
            onChange={(v) => patchAdset({ platforms: v as string[] })}
          />
        </div>
      )}
    </Card>
  );
}
```

注意：兴趣 Select 的 `onChange` labelInValue 中，已选项 label 可能带受众规模后缀；为保证保存的 name 干净，选择后从 `interestOptions` 反查原始 name：把 `onChange` 实现替换为：

```tsx
        onChange={(vals: { value: string; label: React.ReactNode }[]) =>
          patchAdset({
            interests: vals.map((v) => {
              const found = interestOptions.find((o) => o.id === v.value);
              const prev = adset.interests.find((i) => i.id === v.value);
              return { id: v.value, name: found?.name || prev?.name || String(v.label) };
            }),
          })
        }
```

- [ ] **Step 3: 编译验证 + Commit**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

```bash
git add client/src/pages/AdCreate/CampaignStep.tsx client/src/pages/AdCreate/AdSetStep.tsx
git commit -m "feat(client): 创建向导步骤1/2（系列与广告组表单）"
```

---

### Task 7: 前端 — AdStep 与 AdPreview

**Files:**
- Create: `client/src/pages/AdCreate/AdPreview.tsx`
- Create: `client/src/pages/AdCreate/AdStep.tsx`

- [ ] **Step 1: 创建 `client/src/pages/AdCreate/AdPreview.tsx`**

```tsx
import React from 'react';
import { Button, Card, Typography } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import type { WizardAd } from './wizardStore';
import { CTA_OPTIONS } from './constants';

/** 模拟 FB 移动端 Feed 帖子的实时预览 */
export function AdPreview({ ad, pageName }: { ad: WizardAd; pageName: string | null }) {
  const ctaLabel = CTA_OPTIONS.find((c) => c.value === ad.cta)?.label || ad.cta;
  const mediaUrl = ad.format === 'image' ? ad.imagePreviewUrl : ad.thumbnailPreviewUrl;
  let domain = '';
  try {
    if (ad.linkUrl) domain = new URL(ad.linkUrl).hostname.toUpperCase();
  } catch {
    // 链接未填完整时忽略
  }

  return (
    <Card title="广告预览（移动端 Feed）" style={{ width: 360 }}>
      <div style={{ border: '1px solid #e4e6eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        {/* 头部：主页身份 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#1877f2',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          }}>
            {(pageName || 'P').slice(0, 1)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{pageName || '选择主页'}</div>
            <div style={{ fontSize: 12, color: '#65676b' }}>
              赞助内容 · <GlobalOutlined />
            </div>
          </div>
        </div>

        {/* 主要文本 */}
        {ad.primaryText && (
          <div style={{ padding: '0 12px 8px', fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {ad.primaryText}
          </div>
        )}

        {/* 素材 */}
        <div style={{ background: '#f0f2f5', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {mediaUrl ? (
            <img src={mediaUrl} alt="creative" style={{ width: '100%', display: 'block' }} />
          ) : (
            <Typography.Text type="secondary">
              {ad.format === 'video' ? '上传视频缩略图后显示' : '上传图片后显示'}
            </Typography.Text>
          )}
        </div>

        {/* 链接卡片 */}
        <div style={{
          background: '#f0f2f5', padding: 12, display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#65676b' }}>{domain || 'EXAMPLE.COM'}</div>
            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ad.headline || '广告标题'}
            </div>
            {ad.description && (
              <div style={{ fontSize: 12, color: '#65676b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ad.description}
              </div>
            )}
          </div>
          <Button size="small">{ctaLabel}</Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: 创建 `client/src/pages/AdCreate/AdStep.tsx`**

```tsx
import React, { useState } from 'react';
import { Card, Col, Input, Radio, Row, Select, Typography, Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import { useWizardStore } from './wizardStore';
import { CTA_OPTIONS } from './constants';
import { AdPreview } from './AdPreview';

const label: React.CSSProperties = { display: 'block', fontWeight: 500, marginBottom: 4, marginTop: 16 };

export interface FbPage { id: string; name: string; pictureUrl: string | null }

export function AdStep({ pages, pagesLoading }: { pages: FbPage[]; pagesLoading: boolean }) {
  const { accountId } = useAccountStore();
  const { ad, patchAd } = useWizardStore();
  const [uploading, setUploading] = useState(false);

  const uploadMedia = async (
    file: File,
    kind: 'image' | 'video' | 'thumbnail',
  ) => {
    if (!accountId) return;
    setUploading(true);
    const form = new FormData();
    const field = kind === 'video' ? 'video' : 'image';
    form.append(field, file);
    form.append('accountId', accountId);
    try {
      const resp = await api.post(`/upload/${field}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      const previewUrl = URL.createObjectURL(file);
      if (kind === 'image') {
        patchAd({ imageHash: resp.data.hash, imagePreviewUrl: previewUrl });
      } else if (kind === 'video') {
        patchAd({ videoId: resp.data.videoId });
      } else {
        patchAd({ thumbnailHash: resp.data.hash, thumbnailPreviewUrl: previewUrl });
      }
      message.success('上传成功');
    } catch (err: any) {
      message.error(err.response?.data?.error || '上传失败');
    }
    setUploading(false);
  };

  const dragger = (kind: 'image' | 'video' | 'thumbnail', hint: string, done: boolean) => (
    <Upload.Dragger
      accept={kind === 'video' ? '.mp4,.mov,.avi' : '.jpg,.jpeg,.png,.gif'}
      showUploadList={false}
      disabled={uploading}
      customRequest={({ file }) => uploadMedia(file as File, kind)}
      style={{ marginBottom: 8 }}
    >
      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
      <p className="ant-upload-text">{done ? '已上传，点击可替换' : hint}</p>
    </Upload.Dragger>
  );

  const selectedPage = pages.find((p) => p.id === ad.pageId) || null;

  return (
    <Row gutter={24}>
      <Col flex="auto">
        <Card title="广告" style={{ maxWidth: 640 }}>
          <span style={{ ...label, marginTop: 0 }}>广告名称 *</span>
          <Input maxLength={100} value={ad.name} onChange={(e) => patchAd({ name: e.target.value })} />

          <span style={label}>身份（Facebook 主页）*</span>
          <Select
            style={{ width: '100%' }}
            placeholder="选择发布主页"
            loading={pagesLoading}
            value={ad.pageId}
            onChange={(v) => patchAd({ pageId: v })}
            options={pages.map((p) => ({ value: p.id, label: p.name }))}
          />

          <span style={label}>广告格式</span>
          <Radio.Group
            value={ad.format}
            onChange={(e) => patchAd({ format: e.target.value })}
          >
            <Radio.Button value="image">单图片</Radio.Button>
            <Radio.Button value="video">视频</Radio.Button>
          </Radio.Group>

          <span style={label}>素材 *</span>
          {ad.format === 'image' ? (
            dragger('image', '点击或拖拽上传图片（jpg/png/gif，≤50MB）', !!ad.imageHash)
          ) : (
            <>
              {dragger('video', '点击或拖拽上传视频（mp4/mov，≤50MB）', !!ad.videoId)}
              <span style={{ ...label, marginTop: 8 }}>视频缩略图 *</span>
              {dragger('thumbnail', '上传视频封面图片', !!ad.thumbnailHash)}
            </>
          )}

          <span style={label}>主要文本 *</span>
          <Input.TextArea
            rows={3} maxLength={500} showCount
            value={ad.primaryText}
            onChange={(e) => patchAd({ primaryText: e.target.value })}
          />

          <span style={label}>标题 *</span>
          <Input maxLength={60} showCount value={ad.headline}
            onChange={(e) => patchAd({ headline: e.target.value })} />

          <span style={label}>描述（可选）</span>
          <Input maxLength={100} value={ad.description}
            onChange={(e) => patchAd({ description: e.target.value })} />

          <span style={label}>行动号召（CTA）</span>
          <Select style={{ width: 240 }} value={ad.cta}
            onChange={(v) => patchAd({ cta: v })} options={CTA_OPTIONS} />

          <span style={label}>落地页链接 *</span>
          <Input placeholder="https://..." value={ad.linkUrl}
            onChange={(e) => patchAd({ linkUrl: e.target.value })} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            建议带 UTM 参数（utm_content 填广告编号可自动归因）
          </Typography.Text>
        </Card>
      </Col>
      <Col flex="360px">
        <AdPreview ad={ad} pageName={selectedPage?.name || null} />
      </Col>
    </Row>
  );
}
```

- [ ] **Step 3: 编译验证 + Commit**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

```bash
git add client/src/pages/AdCreate/AdPreview.tsx client/src/pages/AdCreate/AdStep.tsx
git commit -m "feat(client): 创建向导步骤3（创意上传与实时预览）"
```

---

### Task 8: 前端 — 向导壳 index.tsx 与路由注册

**Files:**
- Create: `client/src/pages/AdCreate/index.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: 创建 `client/src/pages/AdCreate/index.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Checkbox, Modal, Result, Steps, Typography, message,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import {
  buildDraftPayload, buildPublishBody, useWizardStore, validateStep,
} from './wizardStore';
import { CampaignStep } from './CampaignStep';
import { AdSetStep } from './AdSetStep';
import { AdStep, FbPage } from './AdStep';

interface LevelResult { success: boolean; id?: string; error?: string }
interface PublishResult { campaign: LevelResult; adset: LevelResult; ad: LevelResult }

export const AdCreate: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accountId, accountName } = useAccountStore();
  const store = useWizardStore();
  const { step, setStep, draftId, setDraftId, campaign, adset, ad, reset, loadDraft } = store;

  const [errors, setErrors] = useState<string[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishPaused, setPublishPaused] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [pages, setPages] = useState<FbPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);

  // 进入页面：加载草稿或重置
  useEffect(() => {
    const qDraftId = searchParams.get('draftId');
    if (qDraftId) {
      api.get(`/drafts/${qDraftId}`)
        .then((resp) => loadDraft(qDraftId, resp.data.payload))
        .catch(() => message.warning('草稿不存在或已删除'));
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主页列表（步骤3用）
  useEffect(() => {
    setPagesLoading(true);
    api.get('/meta/pages')
      .then((resp) => setPages(resp.data || []))
      .catch((err) => message.warning(err.response?.data?.error || '主页列表加载失败'))
      .finally(() => setPagesLoading(false));
  }, []);

  const goNext = () => {
    const errs = validateStep(step, { campaign, adset, ad });
    setErrors(errs);
    if (errs.length === 0) setStep(step + 1);
  };

  const handleSaveDraft = async () => {
    if (!accountId) return;
    setSavingDraft(true);
    try {
      const name = campaign.name.trim() || '未命名草稿';
      const payload = buildDraftPayload({ step, campaign, adset, ad });
      if (draftId) {
        await api.put(`/drafts/${draftId}`, { name, payload });
      } else {
        const resp = await api.post('/drafts', { accountId, name, payload });
        setDraftId(resp.data.id);
      }
      message.success('草稿已保存');
    } catch (err: any) {
      message.error(err.response?.data?.error || '草稿保存失败');
    }
    setSavingDraft(false);
  };

  const openPublish = () => {
    const allErrs = [0, 1, 2].flatMap((s) => validateStep(s, { campaign, adset, ad }));
    setErrors(allErrs);
    if (allErrs.length === 0) setPublishOpen(true);
  };

  const handlePublish = async () => {
    if (!accountId) return;
    setPublishing(true);
    try {
      const body = buildPublishBody(accountId, { campaign, adset, ad }, publishPaused);
      const resp = await api.post('/publish', body);
      const result: PublishResult = resp.data;
      setPublishResult(result);
      if (result.ad.success && draftId) {
        await api.delete(`/drafts/${draftId}`).catch(() => {});
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '发布失败');
    }
    setPublishing(false);
    setPublishOpen(false);
  };

  if (!accountId) {
    return <Alert type="warning" showIcon message="请先在顶部选择广告账户" />;
  }

  // 发布结果页
  if (publishResult) {
    const allOk = publishResult.campaign.success && publishResult.adset.success && publishResult.ad.success;
    const levelLine = (name: string, r: LevelResult) =>
      `${name}：${r.success ? `成功（${r.id}）` : `失败 — ${r.error || '未知错误'}`}`;
    return (
      <Result
        status={allOk ? 'success' : 'warning'}
        title={allOk ? '发布成功' : '部分发布失败'}
        subTitle={
          <div style={{ textAlign: 'left', display: 'inline-block' }}>
            <div>{levelLine('广告系列', publishResult.campaign)}</div>
            <div>{levelLine('广告组', publishResult.adset)}</div>
            <div>{levelLine('广告', publishResult.ad)}</div>
            {!allOk && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
                已创建的层级以{publishPaused ? '暂停' : '原'}状态保留在 Facebook，可在广告管理中继续编辑。
              </Typography.Paragraph>
            )}
          </div>
        }
        extra={[
          <Button type="primary" key="back" onClick={() => { reset(); navigate('/ads'); }}>
            返回广告管理
          </Button>,
          !allOk && (
            <Button key="retry" onClick={() => setPublishResult(null)}>
              返回向导修改
            </Button>
          ),
        ]}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/ads')}>返回</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          创建广告 — {accountName || accountId}
        </Typography.Title>
        {draftId && <Typography.Text type="secondary">（草稿编辑中）</Typography.Text>}
      </div>

      <div style={{ display: 'flex', gap: 32 }}>
        <Steps
          direction="vertical"
          size="small"
          current={step}
          onChange={(s) => { if (s < step) setStep(s); }}
          style={{ width: 180, flexShrink: 0 }}
          items={[
            { title: '广告系列', description: '名称与预算优化' },
            { title: '广告组', description: '受众·预算·版位' },
            { title: '广告', description: '创意与文案' },
          ]}
        />
        <div style={{ flex: 1 }}>
          {errors.length > 0 && (
            <Alert
              type="error" showIcon style={{ marginBottom: 16 }} message="请完善以下内容"
              description={<ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            />
          )}
          {step === 0 && <CampaignStep />}
          {step === 1 && <AdSetStep />}
          {step === 2 && <AdStep pages={pages} pagesLoading={pagesLoading} />}

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <Button icon={<SaveOutlined />} onClick={handleSaveDraft} loading={savingDraft}>
              保存草稿
            </Button>
            <div style={{ flex: 1 }} />
            {step > 0 && <Button onClick={() => setStep(step - 1)}>上一步</Button>}
            {step < 2 && <Button type="primary" onClick={goNext}>下一步</Button>}
            {step === 2 && (
              <Button type="primary" icon={<SendOutlined />} onClick={openPublish}>
                发布
              </Button>
            )}
          </div>
        </div>
      </div>

      <Modal
        title="确认发布"
        open={publishOpen}
        onOk={handlePublish}
        onCancel={() => setPublishOpen(false)}
        confirmLoading={publishing}
        okText="确认发布"
      >
        <Typography.Paragraph>
          将在账户 <b>{accountName || accountId}</b> 创建：
        </Typography.Paragraph>
        <ul>
          <li>广告系列：{campaign.name}</li>
          <li>广告组：{adset.name}</li>
          <li>广告：{ad.name}</li>
        </ul>
        <Checkbox checked={publishPaused} onChange={(e) => setPublishPaused(e.target.checked)}>
          以暂停状态发布（推荐，确认无误后再开启投放）
        </Checkbox>
      </Modal>
    </div>
  );
};
```

- [ ] **Step 2: `App.tsx` 注册路由**

导入区追加：

```ts
import { AdCreate } from './pages/AdCreate';
```

在 `<Route path="ads" element={<AdsManager />} />` 之后追加：

```tsx
        <Route path="ads/create" element={<AdCreate />} />
```

- [ ] **Step 3: 编译验证 + Commit**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

```bash
git add client/src/pages/AdCreate/index.tsx client/src/App.tsx
git commit -m "feat(client): /ads/create 创建向导壳与发布/草稿流程"
```

---

### Task 9: 前端 — 广告管理入口改造（创建按钮 + 草稿下拉）

**Files:**
- Modify: `client/src/pages/AdsManager/index.tsx`

- [ ] **Step 1: 工具栏按钮替换**

导入区追加：

```ts
import { useNavigate } from 'react-router-dom';
import { Dropdown, Popconfirm } from 'antd';
import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
```

组件内（`const { accountId } = useAccountStore();` 之后）追加：

```tsx
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<{ id: string; name: string; updated_at: string }[]>([]);

  const loadDrafts = async () => {
    if (!accountId) return;
    try {
      const resp = await api.get('/drafts', { params: { accountId } });
      setDrafts(resp.data || []);
    } catch {
      // 草稿加载失败不阻塞页面
    }
  };

  const removeDraft = async (id: string) => {
    await api.delete(`/drafts/${id}`);
    loadDrafts();
  };
```

将工具栏中的：

```tsx
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => setEditTarget({ level: 'campaign', record: null, parentId: null })}>
            创建广告系列
          </Button>
```

替换为：

```tsx
          <Dropdown.Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={() => navigate('/ads/create')}
            onOpenChange={(open) => { if (open) loadDrafts(); }}
            menu={{
              items: drafts.length === 0
                ? [{ key: 'empty', label: '暂无草稿', disabled: true }]
                : drafts.map((d) => ({
                    key: d.id,
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}
                        onClick={() => navigate(`/ads/create?draftId=${d.id}`)}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                        <span style={{ fontSize: 11, color: '#999' }}>
                          {new Date(d.updated_at).toLocaleDateString()}
                        </span>
                        <Popconfirm title="删除该草稿？"
                          onConfirm={(e) => { e?.stopPropagation(); removeDraft(d.id); }}>
                          <DeleteOutlined onClick={(e) => e.stopPropagation()} style={{ color: '#ff4d4f' }} />
                        </Popconfirm>
                      </div>
                    ),
                  })),
            }}
          >
            <PlusOutlined /> 创建广告
          </Dropdown.Button>
```

空状态 `EmptyState` 的 `onAction` 同步改为 `() => navigate('/ads/create')`。

- [ ] **Step 2: 编译验证 + Commit**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

```bash
git add client/src/pages/AdsManager/index.tsx
git commit -m "feat(client): 广告管理创建入口指向向导并带草稿下拉"
```

---

### Task 10: 清理遗留页面

**Files:**
- Delete: `client/src/pages/Campaigns.tsx`、`client/src/pages/AdSets.tsx`、`client/src/pages/Ads.tsx`
- Delete: `client/src/hooks/useCampaigns.ts`、`client/src/hooks/useAdSets.ts`、`client/src/hooks/useAds.ts`

- [ ] **Step 1: 确认无其他引用**

Run: `cd /root/fb_auto_analytics/client && grep -rn "useCampaigns\|useAdSets\|useAds\b\|pages/Campaigns\|pages/AdSets\|pages/Ads'" src --include='*.tsx' --include='*.ts' | grep -v 'pages/Campaigns.tsx\|pages/AdSets.tsx\|pages/Ads.tsx\|hooks/useCampaigns\|hooks/useAdSets\|hooks/useAds'`
Expected: 无输出（即只有待删文件自身互相引用）。

- [ ] **Step 2: 删除 6 个文件，编译验证**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add -A client/src/pages/Campaigns.tsx client/src/pages/AdSets.tsx client/src/pages/Ads.tsx client/src/hooks/useCampaigns.ts client/src/hooks/useAdSets.ts client/src/hooks/useAds.ts
git commit -m "chore(client): 删除未挂路由的遗留广告页面与 hooks"
```

---

### Task 11: 浏览器实测（阶段二验收）

前置：server/client dev 运行中，真实账户登录，账户已配置像素与主页权限。

- [ ] **Step 1: 核对清单**

1. `/ads` 点"创建广告" → 进入向导；步骤1 不填名称点下一步 → 显示校验错误
2. 步骤1 开启 CBO → 出现系列预算；步骤2 预算区随之隐藏
3. 步骤2 像素下拉有数据；兴趣搜索输入"shopping"返回选项；手动版位勾选平台
4. 步骤3 上传图片 → 预览卡实时显示图片/文案/标题/CTA；切换视频格式 → 出现视频+缩略图上传
5. 任意步骤点"保存草稿" → 提示成功；返回 `/ads` → 创建按钮下拉显示草稿；点击草稿 → 状态完整恢复（除本地预览图）；删除草稿生效
6. 发布（勾选暂停状态）→ 结果页三层全部成功；`/ads` 刷新后新系列/组/广告出现且为暂停状态
7. 故意选错像素或填超长文本触发 FB 错误 → 结果页显示失败层级与 FB 错误信息，已创建层级保留
8. 服务端 `npm test` 全部通过

- [ ] **Step 2: 发现问题则修复后重测，全部通过即阶段二完成**
