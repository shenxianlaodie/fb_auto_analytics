import { getActiveShopCredentials, getShopCredentialById } from '../models/shopCredential';
import {
  getAllShopsSpuTop,
  getShopSpuTop,
  getSpuTopLatestSyncedAt,
  getSpuTopSyncedAt,
  isManualOrder,
} from '../models/shoplazzaSpuTop';
import { spuTopSyncService } from './spuTopSyncService';
import { todayDateRange } from '../utils/todayRange';
import { normalizeProductImageUrl } from './shoplazzaClient';
import { computeSpuCompositeScore } from '../utils/spuCompositeScore';
import { calcAddToCartRate, calcTransformRate } from '../utils/spuMetrics';

function mapSpuTopRecord(row: any, statDate: string) {
  const orderCount = Number(row.order_count) || 0;
  const addCartUsers = Number(row.add_cart_users) || 0;
  const viewUsers = Number(row.view_users) || 0;
  const productCreatedAt = row.product_created_at || null;

  return {
    id: row.id,
    rank: row.rank,
    spu: row.spu,
    productId: row.product_id,
    title: row.title,
    imageUrl: normalizeProductImageUrl(row.image_url || ''),
    productCreatedAt,
    orderCount,
    addCartUsers,
    viewUsers,
    addToCartRate: calcAddToCartRate(addCartUsers, viewUsers),
    transformRate: calcTransformRate(orderCount, viewUsers),
    compositeScore: computeSpuCompositeScore({
      orderCount,
      addCartUsers,
      viewUsers,
      productCreatedAt,
      statDate,
    }),
  };
}

export async function fetchSpuTopBoard(input: {
  date?: string;
  shopId?: string;
  collectionId?: string;
  triggerSync?: boolean;
}) {
  const statDate = input.date || todayDateRange().dateStart;
  const collId = input.collectionId || '';
  const today = todayDateRange().dateStart;
  const shouldSync = input.triggerSync === true || (input.triggerSync !== false && statDate === today);

  const shops = input.shopId
    ? [await getShopCredentialById(input.shopId)].filter(Boolean)
    : await getActiveShopCredentials();

  if (shops.length === 0) {
    return { error: '无可用店铺', status: 404 as const };
  }

  if (shouldSync) {
    for (const shop of shops) {
      const syncedAt = await getSpuTopSyncedAt(statDate, shop!.shopId, collId);
      if (spuTopSyncService.isStale(syncedAt)) {
        // 后台异步同步，不阻塞页面读取
        spuTopSyncService
          .syncShopSpuTop(shop!, statDate, collId, collId || undefined)
          .catch((err: any) => {
            console.error(`[SpuTop] background sync failed ${shop!.shopDomain}:`, err.message);
          });
      }
    }
  }

  const rows = input.shopId
    ? await getShopSpuTop(statDate, input.shopId, collId)
    : await getAllShopsSpuTop(statDate, collId);

  const byShop = new Map<string, any>();
  for (const shop of shops) {
    const manualOrder = await isManualOrder(shop!.shopId, statDate, collId);
    byShop.set(shop!.shopId, {
      shopId: shop!.shopId,
      shopDomain: shop!.shopDomain,
      shopName: shop!.name,
      items: [] as any[],
      syncedAt: null as string | null,
      manualOrder,
    });
  }

  for (const row of rows) {
    const bucket = byShop.get(row.shop_id);
    if (bucket) bucket.items.push(mapSpuTopRecord(row, statDate));
  }

  for (const bucket of byShop.values()) {
    bucket.items.sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank);
  }

  for (const shop of shops) {
    const bucket = byShop.get(shop!.shopId);
    if (!bucket) continue;
    bucket.syncedAt = await getSpuTopSyncedAt(statDate, shop!.shopId, collId);
  }

  const latestSyncedAt = await getSpuTopLatestSyncedAt(statDate);

  return {
    statDate,
    collectionId: collId || null,
    latestSyncedAt,
    shops: [...byShop.values()],
  };
}

const collectionsCache = new Map<string, { at: number; data: Array<{ id: string; title: string }> }>();
const COLLECTIONS_CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchSpuTopCollections(shopId: string) {
  const cached = collectionsCache.get(shopId);
  if (cached && Date.now() - cached.at < COLLECTIONS_CACHE_TTL_MS) {
    return { shopId, collections: cached.data, cached: true };
  }

  const shop = await getShopCredentialById(shopId);
  if (!shop) {
    return { error: '店铺不存在或未启用', status: 404 as const };
  }

  const { ShoplazzaClient } = await import('./shoplazzaClient');
  const collections = await ShoplazzaClient.getInstance().fetchCollections(shop);
  collectionsCache.set(shopId, { at: Date.now(), data: collections });
  return { shopId, collections, cached: false };
}
