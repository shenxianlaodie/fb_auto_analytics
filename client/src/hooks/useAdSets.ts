import { useState, useCallback } from 'react';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';
import { FBAdSet } from '../types/facebook';

export function useAdSets() {
  const [adsets, setAdSets] = useState<FBAdSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accountId } = useAccountStore();

  const fetchAdSets = useCallback(async (campaignId?: string) => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/adsets', {
        params: { accountId, campaignId },
      });
      setAdSets(resp.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const createAdSet = async (data: {
    campaignId: string;
    name: string;
    targeting: Record<string, any>;
    budget: { daily?: number; lifetime?: number };
    bidStrategy?: string;
    status?: string;
    startTime?: string;
    endTime?: string;
  }) => {
    setError(null);
    try {
      const resp = await api.post('/adsets', {
        accountId,
        ...data,
      });
      await fetchAdSets(data.campaignId);
      return resp.data;
    } catch (err: any) {
      setError(err.response?.data?.error || '创建失败');
      throw err;
    }
  };

  const updateAdSet = async (id: string, data: { name?: string; status?: string; budget?: { daily?: number } }) => {
    setError(null);
    try {
      const resp = await api.put(`/adsets/${id}`, data);
      await fetchAdSets();
      return resp.data;
    } catch (err: any) {
      setError(err.response?.data?.error || '更新失败');
      throw err;
    }
  };

  const deleteAdSet = async (id: string) => {
    setError(null);
    try {
      await api.delete(`/adsets/${id}`);
      await fetchAdSets();
    } catch (err: any) {
      setError(err.response?.data?.error || '删除失败');
      throw err;
    }
  };

  return {
    adsets,
    loading,
    error,
    fetchAdSets,
    createAdSet,
    updateAdSet,
    deleteAdSet,
  };
}
