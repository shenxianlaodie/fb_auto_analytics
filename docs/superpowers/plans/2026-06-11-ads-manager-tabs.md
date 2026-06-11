# 广告管理三层 Tab 化改造（阶段一）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/ads` 广告管理页从嵌套展开表格改为 Facebook Ads Manager 风格的三层 Tab（系列/组/广告）+ 勾选联动筛选 + 批量开停 + 复制 + 行内重命名。

**Architecture:** 数据链路不变（`GET /api/analytics/hierarchy` DB-First + 60 秒轮询），前端将三层数据扁平化分发到三个 Tab。后端新增 FB `/copies` 复制端点和批量状态端点，成功后沿用 `writeBack*` 写回本地库。原 `AdsManager.tsx`（1182 行）拆分为 `pages/AdsManager/` 目录下多个职责单一的文件。

**Tech Stack:** React 18 + Ant Design 5 + Zustand（前端）；Express + PostgreSQL + 自封装 FacebookClient（后端，Graph API v19）。

**验证约定:** 本阶段无单测基础设施，每个任务以 `npm run build`（client：`tsc -b && vite build`；server：`tsc`）编译通过为机器验证，最后统一浏览器实测。

**提交身份约定:** 仓库未配置 git 身份，提交命令统一使用：
`git -c user.name='shenxianlaodie' -c user.email='shenxianlaodie@users.noreply.github.com' commit -m "..."`
（下文简写为 `git commit -m "..."`，执行时带上 `-c` 参数。）

---

## 文件结构总览

```
server/src/
  utils/fbError.ts                     [新增] FB 错误信息提取
  services/facebookClient.ts           [修改] 增加 copyObject 方法
  routes/campaigns.ts                  [修改] 增加 POST /:id/copy
  routes/adsets.ts                     [修改] 增加 POST /:id/copy
  routes/ads.ts                        [修改] 增加 POST /:id/copy
  routes/bulk.ts                       [新增] POST /api/bulk/status
  app.ts                               [修改] 注册 bulkRouter

client/src/
  store/adsManagerStore.ts             [新增] Tab/勾选状态
  pages/AdsManager.tsx                 [删除]（最后一个任务中删除）
  pages/AdsManager/
    index.tsx                          [新增] 页面装配（工具栏/筛选/Tabs/表格/弹窗）
    helpers.tsx                        [新增] 纯工具函数 + 状态渲染（从旧文件平移）
    useHierarchy.ts                    [新增] 数据加载/轮询/刷新 hook（从旧文件平移）
    columns.tsx                        [新增] 三层列定义（DRY 聚合指标列）
    NameCell.tsx                       [新增] 名称单元格（hover 快捷键 + 行内重命名）
    BulkActionBar.tsx                  [新增] 批量操作条
    CopyModal.tsx                      [新增] 复制弹窗
    EditModal.tsx                      [新增] 创建/编辑弹窗（从旧文件平移）
```

注意：`client/src/components/AdsManager/ColumnOrderSettings.tsx`、`store/columnOrderStore.ts`、`utils/columnOrder.ts` 不动，列 key 保持与旧版一致以兼容已保存的列顺序。

---

### Task 1: 后端 — FB 复制端点

**Files:**
- Create: `server/src/utils/fbError.ts`
- Modify: `server/src/services/facebookClient.ts`（在 `deleteAd` 方法后，约 L340）
- Modify: `server/src/routes/campaigns.ts`、`server/src/routes/adsets.ts`、`server/src/routes/ads.ts`

- [ ] **Step 1: 创建 `server/src/utils/fbError.ts`**

```ts
/** 提取 FB Graph API 错误中的用户可读信息 */
export function fbErrorMessage(err: any): string {
  const fbErr = err?.response?.data?.error;
  return fbErr?.error_user_msg || fbErr?.message || err?.message || '操作失败';
}
```

- [ ] **Step 2: `facebookClient.ts` 增加 copyObject 方法**

在 `deleteAd` 方法之后（`// --- Insights ---` 注释之前）插入：

```ts
  // --- Copies ---

  /** FB 官方复制接口：POST /{object_id}/copies，campaign/adset/ad 通用 */
  async copyObject(objectId: string, accessToken: string, params: Record<string, any>): Promise<any> {
    return this.post(`${objectId}/copies`, accessToken, params);
  }
```

- [ ] **Step 3: `routes/campaigns.ts` 增加复制端点**

文件顶部增加导入：

```ts
import { FacebookClient } from '../services/facebookClient';
import { fbErrorMessage } from '../utils/fbError';
```

在 `DELETE /api/campaigns/:id` 路由之后追加：

```ts
// POST /api/campaigns/:id/copy — 复制广告系列（深复制，含子组/广告）
campaignsRouter.post('/:id/copy', async (req: AuthRequest, res: Response) => {
  try {
    const { count = 1, statusOption = 'PAUSED' } = req.body;
    const fb = FacebookClient.getInstance();
    const copies: any[] = [];
    for (let i = 0; i < Math.min(Number(count) || 1, 10); i++) {
      const result = await fb.copyObject(req.params.id, req.accessToken!, {
        deep_copy: true,
        status_option: statusOption,
      });
      copies.push(result);
    }
    res.json({ success: true, copies });
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});
```

- [ ] **Step 4: `routes/adsets.ts` 增加复制端点**

文件顶部增加与 Step 3 相同的两条导入。在 `DELETE` 路由之后追加：

```ts
// POST /api/adsets/:id/copy — 复制广告组（可指定目标系列）
adsetsRouter.post('/:id/copy', async (req: AuthRequest, res: Response) => {
  try {
    const { count = 1, statusOption = 'PAUSED', targetCampaignId } = req.body;
    const fb = FacebookClient.getInstance();
    const copies: any[] = [];
    for (let i = 0; i < Math.min(Number(count) || 1, 10); i++) {
      const params: Record<string, any> = { deep_copy: true, status_option: statusOption };
      if (targetCampaignId) params.campaign_id = targetCampaignId;
      copies.push(await fb.copyObject(req.params.id, req.accessToken!, params));
    }
    res.json({ success: true, copies });
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});
```

- [ ] **Step 5: `routes/ads.ts` 增加复制端点**

文件顶部增加与 Step 3 相同的两条导入。在 `DELETE` 路由之后追加：

```ts
// POST /api/ads/:id/copy — 复制广告（可指定目标广告组）
adsRouter.post('/:id/copy', async (req: AuthRequest, res: Response) => {
  try {
    const { count = 1, statusOption = 'PAUSED', targetAdsetId } = req.body;
    const fb = FacebookClient.getInstance();
    const copies: any[] = [];
    for (let i = 0; i < Math.min(Number(count) || 1, 10); i++) {
      const params: Record<string, any> = { status_option: statusOption };
      if (targetAdsetId) params.adset_id = targetAdsetId;
      copies.push(await fb.copyObject(req.params.id, req.accessToken!, params));
    }
    res.json({ success: true, copies });
  } catch (err: any) {
    res.status(500).json({ error: fbErrorMessage(err) });
  }
});
```

- [ ] **Step 6: 编译验证**

