import axios, { AxiosInstance } from 'axios';
const { HttpsProxyAgent } = require('https-proxy-agent');
import { config } from '../config';
import { ShopCredential } from '../models/shopCredential';
import { withShoplazzaRetry } from '../utils/shoplazzaRetry';
import { todayDateString } from '../utils/todayRange';
import { calcAddToCartRate, calcTransformRate } from '../utils/spuMetrics';

export interface ShoplazzaUtmRow {
  utmValue: string;
  uv: number;
  pv: number;
  addToCart: number;
  beginCheckout: number;
  orders: number;
  sales: number;
  escapeRate: number;
}

export interface ShoplazzaSpuTopRow {
  rank: number;
  spu: string;
  productId: string;
  title: string;
  imageUrl: string;
  productCreatedAt: string | null;
  orderCount: number;
  addCartUsers: number;
  viewUsers: number;
  addToCartRate: number;
  transformRate: number;
  compositeScore: number;
  /** 均价 = 总销售额 ÷ 销量，无法计算时为 undefined */
  price?: number;
  collectionNames: string[];
}

export interface ShoplazzaCollection {
  id: string;
  title: string;
}

export interface FetchSpuTopOptions {
  /** 专辑 ID（UUID） */
  collectionId?: string;
  /** 专辑名称关键词（Collections API 无权限时回退） */
  collectionKeyword?: string;
  limit?: number;
}

/** Shoplazza 商品图 CDN：cdn.shoplazza.com/{filename} */
export function buildProductImageUrl(_shopDomain: string, image: string, size = '200x200'): string {
  return normalizeProductImageUrl(image, size);
}

/** 入库用：仅保留 http(s) URL，拒绝 base64 */
export function toStorageImageUrl(image: string): string {
  return normalizeProductImageUrl(image, '');
}

