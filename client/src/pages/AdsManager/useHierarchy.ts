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
  const requestIdRef = useRef(0);

  const applyHierarchy = (data: any) => {
    setCampaigns(data.campaigns || []);
    setAdsets(data.adsets || []);
    setAds(data.ads || []);
    if (data.meta) setSyncMeta(data.meta);
  };

  const loadHierarchy = useCallback(async () => {
    if (!accountId) return;
    const reqId = ++requestIdRef.current;
    const resp = await api.get('/analytics/hierarchy', {
      params: { accountId, accountName, dateStart: dateRange[0], dateEnd: dateRange[1] },
    });
    if (reqId === requestIdRef.current) {
      applyHierarchy(resp.data);
    }
  }, [accountId, accountName, dateRange]);

  /** 静默读库（创建/编辑/复制成功后调用） */
  const reload = useCallback(async () => {
    ++requestIdRef.current;
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
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      const resp = await api.post('/analytics/refresh', {
        accountId, accountName, dateStart: dateRange[0], dateEnd: dateRange[1], force: true,
      });
      if (reqId === requestIdRef.current) {
        applyHierarchy(resp.data);
      }
      message.info('正在从 Facebook 拉取最新数据...');

      let done = false;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        if (reqId !== requestIdRef.current) break;
        const poll = await api.get('/analytics/hierarchy', {
          params: { accountId, accountName, dateStart: dateRange[0], dateEnd: dateRange[1] },
        });
        if (reqId !== requestIdRef.current) break;
        applyHierarchy(poll.data);
        if (!poll.data?.meta?.refreshing) {
          done = true;
          break;
        }
      }
      if (reqId === requestIdRef.current) {
        message.success(done ? '已更新为 Facebook 最新数据' : '同步仍在进行，稍后自动更新');
      }
    } catch (err: any) {
      if (reqId === requestIdRef.current) {
        message.warning(err.response?.data?.error || '刷新失败');
      }
    }
    if (reqId === requestIdRef.current) {
      setLoading(false);
    }
  }, [accountId, accountName, dateRange]);

  return { campaigns, adsets, ads, loading, syncMeta, reload, refresh };
}