Run: `cd /root/fb_auto_analytics/server && npm run build`
Expected: 退出码 0，无 TS 错误。

- [ ] **Step 7: Commit**

```bash
git add server/src/utils/fbError.ts server/src/services/facebookClient.ts server/src/routes/campaigns.ts server/src/routes/adsets.ts server/src/routes/ads.ts
git commit -m "feat(server): FB copies 复制端点（系列/组/广告）"
```

---

### Task 2: 后端 — 批量状态端点

**Files:**
- Create: `server/src/routes/bulk.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: 创建 `server/src/routes/bulk.ts`**

```ts
import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { CampaignService } from '../services/campaignService';
import { AdSetService } from '../services/adSetService';
import { AdService } from '../services/adService';
import { writeBackCampaign, writeBackAdset, writeBackAd } from '../models/fbStructure';
import { fbErrorMessage } from '../utils/fbError';

export const bulkRouter = Router();
bulkRouter.use(authMiddleware);

// POST /api/bulk/status — 批量开启/暂停，逐条容错
bulkRouter.post('/status', async (req: AuthRequest, res: Response) => {
  const { level, ids, status } = req.body as {
    level: 'campaign' | 'adset' | 'ad';
    ids: string[];
    status: 'ACTIVE' | 'PAUSED';
  };
  if (
    !['campaign', 'adset', 'ad'].includes(level) ||
    !Array.isArray(ids) || ids.length === 0 ||
    !['ACTIVE', 'PAUSED'].includes(status)
  ) {
    res.status(400).json({ error: '参数错误' });
    return;
  }

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of ids.slice(0, 50)) {
    try {
      if (level === 'campaign') {
        await new CampaignService(req.accessToken!).updateCampaign(id, { status });
        await writeBackCampaign(id, { status });
      } else if (level === 'adset') {
        await new AdSetService(req.accessToken!).updateAdSet(id, { status });
        await writeBackAdset(id, { status });
      } else {
        await new AdService(req.accessToken!).updateAd(id, { status });
        await writeBackAd(id, { status });
      }
      succeeded.push(id);
    } catch (err: any) {
      failed.push({ id, error: fbErrorMessage(err) });
    }
  }
  res.json({ succeeded, failed });
});
```

- [ ] **Step 2: `app.ts` 注册路由**

导入区追加：

```ts
import { bulkRouter } from './routes/bulk';
```

在 `app.use('/api/analytics', analyticsRouter);` 之后追加：

```ts
app.use('/api/bulk', bulkRouter);
```

- [ ] **Step 3: 编译验证**

Run: `cd /root/fb_auto_analytics/server && npm run build`
Expected: 退出码 0。

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/bulk.ts server/src/app.ts
git commit -m "feat(server): 批量开启/暂停端点 POST /api/bulk/status"
```

---

### Task 3: 前端 — helpers 与 useHierarchy 抽取

本任务只新增文件，旧 `AdsManager.tsx` 暂不动（Task 7 删除），保证每次提交可构建。

**Files:**
- Create: `client/src/pages/AdsManager/helpers.tsx`
- Create: `client/src/pages/AdsManager/useHierarchy.ts`

- [ ] **Step 1: 创建 `client/src/pages/AdsManager/helpers.tsx`**

内容为旧 `client/src/pages/AdsManager.tsx` L25-223 中纯工具部分的平移 + 两个 id 取值帮助函数。完整内容：

```tsx
import React from 'react';
import { Tag, Typography } from 'antd';

export interface UtmAggMetrics {
  spend: number;
  utmUv: number;
  utmOrders: number;
  utmSales: number;
  utmAddToCart: number;
  utmBeginCheckout: number;
}

export function aggregateAdsMetrics(ads: any[]): UtmAggMetrics {
  let spend = 0;
  let utmUv = 0;
  let utmOrders = 0;
  let utmSales = 0;
  let utmAddToCart = 0;
  let utmBeginCheckout = 0;
  for (const ad of ads) {
    spend += Number(ad.spend) || 0;
    utmUv += Number(ad.utmUv) || 0;
    utmOrders += Number(ad.utmOrders) || 0;
    utmSales += Number(ad.utmSales) || 0;
    utmAddToCart += Number(ad.utmAddToCart) || 0;
    utmBeginCheckout += Number(ad.utmBeginCheckout) || 0;
  }
  return { spend, utmUv, utmOrders, utmSales, utmAddToCart, utmBeginCheckout };
}

export function fmtCostPerUv(spend: number, uv: number): string {
  if (!uv || uv <= 0) return '-';
  return `$${(spend / uv).toFixed(2)}`;
}

export function fmtCostPerOrder(spend: number, orders: number): string {
  if (!orders || orders <= 0) return '-';
  return `$${(spend / orders).toFixed(2)}`;
}

export function fmtCostPerCount(spend: number, count: number): string {
  if (!count || count <= 0) return '-';
  return `$${(spend / count).toFixed(2)}`;
}

export function fmtRoas(sales: number, spend: number): string {
  if (!spend || spend <= 0) return '-';
  return (sales / spend).toFixed(2);
}

export function fmtOrders(orders: number): string {
  const n = Number(orders) || 0;
  return n > 0 ? String(n) : '-';
}

export function cmpStr(a: string, b: string): number {
  return (a || '').localeCompare(b || '', 'zh-CN');
}

export function cmpNum(a: number, b: number): number {
  return (a || 0) - (b || 0);
}

export function parseBudget(r: { daily_budget?: string; lifetime_budget?: string }): number {
  const b = r.daily_budget || r.lifetime_budget;
  return b ? parseInt(b, 10) / 100 : 0;
}

export function campaignIdOf(r: any): string {
  return r.campaignId || r.campaign_id;
}

export function adsetIdOf(r: any): string {
  return r.adsetId || r.adset_id;
}

export function adsForCampaign(campaignId: string, ads: any[]): any[] {
  return ads.filter((a) => campaignIdOf(a) === campaignId);
}

export function adsForAdset(adsetId: string, ads: any[]): any[] {
  return ads.filter((a) => adsetIdOf(a) === adsetId);
}

export function ownStatusOf(record: { ownStatus?: string | null; status: string }): string {
  return record.ownStatus ?? record.status;
}

export function renderStatusTag(status: string, level: 'campaign' | 'adset' | 'ad' = 'ad') {
  const pausedLabel = level === 'campaign' ? '已暂停' : '暂停';
  return (
    <Tag color={status === 'ACTIVE' ? 'green' : status === 'PAUSED' ? 'orange' : 'default'}>
      {status === 'ACTIVE' ? '投放中' : status === 'PAUSED' ? pausedLabel : status}
    </Tag>
  );
}

export function renderDeliveryStatusCell(
  record: { status: string; statusHints?: string[] },
  level: 'campaign' | 'adset' | 'ad' = 'ad',
) {
  return (
    <div>
      {renderStatusTag(record.status, level)}
      {record.statusHints?.map((hint) => (
        <div key={hint}>
          <Typography.Text type="warning" style={{ fontSize: 11, lineHeight: '16px' }}>
            {hint}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

/** 按广告编号（精确）/名称（模糊）过滤三层数据，命中下层自动带出上层 */
export function filterHierarchy(
  campaigns: any[],
  adsets: any[],
  ads: any[],
  searchAdId: string,
  searchName: string,
) {
  const adIdQ = searchAdId.trim().toLowerCase();
  const nameQ = searchName.trim().toLowerCase();

  if (!adIdQ && !nameQ) {
    return { campaigns, adsets, ads };
  }

  const campaignIds = new Set<string>();
  const adsetIds = new Set<string>();
  const adIds = new Set<string>();

  for (const c of campaigns) {
    const cid = c.id;
    const campaignNameMatch = nameQ && (c.name || '').toLowerCase().includes(nameQ);
    const childAdsets = adsets.filter((a) => campaignIdOf(a) === cid);

    if (campaignNameMatch) {
      campaignIds.add(cid);
      childAdsets.forEach((a) => adsetIds.add(a.id));
      adsForCampaign(cid, ads).forEach((a) => adIds.add(a.id));
      continue;
    }

    for (const adset of childAdsets) {
      const asid = adset.id;
      const adsetNameMatch = nameQ && (adset.name || '').toLowerCase().includes(nameQ);
      const adsInSet = adsForAdset(asid, ads);

      if (adsetNameMatch) {
        campaignIds.add(cid);
        adsetIds.add(asid);
        adsInSet.forEach((a) => adIds.add(a.id));
        continue;
      }

      for (const ad of adsInSet) {
        const adIdMatch = adIdQ && String(ad.id).toLowerCase() === adIdQ;
        const adNameMatch = nameQ && (ad.name || '').toLowerCase().includes(nameQ);
        if (adIdMatch || adNameMatch) {
          campaignIds.add(cid);
          adsetIds.add(asid);
          adIds.add(ad.id);
        }
      }
    }
  }

  return {
    campaigns: campaigns.filter((c) => campaignIds.has(c.id)),
    adsets: adsets.filter((a) => adsetIds.has(a.id)),
    ads: ads.filter((a) => adIds.has(a.id)),
  };
}
```

