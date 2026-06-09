import { query } from '../models/database';
import { HierarchyService } from './hierarchyService';
import { ShopTokenService } from './shopTokenService';

export class DashboardService {
  private hierarchy = new HierarchyService();
  private shopTokenService = new ShopTokenService();

  async getDashboard(
    accountId: string,
    dateStart: string,
    dateEnd: string,
    accountName?: string
  ) {
    let shopId: string | undefined;
    try {
      const shop = await this.shopTokenService.resolveShop({ accountId, accountName });
      shopId = shop.shopId;
    } catch {
      shopId = undefined;
    }

    const data = await this.hierarchy.getHierarchyFromDb(accountId, dateStart, dateEnd, shopId);
    const { campaigns, ads, meta } = data;

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

    const roas = spend > 0 ? Math.round((utmSales / spend) * 100) / 100 : 0;

    const campaignRows = campaigns
      .map((c) => ({
        id: c.id,
        name: c.name,
        spend: Number(c.spend) || 0,
        status: c.status,
      }))
      .sort((a, b) => b.spend - a.spend);

    return {
      overview: {
        spend: Math.round(spend * 100) / 100,
        utmUv,
        utmOrders,
        utmSales: Math.round(utmSales * 100) / 100,
        utmAddToCart,
        utmBeginCheckout,
        roas,
        matched: meta.matched?.matched ?? 0,
        unmatched: meta.matched?.unmatched ?? 0,
        totalAds: meta.matched?.total ?? ads.length,
      },
      campaigns: campaignRows,
      meta,
      source: 'db' as const,
    };
  }

  async getCrossAccountSummary(dateStart: string, dateEnd: string) {
    const accounts = await query(
      `SELECT DISTINCT ON (account_id) account_id, account_name
       FROM ad_accounts
       ORDER BY account_id, account_name`
    );

    const rows = await Promise.all(
      accounts.map(async (acc) => {
        const accountId = String(acc.account_id).replace('act_', '');
        try {
          const dash = await this.getDashboard(accountId, dateStart, dateEnd, acc.account_name);
          return {
            accountId,
            accountName: acc.account_name || accountId,
            spend: dash.overview.spend,
            utmOrders: dash.overview.utmOrders,
            utmSales: dash.overview.utmSales,
            roas: dash.overview.roas,
            utmUv: dash.overview.utmUv,
            matched: dash.overview.matched,
            unmatched: dash.overview.unmatched,
            totalAds: dash.overview.totalAds,
            metricsSyncedAt: dash.meta.metricsSyncedAt,
            utmSyncedAt: dash.meta.utmSyncedAt,
          };
        } catch {
          return {
            accountId,
            accountName: acc.account_name || accountId,
            spend: 0,
            utmOrders: 0,
            utmSales: 0,
            roas: 0,
            utmUv: 0,
            matched: 0,
            unmatched: 0,
            totalAds: 0,
            metricsSyncedAt: null,
            utmSyncedAt: null,
          };
        }
      })
    );

    const totals = rows.reduce(
      (t, r) => ({
        spend: t.spend + r.spend,
        utmOrders: t.utmOrders + r.utmOrders,
        utmSales: t.utmSales + r.utmSales,
        utmUv: t.utmUv + r.utmUv,
        matched: t.matched + r.matched,
        unmatched: t.unmatched + r.unmatched,
        totalAds: t.totalAds + r.totalAds,
      }),
      { spend: 0, utmOrders: 0, utmSales: 0, utmUv: 0, matched: 0, unmatched: 0, totalAds: 0 }
    );

    return {
      dateStart,
      dateEnd,
      timezone: 'UTC+8',
      totals: {
        ...totals,
        utmSales: Math.round(totals.utmSales * 100) / 100,
        spend: Math.round(totals.spend * 100) / 100,
        roas: totals.spend > 0 ? Math.round((totals.utmSales / totals.spend) * 100) / 100 : 0,
      },
      accounts: rows.sort((a, b) => b.spend - a.spend),
    };
  }
}