export function normalizeProductImageUrl(image: string, size = '200x200'): string {
  if (!image) return '';

  let raw = image.trim();
  // 绝不处理/保存 base64
  if (/^data:/i.test(raw)) return '';

  if (raw.startsWith('//')) raw = `https:${raw}`;

  // 修正历史错误格式：https://{shop}/cdn/shop/files/{filename}
  const legacyMatch = raw.match(/\/cdn\/shop\/files\/([^/?#]+)/i);
  if (legacyMatch) raw = legacyMatch[1];

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    if (raw.includes('cdn.shoplazza.com') || raw.includes('img.staticdj.com')) {
      return appendImageSize(raw, size);
    }
    const name = raw.split('/').pop()?.split('?')[0] || '';
    if (name) return appendImageSize(`https://cdn.shoplazza.com/${name}`, size);
    return raw;
  }

  const filename = raw.replace(/^\//, '');
  return appendImageSize(`https://cdn.shoplazza.com/${filename}`, size);
}

function appendImageSize(url: string, size: string): string {
  if (!size) return url;
  const [base, query] = url.split('?');
  if (base.includes(`_${size}.`)) return url;
  const sized = base.replace(/(\.(jpe?g|png|webp|gif))$/i, `_${size}$1`);
  return query ? `${sized}?${query}` : sized;
}

type UtmFilterPrerequisite = 'includes' | 'equal_to' | 'not_equal_to';

interface UtmApiFilter {
  title: 'utm_content' | 'utm_campaign' | 'utm_source' | 'utm_medium' | 'utm_term';
  prerequisite: UtmFilterPrerequisite;
  values: string[];
}

function isShoplazzaSuccessCode(code: unknown): boolean {
  if (code === 0 || code === '0') return true;
  const s = String(code).toLowerCase();
  return s === 'success' || s === 'ok';
}

function createAxios(): AxiosInstance {
  const opts: Record<string, any> = {};
  if (config.facebook.proxy) {
    opts.httpsAgent = new HttpsProxyAgent(config.facebook.proxy);
  }
  return axios.create(opts);
}

export function buildShopApiBase(shopDomain: string): string {
  const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${domain}/openapi/${config.shoplazza.apiVersion}`;
}

/** Shoplazza UTM API 要求 unix 时间戳字符串（非 YYYY-MM-DD） */
export function toShoplazzaTimeRange(dateStart: string, dateEnd: string): {
  beginTime: string;
  endTime: string;
} {
  const tz = config.shoplazza.timeZone;
  const offset = tz >= 0 ? `+${String(tz).padStart(2, '0')}:00` : `${String(tz).padStart(3, '0')}:00`;
  const beginTime = String(
    Math.floor(new Date(`${dateStart}T00:00:00${offset}`).getTime() / 1000)
  );
  const endTime = String(
    Math.floor(new Date(`${dateEnd}T23:59:59${offset}`).getTime() / 1000)
  );
  return { beginTime, endTime };
}

export class ShoplazzaClient {
  private static instance: ShoplazzaClient;
  private axios: AxiosInstance;

  private constructor() {
    this.axios = createAxios();
  }

  static getInstance(): ShoplazzaClient {
    if (!ShoplazzaClient.instance) {
      ShoplazzaClient.instance = new ShoplazzaClient();
    }
    return ShoplazzaClient.instance;
  }

  /**
   * 拉取 utm_content 维度报表。
   * @param filterAdIds 若传入广告 ID 列表，则使用 filters.prerequisite=includes 筛选
   */
  async fetchUtmContent(
    shop: ShopCredential,
    dateStart: string,
    dateEnd: string,
    filterAdIds?: string[]
  ): Promise<ShoplazzaUtmRow[]> {
    if (!shop.accessToken) {
      throw new Error(`店铺 ${shop.shopDomain} 缺少 access token`);
    }

    const adIds = (filterAdIds || []).map((id) => id.trim()).filter(Boolean);
    if (adIds.length > 0) {
      const chunks = this.chunkArray(adIds, 100);
      const merged = new Map<string, ShoplazzaUtmRow>();
      for (const chunk of chunks) {
        const rows = await this.fetchAllPages(shop, dateStart, dateEnd, [
          { title: 'utm_content', prerequisite: 'includes', values: chunk },
        ]);
        for (const row of this.aggregateByUtmContent(rows)) {
          this.mergeUtmRow(merged, row);
        }
      }
      return [...merged.values()];
    }

    const rows = await this.fetchAllPages(shop, dateStart, dateEnd);
    return this.aggregateByUtmContent(rows);
  }

  /** 拉取 utm_campaign 维度全量报表并入库 */
  async fetchUtmCampaign(
    shop: ShopCredential,
    dateStart: string,
    dateEnd: string
  ): Promise<ShoplazzaUtmRow[]> {
    if (!shop.accessToken) {
      throw new Error(`店铺 ${shop.shopDomain} 缺少 access token`);
    }
    const rows = await this.fetchAllPages(shop, dateStart, dateEnd);
    return this.aggregateByUtmCampaign(rows);
  }

  /** 拉取 SPU TOP 榜：先按订单量取候选池，再按综合分排序取 TOP N */
  async fetchSpuTop(
    shop: ShopCredential,
    dateStart: string,
    dateEnd: string,
    options: FetchSpuTopOptions = {}
  ): Promise<ShoplazzaSpuTopRow[]> {
    if (!shop.accessToken) {
      throw new Error(`店铺 ${shop.shopDomain} 缺少 access token`);
    }

    const { rankSpuTopRows, SPU_TOP_CANDIDATE_POOL } = await import('../utils/spuCompositeScore');
    const finalLimit = options.limit ?? 20;
    const candidateLimit = Math.max(finalLimit, SPU_TOP_CANDIDATE_POOL);
    const url = `${buildShopApiBase(shop.shopDomain)}/data-analysis/spu`;
    const { beginTime, endTime } = toShoplazzaTimeRange(dateStart, dateEnd);

    const body: Record<string, any> = {
      type: 'product',
      begin_time: beginTime,
      end_time: endTime,
      time_zone: config.shoplazza.timeZone,
      page_size: candidateLimit,
      sort_by: 'order_count',
      sort_direction: 'desc',
    };
    if (options.collectionId) {
      body.collection_id = options.collectionId;
    }
    if (options.collectionKeyword) {
      body.keyword = options.collectionKeyword;
    }

    const response = await withShoplazzaRetry(
      shop.shopDomain,
      () =>
        this.axios.post(url, body, {
          headers: {
            'access-token': shop.accessToken,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 60_000,
        })
    );

    const payload = response.data;
    if (payload?.code && !isShoplazzaSuccessCode(payload.code)) {
      throw new Error(payload.message || `Shoplazza SPU API 错误: ${payload.code}`);
    }

    const block = payload?.data;
    const list = Array.isArray(block?.data) ? block.data : Array.isArray(block) ? block : [];
    const parsed = list
      .slice(0, candidateLimit)
      .map((row: any, idx: number) => this.parseSpuRow(row, idx + 1, shop.shopDomain));
    return rankSpuTopRows(parsed, dateEnd, finalLimit);
  }

  /** 拉取店铺专辑列表；Collections API 403 时从 SPU 报表提取专辑名 */
  async fetchCollections(shop: ShopCredential, title?: string): Promise<ShoplazzaCollection[]> {
    try {
      return await this.fetchCollectionsFromApi(shop, title);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status !== 403 && status !== 404) throw err;
      return this.fetchCollectionsFromSpuReport(shop, title);
    }
  }

  private async fetchCollectionsFromApi(
    shop: ShopCredential,
    title?: string
  ): Promise<ShoplazzaCollection[]> {
    if (!shop.accessToken) {
      throw new Error(`店铺 ${shop.shopDomain} 缺少 access token`);
    }

    const all: ShoplazzaCollection[] = [];
    let cursor: string | undefined;
    const base = buildShopApiBase(shop.shopDomain);

    do {
      const params: Record<string, string | number> = { page_size: 100 };
      if (cursor) params.cursor = cursor;
      if (title) params.title = title;

      const response = await withShoplazzaRetry(
        shop.shopDomain,
        () =>
          this.axios.get(`${base}/collections`, {
            headers: {
              'access-token': shop.accessToken,
              Accept: 'application/json',
            },
            params,
            timeout: 60_000,
          })
      );

      const payload = response.data;
      if (payload?.code && !isShoplazzaSuccessCode(payload.code)) {
        throw new Error(payload.message || `Shoplazza Collections API 错误: ${payload.code}`);
      }

      const block = payload?.data ?? payload;
      const list = Array.isArray(block?.collections)
        ? block.collections
        : Array.isArray(block?.data)
          ? block.data
          : Array.isArray(block)
            ? block
            : [];

      for (const item of list) {
        const id = String(item.id ?? item.collection_id ?? '').trim();
        const t = String(item.title ?? '').trim();
        if (id && t) all.push({ id, title: t });
      }

      cursor = block?.has_more ? block.cursor : undefined;
    } while (cursor);

    return all;
  }

  /** 从 SPU 报表的 collection 字段提取专辑名（无 Collections API 权限时的回退） */
  private async fetchCollectionsFromSpuReport(
    shop: ShopCredential,
    title?: string
  ): Promise<ShoplazzaCollection[]> {
    const today = todayDateString();
    const { spuTopDateRange } = await import('../utils/todayRange');
    const { dateStart, dateEnd } = spuTopDateRange(today);
    const rows = await this.fetchSpuTop(shop, dateStart, dateEnd, { limit: 100 });
    const names = new Set<string>();
    for (const row of rows) {
      for (const name of row.collectionNames) {
        if (name) names.add(name);
      }
    }
    let list = [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    if (title) {
      const q = title.toLowerCase();
      list = list.filter((n) => n.toLowerCase().includes(q));
    }
    return list.map((name) => ({ id: name, title: name }));
  }

  /** @deprecated 保留兼容，内部转调 fetchUtmContent / fetchUtmCampaign */
  async fetchUtmByDimension(
    shop: ShopCredential,
    dimension: 'utm_content' | 'utm_campaign',
    dateStart: string,
    dateEnd: string,
    filterValues?: string[]
  ): Promise<ShoplazzaUtmRow[]> {
    if (dimension === 'utm_campaign') {
      return this.fetchUtmCampaign(shop, dateStart, dateEnd);
    }
    return this.fetchUtmContent(shop, dateStart, dateEnd, filterValues);
  }

  private async fetchAllPages(
    shop: ShopCredential,
    dateStart: string,
    dateEnd: string,
    filters?: UtmApiFilter[]
  ): Promise<any[]> {
    const url = `${buildShopApiBase(shop.shopDomain)}/data-analysis/utm`;
    const allRows: any[] = [];
    let cursor: string | undefined;

    const { beginTime, endTime } = toShoplazzaTimeRange(dateStart, dateEnd);

    do {
      const body: Record<string, any> = {
        begin_time: beginTime,
        end_time: endTime,
        time_zone: config.shoplazza.timeZone,
        page_size: 200,
        sort_by: 'product_sales',
        sort_direction: 'desc',
        date_by: '',
      };
      if (filters && filters.length > 0) {
        body.filters = filters;
      }
      if (cursor) {
        body.cursor = cursor;
      }

      const response = await withShoplazzaRetry(
        shop.shopDomain,
        () =>
          this.axios.post(url, body, {
            headers: {
              'access-token': shop.accessToken,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 60_000,
          })
      );

      const payload = response.data;
      if (payload?.code && !isShoplazzaSuccessCode(payload.code)) {
        throw new Error(payload.message || `Shoplazza API 错误: ${payload.code}`);
      }

      const block = payload?.data;
      const list = Array.isArray(block?.data) ? block.data : [];
      allRows.push(...list);

      cursor = block?.has_more ? block.cursor : undefined;
    } while (cursor);

    return allRows;
  }

  private aggregateByUtmContent(rows: any[]): ShoplazzaUtmRow[] {
    const map = new Map<string, ShoplazzaUtmRow>();
    for (const row of rows) {
      const parsed = this.parseUtmContentRow(row);
      if (!parsed) continue;
      this.mergeUtmRow(map, parsed);
    }
    return [...map.values()];
  }

  private aggregateByUtmCampaign(rows: any[]): ShoplazzaUtmRow[] {
    const map = new Map<string, ShoplazzaUtmRow>();
    for (const row of rows) {
      const parsed = this.parseUtmCampaignRow(row);
      if (!parsed) continue;
      this.mergeUtmRow(map, parsed);
    }
    return [...map.values()];
  }

  private mergeUtmRow(map: Map<string, ShoplazzaUtmRow>, row: ShoplazzaUtmRow) {
    const existing = map.get(row.utmValue);
    if (!existing) {
      map.set(row.utmValue, { ...row });
      return;
    }
    const prevUv = existing.uv;
    existing.uv += row.uv;
    existing.pv += row.pv;
    existing.addToCart += row.addToCart;
    existing.beginCheckout += row.beginCheckout;
    existing.orders += row.orders;
    existing.sales = Math.round((existing.sales + row.sales) * 100) / 100;
    if (existing.uv > 0) {
      const weighted = (existing.escapeRate || 0) * prevUv + row.escapeRate * row.uv;
      existing.escapeRate = Math.round((weighted / existing.uv) * 10000) / 10000;
    }
  }

  private parseUtmContentRow(row: any): ShoplazzaUtmRow | null {
    const utmValue = String(row.utm_content || '').trim();
    if (!utmValue || utmValue === '(not set)' || utmValue === 'not set') {
      return null;
    }
    return this.parseUtmMetricsRow(utmValue, row);
  }

  private parseUtmCampaignRow(row: any): ShoplazzaUtmRow | null {
    const utmValue = String(row.utm_campaign || '').trim();
    if (!utmValue || utmValue === '(not set)' || utmValue === 'not set') {
      return null;
    }
    return this.parseUtmMetricsRow(utmValue, row);
  }

  private parseUtmMetricsRow(utmValue: string, row: any): ShoplazzaUtmRow {
    const rawEscape = row.escape_rate ?? row.escape_rate_original;
    let escapeRate = this.toFloat(rawEscape);
    if (escapeRate > 0 && escapeRate <= 1) {
      escapeRate = Math.round(escapeRate * 10000) / 100;
    }
    return {
      utmValue,
      uv: this.toInt(row.view_client_count ?? row.uv),
      pv: this.toInt(row.page_views_total ?? row.pv),
      addToCart: this.toInt(row.add_to_cart_count ?? row.add_cart_uv),
      beginCheckout: this.toInt(row.begin_checkout_count ?? row.begin_checkout_uv),
      orders: this.toInt(row.orders_count ?? row.orders),
      sales: this.toFloat(row.product_sales ?? row.sales),
      escapeRate,
    };
  }

  private parseSpuRow(row: any, rank: number, shopDomain: string): ShoplazzaSpuTopRow {
    const imageRaw = row.image ?? row.image_url ?? row.product_image ?? '';
    const collectionRaw = String(row.collection ?? '');
    const collectionNames = collectionRaw
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const orderCount = this.toInt(row.order_count_original ?? row.order_count ?? row.orders_count);
    const addCartUsers = this.toInt(
      row.add_cart_client_count_original ?? row.add_cart_client_count ?? row.add_cart_uv
    );
    const viewUsers = this.toInt(row.view_client_count_original ?? row.view_client_count ?? row.uv);
    const price = this.resolveSpuPriceFromRow(row, orderCount);

    return {
      rank,
      spu: String(row.spu ?? row.product_spu ?? '').trim(),
      productId: String(row.product_id ?? row.id ?? '').trim(),
      title: String(row.title ?? row.product_title ?? '').trim(),
      imageUrl: toStorageImageUrl(String(imageRaw)),
      productCreatedAt: this.parseProductCreatedAt(row),
      orderCount,
      addCartUsers,
      viewUsers,
      addToCartRate: calcAddToCartRate(addCartUsers, viewUsers),
      transformRate: calcTransformRate(orderCount, viewUsers),
      compositeScore: 0,
      price,
      collectionNames,
    };
  }

  /** 均价 = 总销售额 ÷ 销量（sales_total / order_count） */
  private resolveSpuPriceFromRow(row: any, orderCount: number): number | undefined {
    if (orderCount <= 0) return undefined;

    const salesTotal = this.toFloat(row.sales_total_original ?? row.sales_total);
    if (salesTotal <= 0) return undefined;

    return Math.round((salesTotal / orderCount) * 100) / 100;
  }

  private parseProductCreatedAt(row: any): string | null {
    const raw = row.created_at ?? row.product_created_at ?? row.create_time;
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    return s || null;
  }

  private toRate(value: unknown): number {
    if (value == null || value === '') return 0;
    const s = String(value).replace(/%/g, '').trim();
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return 0;
    return n > 1 ? n / 100 : n;
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private toInt(value: unknown): number {
    const n = parseInt(String(value ?? '0'), 10);
    return Number.isFinite(n) ? n : 0;
  }

  private toFloat(value: unknown): number {
    const n = parseFloat(String(value ?? '0'));
    return Number.isFinite(n) ? n : 0;
  }
}