- [ ] **Step 2: 创建 `client/src/pages/AdsManager/useHierarchy.ts`**

旧文件 L198-373 数据逻辑的平移（去掉跨日 dateRef 逻辑，由 effect 依赖 dateRange 直接覆盖）：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import { useUIStore } from '../../store/uiStore';

export interface SyncMeta {
  structureSyncedAt: string | null;
  metricsSyncedAt: string | null;
  utmSyncedAt: string | null;
  refreshing: boolean;
  dateStart?: string;
  dateEnd?: string;
  timezone?: string;
  syncWarnings?: string[];
  spendSummary?: {
    totalSpend: number;
    adsWithSpend: number;
    totalAds: number;
    campaignsWithSpend: number;
    totalCampaigns: number;
  };
}

export function useHierarchy() {
  const { accountId, accountName } = useAccountStore();
  const { dateRange } = useUIStore();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [adsets, setAdsets] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyHierarchy = (data: any) => {
    setCampaigns(data.campaigns || []);
    setAdsets(data.adsets || []);
    setAds(data.ads || []);
    if (data.meta) setSyncMeta(data.meta);
  };

  const loadHierarchy = useCallback(async () => {
    if (!accountId) return;
    const resp = await api.get('/analytics/hierarchy', {
      params: { accountId, accountName, dateStart: dateRange[0], dateEnd: dateRange[1] },
    });
    applyHierarchy(resp.data);
  }, [accountId, accountName, dateRange]);

  /** 静默读库（创建/编辑/复制成功后调用） */
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await loadHierarchy();
    } catch (err: any) {
      message.warning(err.response?.data?.error || '加载数据失败');
    }
    setLoading(false);
  }, [loadHierarchy]);

  // 账户/日期变化时清空重载
  useEffect(() => {
    setCampaigns([]);
    setAdsets([]);
    setAds([]);
    setSyncMeta(null);
    if (accountId) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, dateRange[0], dateRange[1]]);

  // 60 秒轮询读库
  useEffect(() => {
    if (!accountId) return;
    pollRef.current = setInterval(() => {
      loadHierarchy().catch(() => {});
    }, 60_000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [accountId, dateRange, loadHierarchy]);

  // 切回标签页时读库
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && accountId) {
        loadHierarchy().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [accountId, loadHierarchy]);

  /** 强制触发后端 FB 同步并轮询直到完成（最多约 30 秒） */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.post('/analytics/refresh', {
        accountId, accountName, dateStart: dateRange[0], dateEnd: dateRange[1], force: true,
      });
      applyHierarchy(resp.data);
      message.info('正在从 Facebook 拉取最新数据...');

      let done = false;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const poll = await api.get('/analytics/hierarchy', {
          params: { accountId, accountName, dateStart: dateRange[0], dateEnd: dateRange[1] },
        });
        applyHierarchy(poll.data);
        if (!poll.data?.meta?.refreshing) {
          done = true;
          break;
        }
      }
      message.success(done ? '已更新为 Facebook 最新数据' : '同步仍在进行，稍后自动更新');
    } catch (err: any) {
      message.warning(err.response?.data?.error || '刷新失败');
    }
    setLoading(false);
  }, [accountId, accountName, dateRange, loadHierarchy]);

  return { campaigns, adsets, ads, loading, syncMeta, reload, refresh };
}
```

- [ ] **Step 3: 编译验证**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0（新文件暂未被引用也应能通过编译）。

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/AdsManager/helpers.tsx client/src/pages/AdsManager/useHierarchy.ts
git commit -m "refactor(client): 抽取广告管理 helpers 与 useHierarchy hook"
```

---

### Task 4: 前端 — adsManagerStore 与基础组件

**Files:**
- Create: `client/src/store/adsManagerStore.ts`
- Create: `client/src/pages/AdsManager/NameCell.tsx`
- Create: `client/src/pages/AdsManager/BulkActionBar.tsx`

- [ ] **Step 1: 创建 `client/src/store/adsManagerStore.ts`**

```ts
import { create } from 'zustand';

export type Level = 'campaign' | 'adset' | 'ad';

interface AdsManagerState {
  activeTab: Level;
  selected: Record<Level, string[]>;
  setActiveTab: (tab: Level) => void;
  setSelected: (level: Level, ids: string[]) => void;
  clearSelected: (level?: Level) => void;
}

const emptySelected: Record<Level, string[]> = { campaign: [], adset: [], ad: [] };

export const useAdsManagerStore = create<AdsManagerState>((set) => ({
  activeTab: 'campaign',
  selected: { ...emptySelected },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setSelected: (level, ids) =>
    set((s) => ({ selected: { ...s.selected, [level]: ids } })),

  clearSelected: (level) =>
    set((s) => ({
      selected: level ? { ...s.selected, [level]: [] } : { ...emptySelected },
    })),
}));
```

- [ ] **Step 2: 创建 `client/src/pages/AdsManager/NameCell.tsx`**

