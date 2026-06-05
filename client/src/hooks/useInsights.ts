import { useState, useCallback } from 'react';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';
import { useUIStore } from '../store/uiStore';
import { OverviewMetrics, TrendDataPoint, CampaignWithMetrics, AdSetWithMetrics, AdWithMetrics } from '../types/facebook';

export function useInsights() {
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [trends, setTrends] = useState<TrendDataPoint[]>([]);
  const [campaignInsights, setCampaignInsights] = useState<CampaignWithMetrics[]>([]);
  const [adsetInsights, setAdsetInsights] = useState<AdSetWithMetrics[]>([]);
  const [adInsights, setAdInsights] = useState<AdWithMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accountId } = useAccountStore();
  const { dateRange } = useUIStore();

  const fetchDashboard = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/insights/dashboard', {
        params: {
          accountId,
          dateStart: dateRange[0],
          dateEnd: dateRange[1],
        },
      });
      setOverview(resp.data.overview || null);
      setTrends(resp.data.trends || []);
      setCampaignInsights(resp.data.campaigns || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [accountId, dateRange]);

  const fetchOverview = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/insights/overview', {
        params: { accountId, dateStart: dateRange[0], dateEnd: dateRange[1] },
      });
      setOverview(resp.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [accountId, dateRange]);

  const fetchTrends = useCallback(async () => {
    if (!accountId) return;
    try {
      const resp = await api.get('/insights/trends', {
        params: { accountId, dateStart: dateRange[0], dateEnd: dateRange[1] },
      });
      setTrends(resp.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载趋势数据失败');
    }
  }, [accountId, dateRange]);

  const fetchCampaignInsights = useCallback(async () => {
    if (!accountId) return;
    try {
      const resp = await api.get('/insights/campaigns', {
        params: { accountId, dateStart: dateRange[0], dateEnd: dateRange[1] },
      });
      setCampaignInsights(resp.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载广告系列数据失败');
    }
  }, [accountId, dateRange]);

  const fetchAdSetInsights = useCallback(async (campaignId?: string) => {
    if (!accountId) return;
    try {
      const resp = await api.get('/insights/adsets', {
        params: {
          accountId,
          campaignId,
          dateStart: dateRange[0],
          dateEnd: dateRange[1],
        },
      });
      setAdsetInsights(resp.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载广告组数据失败');
    }
  }, [accountId, dateRange]);

  const fetchAdInsights = useCallback(async (adsetId?: string) => {
    if (!accountId) return;
    try {
      const resp = await api.get('/insights/ads', {
        params: {
          accountId,
          adsetId,
          dateStart: dateRange[0],
          dateEnd: dateRange[1],
        },
      });
      setAdInsights(resp.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载广告数据失败');
    }
  }, [accountId, dateRange]);

  return {
    overview,
    trends,
    campaignInsights,
    adsetInsights,
    adInsights,
    loading,
    error,
    fetchDashboard,
    fetchOverview,
    fetchTrends,
    fetchCampaignInsights,
    fetchAdSetInsights,
    fetchAdInsights,
  };
}
