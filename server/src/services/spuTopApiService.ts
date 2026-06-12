import { getActiveShopCredentials, getShopCredentialById } from '../models/shopCredential';
import {
  getAllShopsSpuTop,
  getShopSpuTop,
  getSpuTopLatestSyncedAt,
  getSpuTopSyncedAt,
  isManualOrder,
  isSpuTopSnapshotOutdated,
} from '../models/shoplazzaSpuTop';
import { spuTopSyncService } from './spuTopSyncService';
import { SPU_TOP_RANGE_DAYS, spuTopDateRange, todayDateRange } from '../utils/todayRange';
import { normalizeProductImageUrl } from './shoplazzaClient';
import { computeSpuCompositeScore } from '../utils/spuCompositeScore';
import { calcAddToCartRate, calcTransformRate } from '../utils/spuMetrics';

function mapSpuTopRecord(row: any, statDate: string) {
  const orderCount = Number(row.order_count) || 0;
  const addCartUsers = Number(row.add_cart_users) || 0;
  const viewUsers = Number(row.view_users) || 0;
  const productCreatedAt = row.product_created_at || null;
  const price = Number(row.price) || 0;
  const scoreDate = row.range_end || statDate;

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
    price,
    compositeScore: computeSpuCompositeScore({
      orderCount,
      addCartUsers,
      viewUsers,
      productCreatedAt,
      statDate: scoreDate,
      price,
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
  const { dateStart: rangeStart, dateEnd: rangeEnd } = spuTopDateRange(statDate);
  const collId = input.collectionId || '';
  const shouldSync = input.triggerSync !== false;

  const shops = input.shopId
    ? [await getShopCredentialById(input.shopId)].filter(Boolean)
    : await getActiveShopCredentials();

  if (shops.length === 0) {
    return { error: '无可用店铺', status: 404 as const };
  }

  if (shouldSync) {
    for (const shop of shops) {
      const syncedAt = await getSpuTopSyncedAt(statDate, shop!.shopId, collId);
      const existing =
        collId || input.shopId
          ? await getShopSpuTop(statDate, shop!.shopId, collId)
          : (await getAllShopsSpuTop(statDate, collId)).filter((r) => r.shop_id === shop!.shopId);

      if (
        spuTopSyncService.isStale(syncedAt) ||
        existing.length === 0 ||
        isSpuTopSnapshotOutdated(statDate, existing)
      ) {
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

  let storedRangeStart = rangeStart;
  let storedRangeEnd = rangeEnd;
  if (rows.length > 0) {
    storedRangeStart = rows[0].range_start || rangeStart;
    storedRangeEnd = rows[0].range_end || rangeEnd;
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
    rangeStart: storedRangeStart,
    rangeEnd: storedRangeEnd,
    rangeDays: SPU_TOP_RANGE_DAYS,
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