```tsx
import React, { useState } from 'react';
import { Button, Input, Space, Typography } from 'antd';
import { CopyOutlined, EditOutlined } from '@ant-design/icons';

/** FB 风格名称单元格：hover 浮现 重命名/复制，点击铅笔行内编辑 */
export function NameCell({
  name,
  onRename,
  onCopy,
}: {
  name: string;
  onRename: (newName: string) => Promise<void>;
  onCopy: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <Input
        autoFocus
        size="small"
        defaultValue={name}
        disabled={saving}
        onBlur={() => setEditing(false)}
        onPressEnter={async (e: any) => {
          const v = e.target.value.trim();
          if (!v || v === name) {
            setEditing(false);
            return;
          }
          setSaving(true);
          try {
            await onRename(v);
          } finally {
            setSaving(false);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 24 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Typography.Text ellipsis style={{ flex: 1 }} title={name}>
        {name}
      </Typography.Text>
      {hover && (
        <Space size={0}>
          <Button size="small" type="text" icon={<EditOutlined />} title="重命名"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }} />
          <Button size="small" type="text" icon={<CopyOutlined />} title="复制"
            onClick={(e) => { e.stopPropagation(); onCopy(); }} />
        </Space>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 创建 `client/src/pages/AdsManager/BulkActionBar.tsx`**

```tsx
import React from 'react';
import { Button, Typography } from 'antd';
import { CloseOutlined, CopyOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';

export function BulkActionBar({
  count,
  loading,
  onEnable,
  onPause,
  onCopy,
  onClear,
}: {
  count: number;
  loading: boolean;
  onEnable: () => void;
  onPause: () => void;
  onCopy: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      style={{
        background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6,
        padding: '8px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <Typography.Text strong>已选 {count} 项</Typography.Text>
      <Button size="small" icon={<PlayCircleOutlined />} onClick={onEnable} loading={loading}>批量开启</Button>
      <Button size="small" icon={<PauseCircleOutlined />} onClick={onPause} loading={loading}>批量暂停</Button>
      <Button size="small" icon={<CopyOutlined />} onClick={onCopy}>复制</Button>
      <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClear}>取消选择</Button>
    </div>
  );
}
```

- [ ] **Step 4: 编译验证**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

- [ ] **Step 5: Commit**

```bash
git add client/src/store/adsManagerStore.ts client/src/pages/AdsManager/NameCell.tsx client/src/pages/AdsManager/BulkActionBar.tsx
git commit -m "feat(client): 广告管理 Tab 状态 store 与名称单元格/批量操作条组件"
```

---

### Task 5: 前端 — 三层列定义 columns.tsx

**Files:**
- Create: `client/src/pages/AdsManager/columns.tsx`

列 key 必须与旧版完全一致（`name/status/budget/utmOrders/purchases/spend/cpm/uniqueClicks/costPerAddToCart/costPerInitiateCheckout/costPerPurchase/utmCampaign/creative/id/actions`），以兼容 `columnOrderStore` 已保存的列顺序。

- [ ] **Step 1: 创建 `client/src/pages/AdsManager/columns.tsx`**

```tsx
import React from 'react';
import { Button, Image, Input, Space, Switch, Tag } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  UtmAggMetrics, aggregateAdsMetrics, adsForAdset, adsForCampaign,
  cmpNum, cmpStr, fmtCostPerCount, fmtCostPerOrder, fmtCostPerUv, fmtOrders, fmtRoas,
  ownStatusOf, parseBudget, renderDeliveryStatusCell,
} from './helpers';
import { NameCell } from './NameCell';
import type { Level } from '../../store/adsManagerStore';

export interface ColumnsCtx {
  allAds: any[];
  editingBudget: { id: string; type: string } | null;
  setEditingBudget: (v: { id: string; type: string } | null) => void;
  onUpdateBudget: (type: 'campaign' | 'adset', id: string, budgetCents: number) => void;
  onToggleStatus: (level: Level, id: string, current: string) => void;
  onRename: (level: Level, id: string, name: string) => Promise<void>;
  onCopy: (level: Level, record: any) => void;
  onEdit: (level: Level, record: any) => void;
  onCreateChild: (level: 'adset' | 'ad', parentId: string) => void;
}

// --- 通用列 ---

function nameCol(ctx: ColumnsCtx, level: Level, title: string): any {
  return {
    title, dataIndex: 'name', key: 'name', width: 220, fixed: 'left' as const,
    sorter: (a: any, b: any) => cmpStr(a.name, b.name),
    render: (_: any, r: any) => (
      <NameCell
        name={r.name}
        onRename={(newName) => ctx.onRename(level, r.id, newName)}
        onCopy={() => ctx.onCopy(level, r)}
      />
    ),
  };
}

function switchCol(ctx: ColumnsCtx, level: Level): any {
  return {
    title: '开/关', key: 'toggle', width: 64,
    render: (_: any, r: any) => (
      <Switch
        size="small"
        checked={ownStatusOf(r) === 'ACTIVE'}
        onChange={() => ctx.onToggleStatus(level, r.id, ownStatusOf(r))}
        checkedChildren="开" unCheckedChildren="关"
      />
    ),
  };
}

function statusCol(level: Level): any {
  return {
    title: '投放状态', dataIndex: 'status', key: 'status', width: 110,
    sorter: (a: any, b: any) => cmpStr(a.status, b.status),
    render: (_: string, record: any) => renderDeliveryStatusCell(record, level),
  };
}

function budgetCol(ctx: ColumnsCtx, type: 'campaign' | 'adset', title: string): any {
  return {
    title, key: 'budget', width: 100,
    sorter: (a: any, b: any) => cmpNum(parseBudget(a), parseBudget(b)),
    render: (_: any, r: any) => {
      const budget = parseBudget(r);
      if (ctx.editingBudget?.id === r.id && ctx.editingBudget?.type === type) {
        const commit = (raw: string) => {
          const v = parseInt(raw, 10);
          if (v > 0) ctx.onUpdateBudget(type, r.id, v);
          else ctx.setEditingBudget(null);
        };
        return (
          <Input
            autoFocus size="small" type="number" defaultValue={budget} style={{ width: 80 }}
            onBlur={(e) => commit(e.target.value)}
            onPressEnter={(e: any) => commit(e.target.value)}
          />
        );
      }
      return (
        <span
          style={{ cursor: 'pointer' }}
          onDoubleClick={() => ctx.setEditingBudget({ id: r.id, type })}
          title="双击编辑预算"
        >
          {budget > 0 ? `$${budget.toFixed(0)}` : '-'}
        </span>
      );
    },
  };
}

function spendCol(): any {
  return {
    title: '已花费\n金额', key: 'spend', width: 90,
    defaultSortOrder: 'descend' as const,
    sorter: (a: any, b: any) => cmpNum(Number(a.spend) || 0, Number(b.spend) || 0),
    render: (_: any, r: any) =>
      r.spend != null && !isNaN(r.spend) ? `$${Number(r.spend).toFixed(2)}` : '-',
  };
}

function cpmCol(): any {
  return {
    title: 'CPM', key: 'cpm', width: 80,
    sorter: (a: any, b: any) => cmpNum(Number(a.cpm) || 0, Number(b.cpm) || 0),
    render: (_: any, r: any) =>
      r.cpm != null && !isNaN(r.cpm) ? `$${Number(r.cpm).toFixed(2)}` : '-',
  };
}

function idCol(title: string): any {
  return {
    title, dataIndex: 'id', key: 'id', width: 160, ellipsis: true,
    sorter: (a: any, b: any) => cmpStr(a.id, b.id),
  };
}

/** 系列/组层 UTM 聚合指标列（聚合子广告） */
function aggMetricCols(childAdsOf: (r: any) => any[]): any[] {
  const col = (
    title: string, key: string, width: number,
    value: (m: UtmAggMetrics) => number,
    text: (m: UtmAggMetrics) => string,
  ): any => ({
    title, key, width,
    sorter: (a: any, b: any) =>
      cmpNum(value(aggregateAdsMetrics(childAdsOf(a))), value(aggregateAdsMetrics(childAdsOf(b)))),
    render: (_: any, r: any) => text(aggregateAdsMetrics(childAdsOf(r))),
  });
  return [
    col('成效', 'utmOrders', 70, (m) => m.utmOrders, (m) => fmtOrders(m.utmOrders)),
    col('单次成效\n花费', 'purchases', 90,
      (m) => (m.utmOrders > 0 ? m.spend / m.utmOrders : -1),
      (m) => fmtCostPerOrder(m.spend, m.utmOrders)),
    col('单次连接\n点击花费', 'uniqueClicks', 100,
      (m) => (m.utmUv > 0 ? m.spend / m.utmUv : -1),
      (m) => fmtCostPerUv(m.spend, m.utmUv)),
    col('单次加购\n费用', 'costPerAddToCart', 90,
      (m) => (m.utmAddToCart > 0 ? m.spend / m.utmAddToCart : -1),
      (m) => fmtCostPerCount(m.spend, m.utmAddToCart)),
    col('单次结账\n费用', 'costPerInitiateCheckout', 90,
      (m) => (m.utmBeginCheckout > 0 ? m.spend / m.utmBeginCheckout : -1),
      (m) => fmtCostPerCount(m.spend, m.utmBeginCheckout)),
    col('ROAS', 'costPerPurchase', 90,
      (m) => (m.spend > 0 ? m.utmSales / m.spend : -1),
      (m) => fmtRoas(m.utmSales, m.spend)),
  ];
}

/** 广告层直接字段指标列 */
function adMetricCols(): any[] {
  const ratio = (num: (r: any) => number, den: (r: any) => number) =>
    (a: any, b: any) => {
      const va = den(a) > 0 ? num(a) / den(a) : -1;
      const vb = den(b) > 0 ? num(b) / den(b) : -1;
      return cmpNum(va, vb);
    };
  const spend = (r: any) => Number(r.spend) || 0;
  return [
    {
      title: '成效', dataIndex: 'utmOrders', key: 'utmOrders', width: 70,
      sorter: (a: any, b: any) => cmpNum(Number(a.utmOrders) || 0, Number(b.utmOrders) || 0),
      render: (_: any, r: any) => fmtOrders(Number(r.utmOrders) || 0),
    },
    {
      title: '单次成效\n花费', key: 'purchases', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmOrders) || 0),
      render: (_: any, r: any) => fmtCostPerOrder(spend(r), Number(r.utmOrders) || 0),
    },
    {
      title: '单次连接\n点击花费', key: 'uniqueClicks', width: 100,
      sorter: ratio(spend, (r) => Number(r.utmUv) || 0),
      render: (_: any, r: any) => fmtCostPerUv(spend(r), Number(r.utmUv) || 0),
    },
    {
      title: '单次加购\n费用', key: 'costPerAddToCart', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmAddToCart) || 0),
      render: (_: any, r: any) => fmtCostPerCount(spend(r), Number(r.utmAddToCart) || 0),
    },
    {
      title: '单次结账\n费用', key: 'costPerInitiateCheckout', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmBeginCheckout) || 0),
      render: (_: any, r: any) => fmtCostPerCount(spend(r), Number(r.utmBeginCheckout) || 0),
    },
    {
      title: 'ROAS', key: 'costPerPurchase', width: 90,
      sorter: ratio((r) => Number(r.utmSales) || 0, spend),
      render: (_: any, r: any) => fmtRoas(Number(r.utmSales) || 0, spend(r)),
    },
  ];
}

