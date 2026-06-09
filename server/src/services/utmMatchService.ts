import { getFbAdsByDateRange } from '../models/fbAd';
import { ShopCredential } from '../models/shopCredential';
import {
  getShoplazzaUtmByDateRange,
  ShoplazzaUtmRecord,
  upsertShoplazzaUtm,
} from '../models/shoplazzaUtm';
import { adIdMatchesUtmContent, calcAov } from '../utils/adUtmMatch';
import { ShoplazzaClient } from './shoplazzaClient';

export interface UtmContentMetrics {
  utmContent: string;
  uv: number;
  addToCart: number;
  beginCheckout: number;
  orders: number;
  sales: number;
  aov: number;
}

export interface MatchedAdRecord {
  adId: string;
  adName: string | null;
  spend: number;
  budget: number;
  cpm: number;
  utm: UtmContentMetrics | null;
}

export class UtmMatchService {
  private shoplazzaClient: ShoplazzaClient;

  constructor() {
    this.shoplazzaClient = ShoplazzaClient.getInstance();
  }

  /** 始终全量拉取店铺 utm_content，入库后由读库按 ad_id 匹配 */
  async syncShoplazzaUtm(
    shop: ShopCredential,
    dateStart: string,
    dateEnd: string,
    _accountId?: string
  ): Promise<{
    shopId: string;
    shopDomain: string;
    utmContent: number;
  }> {
    const contentRows = await this.shoplazzaClient.fetchUtmContent(
      shop,
      dateStart,
      dateEnd
    );

    for (const row of contentRows) {
      await upsertShoplazzaUtm({
        shopId: shop.shopId,
        dimension: 'utm_content',
        utmValue: row.utmValue,
        uv: row.uv,
        pv: row.pv,
        addToCart: row.addToCart,
        beginCheckout: row.beginCheckout,
        orders: row.orders,
        sales: row.sales,
        dateStart,
        dateEnd,
      });
    }

    const campaignRows = await this.shoplazzaClient.fetchUtmCampaign(
      shop,
      dateStart,
      dateEnd
    );

    for (const row of campaignRows) {
      await upsertShoplazzaUtm({
        shopId: shop.shopId,
        dimension: 'utm_campaign',
        utmValue: row.utmValue,
        uv: row.uv,
        pv: row.pv,
        addToCart: row.addToCart,
        beginCheckout: row.beginCheckout,
        orders: row.orders,
        sales: row.sales,
        dateStart,
        dateEnd,
      });
    }

    console.log(
      `[UTM] shop=${shop.shopDomain} utm_content=${contentRows.length} utm_campaign=${campaignRows.length}`
    );

    return {
      shopId: shop.shopId,
      shopDomain: shop.shopDomain,
      utmContent: contentRows.length,
    };
  }

  async getMatchedAds(
    accountId: string,
    dateStart: string,
    dateEnd: string,
    shopId?: string
  ): Promise<{
    shopId: string | null;
    ads: MatchedAdRecord[];
    summary: {
      total: number;
      matched: number;
      unmatched: number;
    };
  }> {
    const cleanId = accountId.replace('act_', '');
    const [fbAds, utmContentRows] = await Promise.all([
      getFbAdsByDateRange(cleanId, dateStart, dateEnd),
      getShoplazzaUtmByDateRange(dateStart, dateEnd, 'utm_content', shopId),
    ]);

    const utmByContent = this.buildUtmContentMap(utmContentRows);

    const ads = fbAds.map((ad) => {
      const utmRow = utmByContent.get(ad.ad_id);
      const utm = utmRow ? this.toUtmMetrics(utmRow) : null;
      return {
        adId: ad.ad_id,
        adName: ad.ad_name,
        spend: Number(ad.spend),
        budget: Number(ad.budget),
        cpm: Number(ad.cpm),
        utm,
      };
    });

    const matched = ads.filter((a) => a.utm).length;

    return {
      shopId: shopId || null,
      ads,
      summary: {
        total: ads.length,
        matched,
        unmatched: ads.length - matched,
      },
    };
  }

  private buildUtmContentMap(rows: ShoplazzaUtmRecord[]): Map<string, ShoplazzaUtmRecord> {
    const map = new Map<string, ShoplazzaUtmRecord>();
    for (const row of rows) {
      map.set(row.utm_value.trim(), row);
    }
    return map;
  }

  private toUtmMetrics(row: ShoplazzaUtmRecord): UtmContentMetrics {
    const sales = Number(row.sales);
    const orders = row.orders;
    return {
      utmContent: row.utm_value,
      uv: row.uv,
      addToCart: row.add_to_cart,
      beginCheckout: row.begin_checkout,
      orders,
      sales,
      aov: calcAov(sales, orders),
    };
  }

  /** 供测试或调试：单条广告是否匹配 utm_content */
  matchAdToUtm(adId: string, utmValue: string): boolean {
    return adIdMatchesUtmContent(adId, utmValue);
  }
}
