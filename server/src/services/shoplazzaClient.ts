import axios, { AxiosInstance } from 'axios';
const { HttpsProxyAgent } = require('https-proxy-agent');
import { config } from '../config';
import { ShopCredential } from '../models/shopCredential';
import { withShoplazzaRetry } from '../utils/shoplazzaRetry';

export interface ShoplazzaUtmRow {
  utmValue: string;
  uv: number;
  pv: number;
  addToCart: number;
  beginCheckout: number;
  orders: number;
  sales: number;
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

  /** @deprecated 保留兼容，内部转调 fetchUtmContent */
  async fetchUtmByDimension(
    shop: ShopCredential,
    dimension: 'utm_content' | 'utm_campaign',
    dateStart: string,
    dateEnd: string,
    filterValues?: string[]
  ): Promise<ShoplazzaUtmRow[]> {
    if (dimension !== 'utm_content') {
      console.warn('[Shoplazza] 当前仅支持 utm_content 维度同步');
      return [];
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

  private mergeUtmRow(map: Map<string, ShoplazzaUtmRow>, row: ShoplazzaUtmRow) {
    const existing = map.get(row.utmValue);
    if (!existing) {
      map.set(row.utmValue, { ...row });
      return;
    }
    existing.uv += row.uv;
    existing.pv += row.pv;
    existing.addToCart += row.addToCart;
    existing.beginCheckout += row.beginCheckout;
    existing.orders += row.orders;
    existing.sales = Math.round((existing.sales + row.sales) * 100) / 100;
  }

  private parseUtmContentRow(row: any): ShoplazzaUtmRow | null {
    const utmValue = String(row.utm_content || '').trim();
    if (!utmValue || utmValue === '(not set)' || utmValue === 'not set') {
      return null;
    }
    return {
      utmValue,
      uv: this.toInt(row.view_client_count ?? row.uv),
      pv: this.toInt(row.page_views_total ?? row.pv),
      addToCart: this.toInt(row.add_to_cart_count ?? row.add_cart_uv),
      beginCheckout: this.toInt(row.begin_checkout_count ?? row.begin_checkout_uv),
      orders: this.toInt(row.orders_count ?? row.orders),
      sales: this.toFloat(row.product_sales ?? row.sales),
    };
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