// --- 三层列构建 ---

export function buildCampaignColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return [
    nameCol(ctx, 'campaign', '广告系列名'),
    switchCol(ctx, 'campaign'),
    statusCol('campaign'),
    budgetCol(ctx, 'campaign', '预算'),
    ...aggMetricCols((r) => adsForCampaign(r.id, ctx.allAds)),
    spendCol(),
    cpmCol(),
    idCol('广告编号'),
    {
      title: '操作', key: 'actions', width: 160, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => ctx.onCreateChild('adset', record.id)}>+广告组</Button>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => ctx.onEdit('campaign', record)}>编辑</Button>
        </Space>
      ),
    },
  ];
}

export function buildAdsetColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return [
    nameCol(ctx, 'adset', '广告组名称'),
    switchCol(ctx, 'adset'),
    statusCol('adset'),
    budgetCol(ctx, 'adset', '日预算'),
    ...aggMetricCols((r) => adsForAdset(r.id, ctx.allAds)),
    spendCol(),
    cpmCol(),
    idCol('广告组编号'),
    {
      title: '操作', key: 'actions', width: 150, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => ctx.onCreateChild('ad', record.id)}>+广告</Button>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => ctx.onEdit('adset', record)}>编辑</Button>
        </Space>
      ),
    },
  ];
}

export function buildAdColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return [
    nameCol(ctx, 'ad', '广告名称'),
    switchCol(ctx, 'ad'),
    {
      title: '创意', dataIndex: 'creative', key: 'creative', width: 70,
      render: (c: any) =>
        c?.thumbnail_url
          ? <Image src={c.thumbnail_url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
          : <Tag>无</Tag>,
    },
    {
      title: '活动关键词', dataIndex: 'utmCampaign', key: 'utmCampaign', width: 140, ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    statusCol('ad'),
    spendCol(),
    cpmCol(),
    ...adMetricCols(),
    idCol('广告编号'),
    {
      title: '操作', key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Button size="small" type="link" icon={<EditOutlined />}
          onClick={() => ctx.onEdit('ad', record)}>编辑</Button>
      ),
    },
  ];
}
```

- [ ] **Step 2: 编译验证**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/AdsManager/columns.tsx
git commit -m "feat(client): 三层 Tab 表格列定义（DRY 聚合指标列）"
```

---

### Task 6: 前端 — EditModal 与 CopyModal

**Files:**
- Create: `client/src/pages/AdsManager/EditModal.tsx`
- Create: `client/src/pages/AdsManager/CopyModal.tsx`

- [ ] **Step 1: 创建 `client/src/pages/AdsManager/EditModal.tsx`**

旧文件 Modal（L765-814）+ handleSubmit（L389-437）的平移封装：

