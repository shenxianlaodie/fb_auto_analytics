import { useState, useCallback } from 'react';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';
import { FBCampaign } from '../types/facebook';

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<FBCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accountId } = useAccountStore();

  const fetchCampaigns = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/campaigns', {
        params: { accountId },
      });
      setCampaigns(resp.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const createCampaign = async (data: {
    name: string;
    objective: string;
    status?: string;
    specialAdCategories?: string[];
  }) => {
    setError(null);
    try {
      const resp = await api.post('/campaigns', {
        accountId,
        ...data,
      });
      await fetchCampaigns();
      return resp.data;
    } catch (err: any) {
      setError(err.response?.data?.error || '创建失败');
      throw err;
    }
  };

  const updateCampaign = async (id: string, data: { name?: string; status?: string }) => {
    setError(null);
    try {
      const resp = await api.put(`/campaigns/${id}`, data);
      await fetchCampaigns();
      return resp.data;
    } catch (err: any) {
      setError(err.response?.data?.error || '更新失败');
      throw err;
    }
  };

  const deleteCampaign = async (id: string) => {
    setError(null);
    try {
      await api.delete(`/campaigns/${id}`);
      await fetchCampaigns();
    } catch (err: any) {
      setError(err.response?.data?.error || '删除失败');
      throw err;
    }
  };

  return {
    campaigns,
    loading,
    error,
    fetchCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
  };
}
