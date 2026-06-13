import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/permission';
import { AdSyncService } from '../services/adSyncService';
import { ShopTokenService } from '../services/shopTokenService';
import { UtmMatchService } from '../services/utmMatchService';
import { HierarchyService } from '../services/hierarchyService';
import { DashboardService } from '../services/dashboardService';
import { enqueueRefresh, enqueueShopUtmSync } from '../services/syncSchedulerService';
import { touchActiveSync } from '../services/activeSyncRegistry';
import { todayDateRange } from '../utils/todayRange';
import {
  deleteAccountShopMapping,
  listAccountShopMappings,
  upsertAccountShopMapping,
} from '../models/accountShopMapping';

export const analyticsRouter = Router();
analyticsRouter.use(authMiddleware);

const shopTokenService = new ShopTokenService();
const hierarchyService = new HierarchyService();
const dashboardService = new DashboardService();

function defaultDateRange() {
  return todayDateRange();
}

async function resolveShopId(input: {
  accountId: string;
  accountName?: string;
  shopId?: string;
  shopDomain?: string;
}): Promise<string | undefined> {
  try {
    const shop = await shopTokenService.resolveShop(input);
    return shop.shopId;
  } catch {
    return undefined;
  }
}

/** 浏览即热：标记活跃 + 触发 TTL 门控的后台同步（FB 指标/结构 + UTM），不阻塞响应 */
function enqueueHotRefresh(input: {
  accountId: string;
  accountName?: string;
  dateStart: string;
  dateEnd: string;
  shopId?: string;
  shopDomain?: string;
}): void {
  try {
    touchActiveSync(input.accountId, input.shopId);
    void enqueueRefresh({
      accountId: input.accountId,
      accountName: input.accountName,
      dateStart: input.dateStart,
      dateEnd: input.dateEnd,
      shopId: input.shopId,
      shopDomain: input.shopDomain,
    });
    if (input.shopId) {
      void shopTokenService
        .resolveShop({
          accountId: input.accountId,
          accountName: input.accountName,
          shopId: input.shopId,
          shopDomain: input.shopDomain,
        })
        .then((shop) => enqueueShopUtmSync(shop, input.dateStart, input.dateEnd))
        .catch(() => {});
    }
  } catch {
    // 热同步失败不影响读库响应
  }
}