```tsx
import React, { useEffect, useState } from 'react';
import { Form, Input, Modal, Select, message } from 'antd';
import api from '../../services/api';
import { ownStatusOf } from './helpers';
import type { Level } from '../../store/adsManagerStore';

const OBJECTIVES: Record<string, string> = {
  OUTCOME_SALES: '转化',
  OUTCOME_TRAFFIC: '流量',
  OUTCOME_AWARENESS: '品牌认知',
  OUTCOME_ENGAGEMENT: '互动',
  OUTCOME_LEADS: '潜在客户',
  OUTCOME_APP_PROMOTION: '应用推广',
};

const LEVEL_LABEL: Record<Level, string> = { campaign: '广告系列', adset: '广告组', ad: '广告' };

export interface EditTarget {
  level: Level;
  record: any | null;       // null = 创建
  parentId: string | null;  // 创建 adset/ad 时的父级 id
}

export function EditModal({
  target,
  accountId,
  onClose,
  onDone,
}: {
  target: EditTarget | null;
  accountId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const editing = !!target?.record;

  useEffect(() => {
    if (!target) return;
    form.resetFields();
    if (target.record) {
      form.setFieldsValue({
        name: target.record.name,
        objective: target.record.objective,
        status: ownStatusOf(target.record),
      });
    } else if (target.level === 'campaign') {
      form.setFieldsValue({ objective: 'OUTCOME_SALES', status: 'PAUSED' });
    } else {
      form.setFieldsValue({ status: 'PAUSED' });
    }
  }, [target, form]);

  const handleSubmit = async () => {
    if (!target) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const { level, record, parentId } = target;

      if (level === 'campaign') {
        if (record) {
          await api.put(`/campaigns/${record.id}`, { name: values.name, status: values.status });
        } else {
          await api.post('/campaigns', { accountId, ...values });
        }
      } else if (level === 'adset') {
        if (record) {
          await api.put(`/adsets/${record.id}`, { name: values.name, status: values.status });
        } else {
          await api.post('/adsets', {
            accountId, campaignId: parentId, name: values.name,
            targeting: { age_min: 18, age_max: 65, geo_locations: { countries: ['US'] } },
            budget: { daily: values.daily_budget || 1000 },
            bidStrategy: 'LOWEST_COST_WITHOUT_CAP', status: values.status,
          });
        }
      } else {
        if (record) {
          await api.put(`/ads/${record.id}`, { name: values.name, status: values.status });
        } else {
          await api.post('/ads', {
            accountId, adsetId: parentId, name: values.name,
            creative: {
              title: values.headline, body: values.body_text || '',
              imageUrl: values.image_url, linkUrl: values.link,
              callToAction: values.cta || 'SHOP_NOW',
            },
            status: values.status,
          });
        }
      }

      message.success(record ? '更新成功' : '创建成功');
      onClose();
      onDone();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={target ? `${editing ? '编辑' : '创建'}${LEVEL_LABEL[target.level]}` : ''}
      open={!!target}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={submitting}
      destroyOnHidden
      width={500}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input maxLength={100} />
        </Form.Item>
        {target?.level === 'campaign' && !editing && (
          <Form.Item name="objective" label="广告目标">
            <Select options={Object.entries(OBJECTIVES).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
        )}
        {target?.level === 'adset' && !editing && (
          <Form.Item name="daily_budget" label="日预算 (美分)">
            <Input type="number" placeholder="1000 = $10.00" />
          </Form.Item>
        )}
        {target?.level === 'ad' && !editing && (
          <>
            <Form.Item name="headline" label="广告标题" rules={[{ required: true }]}>
              <Input maxLength={40} showCount />
            </Form.Item>
            <Form.Item name="body_text" label="正文">
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
            <Form.Item name="image_url" label="图片链接">
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item name="link" label="目标链接" rules={[{ required: true }]}>
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item name="cta" label="CTA" initialValue="SHOP_NOW">
              <Select options={[
                { value: 'SHOP_NOW', label: '立即购买' },
                { value: 'LEARN_MORE', label: '了解更多' },
                { value: 'SIGN_UP', label: '注册' },
              ]} />
            </Form.Item>
          </>
        )}
        <Form.Item name="status" label="状态">
          <Select options={[
            { value: 'ACTIVE', label: '投放中' },
            { value: 'PAUSED', label: '已暂停' },
          ]} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: 创建 `client/src/pages/AdsManager/CopyModal.tsx`**

```tsx
import React, { useState } from 'react';
import { Form, InputNumber, Modal, Select, Switch, Typography } from 'antd';
import type { Level } from '../../store/adsManagerStore';

const LEVEL_LABEL: Record<Level, string> = { campaign: '广告系列', adset: '广告组', ad: '广告' };

export interface CopyTarget {
  level: Level;
  records: any[]; // 待复制对象（单个或批量勾选）
}

export interface CopyOptions {
  count: number;
  statusOption: 'PAUSED' | 'INHERITED_FROM_SOURCE';
  targetId?: string; // adset 复制 → 目标系列；ad 复制 → 目标广告组
}

export function CopyModal({
  target,
  campaigns,
  adsets,
  submitting,
  onCancel,
  onSubmit,
}: {
  target: CopyTarget | null;
  campaigns: any[];
  adsets: any[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (opts: CopyOptions) => void;
}) {
  const [count, setCount] = useState(1);
  const [paused, setPaused] = useState(true);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);

  const level = target?.level;
  const targetOptions =
    level === 'adset'
      ? campaigns.map((c) => ({ value: c.id, label: c.name }))
      : level === 'ad'
        ? adsets.map((a) => ({ value: a.id, label: a.name }))
        : [];

  return (
    <Modal
      title={target ? `复制 ${target.records.length} 个${LEVEL_LABEL[target.level]}` : ''}
      open={!!target}
      onOk={() => onSubmit({ count, statusOption: paused ? 'PAUSED' : 'INHERITED_FROM_SOURCE', targetId })}
      onCancel={onCancel}
      confirmLoading={submitting}
      okText="复制"
      destroyOnHidden
      afterClose={() => { setCount(1); setPaused(true); setTargetId(undefined); }}
    >
      <Form layout="vertical">
        <Form.Item label="每个对象复制份数">
          <InputNumber min={1} max={10} value={count} onChange={(v) => setCount(v || 1)} />
        </Form.Item>
        <Form.Item label="以暂停状态创建副本">
          <Switch checked={paused} onChange={setPaused} checkedChildren="是" unCheckedChildren="否" />
          {!paused && (
            <Typography.Paragraph type="warning" style={{ fontSize: 12, marginTop: 4 }}>
              副本将继承原对象状态，可能立即产生消耗
            </Typography.Paragraph>
          )}
        </Form.Item>
        {(level === 'adset' || level === 'ad') && (
          <Form.Item label={level === 'adset' ? '目标广告系列（默认保留原系列）' : '目标广告组（默认保留原组）'}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="保持原位置"
              value={targetId}
              onChange={setTargetId}
              options={targetOptions}
            />
          </Form.Item>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          复制广告系列/广告组时将同时复制其下层对象（深复制）。
        </Typography.Text>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 3: 编译验证**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/AdsManager/EditModal.tsx client/src/pages/AdsManager/CopyModal.tsx
git commit -m "feat(client): 广告管理编辑弹窗与复制弹窗组件"
```

---

### Task 7: 前端 — index.tsx 装配 + 删除旧文件

**Files:**
- Create: `client/src/pages/AdsManager/index.tsx`
- Delete: `client/src/pages/AdsManager.tsx`

注意：`App.tsx` 中 `import { AdsManager } from './pages/AdsManager'` 无需改动（目录 index 解析）。但旧文件与目录不能共存，本任务必须同时删旧建新。

- [ ] **Step 1: 删除 `client/src/pages/AdsManager.tsx`**

- [ ] **Step 2: 创建 `client/src/pages/AdsManager/index.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import {
  Alert, Button, DatePicker, Input, Space, Table, Tabs, Tag, Typography, message,
} from 'antd';
import { CloseOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import { useUIStore } from '../../store/uiStore';
import { Level, useAdsManagerStore } from '../../store/adsManagerStore';
import { useColumnOrderStore } from '../../store/columnOrderStore';
import { applyColumnOrder } from '../../utils/columnOrder';
import { ColumnOrderSettings } from '../../components/AdsManager/ColumnOrderSettings';
import { EmptyState } from '../../components/Common/EmptyState';
import { useHierarchy } from './useHierarchy';
import { adsetIdOf, campaignIdOf, filterHierarchy } from './helpers';
import { buildAdColumns, buildAdsetColumns, buildCampaignColumns } from './columns';
import { EditModal, EditTarget } from './EditModal';
import { CopyModal, CopyOptions, CopyTarget } from './CopyModal';
import { BulkActionBar } from './BulkActionBar';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const COPY_ENDPOINT: Record<Level, string> = {
  campaign: '/campaigns', adset: '/adsets', ad: '/ads',
};
const PUT_ENDPOINT: Record<Level, string> = {
  campaign: '/campaigns', adset: '/adsets', ad: '/ads',
};

export const AdsManager: React.FC = () => {
  const { accountId } = useAccountStore();
  const { dateRange, setDateRange } = useUIStore();
  const { activeTab, selected, setActiveTab, setSelected, clearSelected } = useAdsManagerStore();
  const columnOrders = useColumnOrderStore((s) => s.orders);
  const { campaigns, adsets, ads, loading, syncMeta, reload, refresh } = useHierarchy();

  const [searchAdId, setSearchAdId] = useState('');
  const [searchName, setSearchName] = useState('');
  const [editingBudget, setEditingBudget] = useState<{ id: string; type: string } | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [copySubmitting, setCopySubmitting] = useState(false);

  // --- 搜索过滤 ---
  const filtered = useMemo(
    () => filterHierarchy(campaigns, adsets, ads, searchAdId, searchName),
    [campaigns, adsets, ads, searchAdId, searchName],
  );
  const searchActive = !!(searchAdId.trim() || searchName.trim());

  // --- 勾选联动筛选（FB 风格）---
  const selCampaigns = selected.campaign;
  const selAdsets = selected.adset;

  const tabCampaigns = useMemo(
    () => [...filtered.campaigns].sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0)),
    [filtered.campaigns],
  );
  const tabAdsets = useMemo(
    () => (selCampaigns.length
      ? filtered.adsets.filter((a) => selCampaigns.includes(campaignIdOf(a)))
      : filtered.adsets),
    [filtered.adsets, selCampaigns],
  );
  const tabAds = useMemo(() => {
    if (selAdsets.length) return filtered.ads.filter((a) => selAdsets.includes(adsetIdOf(a)));
    if (selCampaigns.length) return filtered.ads.filter((a) => selCampaigns.includes(campaignIdOf(a)));
    return filtered.ads;
  }, [filtered.ads, selAdsets, selCampaigns]);

  // --- 操作 ---
  const handleToggleStatus = async (level: Level, id: string, current: string) => {
    const newStatus = current === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await api.put(`${PUT_ENDPOINT[level]}/${id}`, { status: newStatus });
      message.success(newStatus === 'ACTIVE' ? '已开启' : '已暂停');
      reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '操作失败');
    }
  };

  const handleRename = async (level: Level, id: string, name: string) => {
    try {
      await api.put(`${PUT_ENDPOINT[level]}/${id}`, { name });
      message.success('名称已更新');
      reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '重命名失败');
      throw err;
    }
  };

  const handleUpdateBudget = async (type: 'campaign' | 'adset', id: string, budgetCents: number) => {
    try {
      await api.put(`${PUT_ENDPOINT[type]}/${id}`, { budget: { daily: budgetCents } });
      message.success('预算已更新');
      reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '预算更新失败');
    }
    setEditingBudget(null);
  };

  const handleBulkStatus = async (status: 'ACTIVE' | 'PAUSED') => {
    const ids = selected[activeTab];
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      const resp = await api.post('/bulk/status', { level: activeTab, ids, status });
      const { succeeded, failed } = resp.data;
      if (failed.length === 0) {
        message.success(`已${status === 'ACTIVE' ? '开启' : '暂停'} ${succeeded.length} 项`);
      } else {
        message.warning(
          `成功 ${succeeded.length} 项，失败 ${failed.length} 项：${failed[0].error}`,
        );
      }
      reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '批量操作失败');
    }
    setBulkLoading(false);
  };

  const openCopy = (level: Level, records: any[]) => {
    if (records.length === 0) return;
    setCopyTarget({ level, records });
  };

  const handleCopySubmit = async (opts: CopyOptions) => {
    if (!copyTarget) return;
    setCopySubmitting(true);
    const { level, records } = copyTarget;
    let ok = 0;
    let firstError = '';
    for (const r of records) {
      try {
        const body: Record<string, any> = { count: opts.count, statusOption: opts.statusOption };
        if (level === 'adset' && opts.targetId) body.targetCampaignId = opts.targetId;
        if (level === 'ad' && opts.targetId) body.targetAdsetId = opts.targetId;
        await api.post(`${COPY_ENDPOINT[level]}/${r.id}/copy`, body);
        ok++;
      } catch (err: any) {
        if (!firstError) firstError = err?.response?.data?.error || '复制失败';
      }
    }
    setCopySubmitting(false);
    setCopyTarget(null);
    if (ok === records.length) message.success(`已复制 ${ok} 项，正在同步结构...`);
    else message.warning(`成功 ${ok}/${records.length} 项：${firstError}`);
    // 复制结果需从 FB 拉取结构才能入库展示
    refresh();
  };

  // --- 列与表格 ---
  const columnsCtx = {
    allAds: filtered.ads,
    editingBudget,
    setEditingBudget,
    onUpdateBudget: handleUpdateBudget,
    onToggleStatus: handleToggleStatus,
    onRename: handleRename,
    onCopy: (level: Level, record: any) => openCopy(level, [record]),
    onEdit: (level: Level, record: any) => setEditTarget({ level, record, parentId: null }),
    onCreateChild: (level: 'adset' | 'ad', parentId: string) =>
      setEditTarget({ level, record: null, parentId }),
  };

  const campaignColumns = useMemo(
    () => applyColumnOrder(buildCampaignColumns(columnsCtx), columnOrders.campaign),
    [filtered.ads, editingBudget, columnOrders.campaign],
  );
  const adsetColumns = useMemo(
    () => applyColumnOrder(buildAdsetColumns(columnsCtx), columnOrders.adset),
    [filtered.ads, editingBudget, columnOrders.adset],
  );
  const adColumns = useMemo(
    () => applyColumnOrder(buildAdColumns(columnsCtx), columnOrders.ad),
    [filtered.ads, editingBudget, columnOrders.ad],
  );

  const dataOfTab: Record<Level, any[]> = { campaign: tabCampaigns, adset: tabAdsets, ad: tabAds };
  const recordsOfSelected = (level: Level) =>
    dataOfTab[level].filter((r) => selected[level].includes(r.id));

  const renderTable = (level: Level, columns: any[], data: any[]) => (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="id"
      loading={loading}
      size="middle"
      scroll={{ x: 1800 }}
      rowSelection={{
        selectedRowKeys: selected[level],
        onChange: (keys) => setSelected(level, keys as string[]),
      }}
      rowClassName={(record: any) =>
        level === 'ad' && record.utmMatched === false && Number(record.spend) > 0
          ? 'utm-unmatched-row' : ''
      }
      locale={{
        emptyText: level === 'campaign'
          ? <EmptyState title="暂无广告系列" description="点击右上角创建" actionText="创建"
              onAction={() => setEditTarget({ level: 'campaign', record: null, parentId: null })} />
          : '暂无数据',
      }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
    />
  );

  // --- 联动筛选提示条 ---
  const filterChips: { label: string; clear: () => void }[] = [];
  if (activeTab !== 'campaign' && selCampaigns.length > 0) {
    filterChips.push({
      label: `已筛选：${selCampaigns.length} 个广告系列`,
      clear: () => clearSelected('campaign'),
    });
  }
  if (activeTab === 'ad' && selAdsets.length > 0) {
    filterChips.push({
      label: `已筛选：${selAdsets.length} 个广告组`,
      clear: () => clearSelected('adset'),
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>📢 广告管理</Title>
        <Space>
          {syncMeta?.refreshing && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>同步中…</Typography.Text>
          )}
          {syncMeta?.spendSummary && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              今日花费 ${syncMeta.spendSummary.totalSpend.toFixed(2)}
              （{syncMeta.spendSummary.adsWithSpend}/{syncMeta.spendSummary.totalAds} 条广告有消耗
              ，{syncMeta.spendSummary.campaignsWithSpend} 个系列）
            </Typography.Text>
          )}
          {syncMeta?.metricsSyncedAt && !syncMeta.refreshing && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              FB {new Date(syncMeta.metricsSyncedAt).toLocaleTimeString()}
              {syncMeta.utmSyncedAt ? ` · UTM ${new Date(syncMeta.utmSyncedAt).toLocaleTimeString()}` : ''}
              {syncMeta.structureSyncedAt ? ` · 结构 ${new Date(syncMeta.structureSyncedAt).toLocaleTimeString()}` : ''}
            </Typography.Text>
          )}
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>刷新</Button>
          <ColumnOrderSettings />
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => setEditTarget({ level: 'campaign', record: null, parentId: null })}>
            创建广告系列
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <RangePicker
          value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
          onChange={(dates) => {
            if (dates?.[0] && dates?.[1]) {
              setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
            }
          }}
          allowClear={false}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>时区 UTC+8</Typography.Text>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="搜索广告编号（精确匹配）"
          value={searchAdId}
          onChange={(e) => setSearchAdId(e.target.value)}
          style={{ width: 260 }}
        />
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="模糊搜索系列 / 广告组 / 广告名称"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          style={{ width: 320 }}
        />
        {searchActive && (
          <Typography.Text type="secondary" style={{ lineHeight: '32px' }}>
            匹配 {filtered.campaigns.length} 个系列 / {filtered.adsets.length} 个广告组 / {filtered.ads.length} 条广告
          </Typography.Text>
        )}
      </div>

      {syncMeta?.syncWarnings && syncMeta.syncWarnings.length > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }} message="数据同步提示"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {syncMeta.syncWarnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          }
        />
      )}

      {filterChips.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {filterChips.map((chip) => (
            <Tag key={chip.label} closable closeIcon={<CloseOutlined />} onClose={chip.clear} color="blue">
              {chip.label}
            </Tag>
          ))}
        </div>
      )}

      <BulkActionBar
        count={selected[activeTab].length}
        loading={bulkLoading}
        onEnable={() => handleBulkStatus('ACTIVE')}
        onPause={() => handleBulkStatus('PAUSED')}
        onCopy={() => openCopy(activeTab, recordsOfSelected(activeTab))}
        onClear={() => clearSelected(activeTab)}
      />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as Level)}
        items={[
          {
            key: 'campaign',
            label: `广告系列 (${tabCampaigns.length})`,
            children: renderTable('campaign', campaignColumns, tabCampaigns),
          },
          {
            key: 'adset',
            label: `广告组 (${tabAdsets.length})`,
            children: renderTable('adset', adsetColumns, tabAdsets),
          },
          {
            key: 'ad',
            label: `广告 (${tabAds.length})`,
            children: renderTable('ad', adColumns, tabAds),
          },
        ]}
      />

      <EditModal
        target={editTarget}
        accountId={accountId}
        onClose={() => setEditTarget(null)}
        onDone={reload}
      />
      <CopyModal
        target={copyTarget}
        campaigns={campaigns}
        adsets={adsets}
        submitting={copySubmitting}
        onCancel={() => setCopyTarget(null)}
        onSubmit={handleCopySubmit}
      />
    </div>
  );
};
```

- [ ] **Step 3: 编译验证**

Run: `cd /root/fb_auto_analytics/client && npm run build`
Expected: 退出码 0。若报 `FBAdSet`/`FBAd` 等旧导入残留错误，按报错移除无用导入。

- [ ] **Step 4: Commit**

```bash
git add -A client/src/pages/AdsManager.tsx client/src/pages/AdsManager/
git commit -m "feat(client): 广告管理改为 FB 风格三层 Tab + 联动筛选 + 批量操作 + 复制"
```

---

### Task 8: 浏览器实测（阶段一验收）

前置：`server`（`npm run dev`）与 `client`（`npm run dev`）运行中，使用真实账户登录。

- [ ] **Step 1: 核对清单**

1. 三个 Tab 计数正确；切换 Tab 数据正确
2. 系列 Tab 勾选 2 个系列 → 切到广告组/广告 Tab 只显示所属数据，出现"已筛选"Tag，点 ✕ 恢复全量
3. 勾选若干行 → 批量操作条出现；批量暂停 → 状态变更、提示成功数；批量开启同理
4. hover 名称出现 重命名/复制 图标；行内重命名回车保存生效
5. 单行复制（系列）→ 弹窗 → 复制 1 份暂停状态 → 刷新同步后副本出现
6. 双击预算单元格编辑生效（系列/组）
7. 搜索广告编号/名称过滤正常；列顺序设置仍生效；UTM 未匹配行标红
8. 编辑弹窗、+广告组/+广告 创建弹窗工作正常

- [ ] **Step 2: 发现问题则修复后重测，全部通过即阶段一完成**