// GET /api/analytics/hierarchy — DB-First 立即返回；同时标记账户活跃并触发 TTL 门控的后台热同步
analyticsRouter.get('/hierarchy', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, accountName, dateStart, dateEnd, shopId, shopDomain, breakdown } = req.query;
    if (!accountId) {
      res.status(400).json({ error: '缺少 accountId' });
      return;
    }

    const range = dateStart && dateEnd
      ? { dateStart: dateStart as string, dateEnd: dateEnd as string }
      : defaultDateRange();

    const resolvedShopId = (shopId as string) || await resolveShopId({
      accountId: accountId as string,
      accountName: accountName as string | undefined,
      shopDomain: shopDomain as string | undefined,
    });

    enqueueHotRefresh({
      accountId: accountId as string,
      accountName: accountName as string | undefined,
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      shopId: resolvedShopId,
      shopDomain: shopDomain as string | undefined,
    });

    const result = await hierarchyService.getHierarchyFromDb(
      accountId as string,
      range.dateStart,
      range.dateEnd,
      resolvedShopId,
      breakdown as string | undefined
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/dashboard — DB-First 仪表盘（FB + UTM）；浏览即触发后台热同步
analyticsRouter.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, accountName, dateStart, dateEnd } = req.query;
    if (!accountId) {
      res.status(400).json({ error: '缺少 accountId' });
      return;
    }
    const range = dateStart && dateEnd
      ? { dateStart: dateStart as string, dateEnd: dateEnd as string }
      : defaultDateRange();

    const resolvedShopId = await resolveShopId({
      accountId: accountId as string,
      accountName: accountName as string | undefined,
    });
    enqueueHotRefresh({
      accountId: accountId as string,
      accountName: accountName as string | undefined,
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      shopId: resolvedShopId,
    });

    const result = await dashboardService.getDashboard(
      accountId as string,
      range.dateStart,
      range.dateEnd,
      accountName as string | undefined
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/cross-account — 跨账户汇总（DB-First）
analyticsRouter.get('/cross-account', async (req: AuthRequest, res: Response) => {
  try {
    const { dateStart, dateEnd } = req.query;
    const range = dateStart && dateEnd
      ? { dateStart: dateStart as string, dateEnd: dateEnd as string }
      : defaultDateRange();

    const isAdminAllAccess =
      req.userRole === 'admin' &&
      (!req.userAllowedAccounts || req.userAllowedAccounts.length === 0);
    const allowedAccountIds = isAdminAllAccess
      ? undefined
      : (req.userAllowedAccounts || []).map((id) => id.replace(/^act_/, ''));

    const result = await dashboardService.getCrossAccountSummary(
      range.dateStart,
      range.dateEnd,
      allowedAccountIds
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/refresh — 立即返回 DB 数据，后台按 TTL 同步
analyticsRouter.post('/refresh', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, accountName, dateStart, dateEnd, shopId, shopDomain, force, breakdown } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '缺少 accountId' });
      return;
    }

    const range = dateStart && dateEnd
      ? { dateStart, dateEnd }
      : defaultDateRange();

    const resolvedShopId = shopId || await resolveShopId({
      accountId,
      accountName,
      shopDomain,
    });

    touchActiveSync(accountId, resolvedShopId);

    enqueueRefresh({
      accountId,
      accountName,
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      accessToken: req.accessToken!,
      shopId: resolvedShopId,
      shopDomain,
      force: !!force,
    });

    if (resolvedShopId) {
      try {
        const shop = await shopTokenService.resolveShop({
          accountId,
          accountName,
          shopId: resolvedShopId,
          shopDomain,
        });
        enqueueShopUtmSync(shop, range.dateStart, range.dateEnd, !!force);
      } catch {
        // 无映射店铺时仅同步 FB
      }
    }

    const result = await hierarchyService.getHierarchyFromDb(
      accountId,
      range.dateStart,
      range.dateEnd,
      resolvedShopId,
      breakdown
    );

    res.json({ ...result, refreshEnqueued: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/sync — 兼容旧接口，行为同 refresh
analyticsRouter.post('/sync', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, accountName, dateStart, dateEnd, shopId, shopDomain } = req.body;
    if (!accountId) {
      res.status(400).json({ error: '缺少 accountId' });
      return;
    }

    const range = dateStart && dateEnd
      ? { dateStart, dateEnd }
      : defaultDateRange();

    const resolvedShopId = shopId || await resolveShopId({
      accountId,
      accountName,
      shopDomain,
    });

    touchActiveSync(accountId, resolvedShopId);

    enqueueRefresh({
      accountId,
      accountName,
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      accessToken: req.accessToken!,
      shopId: resolvedShopId,
      shopDomain,
      force: true,
    });

    if (resolvedShopId) {
      try {
        const shop = await shopTokenService.resolveShop({
          accountId,
          accountName,
          shopId: resolvedShopId,
          shopDomain,
        });
        enqueueShopUtmSync(shop, range.dateStart, range.dateEnd, true);
      } catch {
        // 无映射店铺时仅同步 FB
      }
    }

    const result = await hierarchyService.getHierarchyFromDb(
      accountId,
      range.dateStart,
      range.dateEnd,
      resolvedShopId
    );

    res.json({
      matched: result.meta.matched,
      shop: resolvedShopId ? { shopId: resolvedShopId } : null,
      hierarchy: result,
      refreshEnqueued: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/matched — 查询 ad_id=utm_content 匹配结果
analyticsRouter.get('/matched', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, accountName, dateStart, dateEnd, shopId, shopDomain } = req.query;
    if (!accountId || !dateStart || !dateEnd) {
      res.status(400).json({ error: '缺少 accountId / dateStart / dateEnd' });
      return;
    }

    const resolvedShopId = (shopId as string) || await resolveShopId({
      accountId: accountId as string,
      accountName: accountName as string | undefined,
      shopDomain: shopDomain as string | undefined,
    });

    const utmMatch = new UtmMatchService();
    const result = await utmMatch.getMatchedAds(
      accountId as string,
      dateStart as string,
      dateEnd as string,
      resolvedShopId
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/sync-facebook — 仅同步 FB 指标（1 次 insights）
analyticsRouter.post('/sync-facebook', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, dateStart, dateEnd } = req.body;
    if (!accountId || !dateStart || !dateEnd) {
      res.status(400).json({ error: '缺少 accountId / dateStart / dateEnd' });
      return;
    }

    const { MetricsSyncService } = await import('../services/metricsSyncService');
    const metricsSync = new MetricsSyncService(req.accessToken!);
    const result = await metricsSync.syncMetrics(accountId, dateStart, dateEnd);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/sync-utm — 仅同步 Shoplazza UTM 数据
analyticsRouter.post('/sync-utm', async (req: AuthRequest, res: Response) => {
  try {
    const { dateStart, dateEnd, shopId, shopDomain, accountId, accountName } = req.body;
    if (!dateStart || !dateEnd) {
      res.status(400).json({ error: '缺少 dateStart / dateEnd' });
      return;
    }

    const shop = await shopTokenService.resolveShop({ shopId, shopDomain, accountId, accountName });
    const utmMatch = new UtmMatchService();
    const result = await utmMatch.syncShoplazzaUtm(shop, dateStart, dateEnd, accountId);
    res.json({
      shop: { shopId: shop.shopId, shopDomain: shop.shopDomain, name: shop.name },
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/shop-mappings — 账户-店铺映射列表
analyticsRouter.get('/shop-mappings', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await listAccountShopMappings();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/shop-mappings — 新增/更新映射
analyticsRouter.post('/shop-mappings', async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, accountName, shopId, shopDomain, shopName } = req.body;
    if (!accountId || !shopId || !shopDomain) {
      res.status(400).json({ error: '缺少 accountId / shopId / shopDomain' });
      return;
    }
    const row = await upsertAccountShopMapping({
      accountId,
      accountName,
      shopId,
      shopDomain,
      shopName,
    });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/analytics/shop-mappings/:id — 删除映射
analyticsRouter.delete('/shop-mappings/:id', async (req: AuthRequest, res: Response) => {
  try {
    const ok = await deleteAccountShopMapping(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '映射不存在' });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/shops — 列出已配置且启用的店铺
analyticsRouter.get('/shops', async (_req: AuthRequest, res: Response) => {
  try {
    const { getActiveShopCredentials } = await import('../models/shopCredential');
    const shops = await getActiveShopCredentials();
    res.json(
      shops.map((s) => ({
        shopId: s.shopId,
        shopDomain: s.shopDomain,
        name: s.name,
      }))
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/shop-tokens — 店铺 Token 列表（脱敏）
analyticsRouter.get('/shop-tokens', async (_req: AuthRequest, res: Response) => {
  try {
    const { listShopTokens } = await import('../models/shopToken');
    const rows = await listShopTokens();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/shop-tokens — 新增/更新店铺 Token
analyticsRouter.post('/shop-tokens', async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, shopDomain, shopName, accessToken, isActive } = req.body;
    if (!shopId || !shopDomain) {
      res.status(400).json({ error: '缺少 shopId / shopDomain' });
      return;
    }
    const { upsertShopToken } = await import('../models/shopToken');
    const row = await upsertShopToken({
      shopId: String(shopId),
      shopDomain,
      shopName,
      accessToken,
      isActive,
    });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/shop-tokens/:id/test — 测试 Token 是否可用（拉取今日 UTM）
analyticsRouter.post('/shop-tokens/:id/test', async (req: AuthRequest, res: Response) => {
  try {
    const { getShopTokenRecordById } = await import('../models/shopToken');
    const { ShoplazzaClient } = await import('../services/shoplazzaClient');
    const { todayDateRange } = await import('../utils/todayRange');

    const row = await getShopTokenRecordById(req.params.id);
    if (!row) {
      res.status(404).json({ error: '记录不存在' });
      return;
    }

    const { dateStart, dateEnd } = todayDateRange();
    const shop = {
      shopId: row.shop_id,
      shopDomain: row.shop_domain,
      name: row.shop_name || row.shop_domain,
      accessToken: row.access_token,
    };

    const utmRows = await ShoplazzaClient.getInstance().fetchUtmContent(
      shop,
      dateStart,
      dateEnd
    );

    res.json({
      ok: true,
      shopDomain: row.shop_domain,
      dateStart,
      dateEnd,
      utmRows: utmRows.length,
    });
  } catch (err: any) {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err.message;
    res.status(500).json({ error: String(msg) });
  }
});

// DELETE /api/analytics/shop-tokens/:id — 删除店铺 Token
analyticsRouter.delete('/shop-tokens/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { deleteShopToken } = await import('../models/shopToken');
    const ok = await deleteShopToken(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '记录不存在' });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SPU TOP 榜（所有登录用户可读；管理员可写） ---

// GET /api/analytics/spu-top/collections
analyticsRouter.get('/spu-top/collections', async (req: AuthRequest, res: Response) => {
  try {
    const { shopId } = req.query;
    if (!shopId) {
      res.status(400).json({ error: '缺少 shopId' });
      return;
    }
    const { fetchSpuTopCollections } = await import('../services/spuTopApiService');
    const result = await fetchSpuTopCollections(String(shopId));
    if ('error' in result && result.status) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/spu-top
analyticsRouter.get('/spu-top', async (req: AuthRequest, res: Response) => {
  try {
    const { date, shopId, collectionId } = req.query;
    const { fetchSpuTopBoard } = await import('../services/spuTopApiService');
    const result = await fetchSpuTopBoard({
      date: date as string | undefined,
      shopId: shopId as string | undefined,
      collectionId: collectionId as string | undefined,
    });
    if ('error' in result && result.status) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/spu-top/column-order — 全员读取表头列顺序
analyticsRouter.get('/spu-top/column-order', async (_req: AuthRequest, res: Response) => {
  try {
    const { getSpuTopColumnOrderMeta } = await import('../models/spuTopColumnOrder');
    const meta = await getSpuTopColumnOrderMeta();
    const { DEFAULT_SPU_TOP_COLUMN_ORDER } = await import('../utils/spuTopColumnOrder');
    res.json({
      columnOrder: meta?.column_order ?? [...DEFAULT_SPU_TOP_COLUMN_ORDER],
      updatedAt: meta?.updated_at ?? null,
      updatedBy: meta?.updated_by ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/analytics/spu-top/column-order — 管理员保存表头列顺序（全员生效）
analyticsRouter.put('/spu-top/column-order', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { columnOrder } = req.body || {};
    const { validateColumnOrder } = await import('../utils/spuTopColumnOrder');
    const { saveSpuTopColumnOrder } = await import('../models/spuTopColumnOrder');
    const validated = validateColumnOrder(columnOrder);
    if (!validated) {
      res.status(400).json({ error: '无效的 columnOrder' });
      return;
    }
    const saved = await saveSpuTopColumnOrder(validated, req.userId);
    res.json({ columnOrder: saved, updatedAt: new Date().toISOString(), updatedBy: req.userId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/analytics/spu-top/reorder — 管理员拖拽排序
analyticsRouter.put('/spu-top/reorder', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { shopId, date, collectionId, orderedIds } = req.body || {};
    if (!shopId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      res.status(400).json({ error: '缺少 shopId 或 orderedIds' });
      return;
    }
    const statDate = date || todayDateRange().dateStart;
    const collId = collectionId ? String(collectionId) : '';
    const { reorderShopSpuTop } = await import('../models/shoplazzaSpuTop');
    await reorderShopSpuTop(String(shopId), statDate, collId, orderedIds.map(String));
    res.json({ ok: true, shopId, statDate, collectionId: collId || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/spu-top/reset-order — 清除手动排序并按综合分重新同步（管理员）
analyticsRouter.post('/spu-top/reset-order', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { date, shopId, collectionId } = req.body || {};
    const statDate = date || todayDateRange().dateStart;
    const collId = collectionId ? String(collectionId) : '';
    const { clearManualOrder, clearAllManualOrders } = await import('../models/shoplazzaSpuTop');
    const { spuTopSyncService } = await import('../services/spuTopSyncService');
    const { getActiveShopCredentials, getShopCredentialById } = await import('../models/shopCredential');

    if (shopId) {
      await clearManualOrder(String(shopId), statDate, collId);
      const shop = await getShopCredentialById(String(shopId));
      if (!shop) {
        res.status(404).json({ error: '店铺不存在' });
        return;
      }
      await spuTopSyncService.syncShopSpuTop(shop, statDate, collId, collId || undefined);
      res.json({ ok: true, statDate, shopId, collectionId: collId || null, cleared: 1 });
      return;
    }

    const cleared = await clearAllManualOrders(statDate);
    const syncResult = await spuTopSyncService.syncAllShopsSpuTop(statDate);
    res.json({ ok: true, statDate, collectionId: collId || null, cleared, sync: syncResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/spu-top/refresh — 手动触发全店同步（管理员）
analyticsRouter.post('/spu-top/refresh', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.body || {};
    const { spuTopSyncService } = await import('../services/spuTopSyncService');
    const statDate = date || todayDateRange().dateStart;
    const result = await spuTopSyncService.syncAllShopsSpuTop(statDate);
    res.json({ statDate, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
