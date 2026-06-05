import { useState, useCallback } from 'react';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';
import { FBAd } from '../types/facebook';

export function useAds() {
  const [ads, setAds] = useState<FBAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accountId } = useAccountStore();

  const fetchAds = useCallback(async (adsetId?: string, campaignId?: string) => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/ads', {
        params: { accountId, adsetId, campaignId },
      });
      setAds(resp.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const createAd = async (data: {
    adsetId: string;
    name: string;
    creative: {
      title: string;
      body: string;
      imageHash?: string;
      imageUrl?: string;
      linkUrl: string;
      callToAction: string;
    };
    status?: string;
  }) => {
    setError(null);
    try {
      const resp = await api.post('/ads', {
        accountId,
        ...data,
      });
      await fetchAds(data.adsetId);
      return resp.data;
    } catch (err: any) {
      setError(err.response?.data?.error || '创建失败');
      throw err;
    }
  };

  const updateAd = async (id: string, data: { name?: string; status?: string }) => {
    setError(null);
    try {
      const resp = await api.put(`/ads/${id}`, data);
      await fetchAds();
      return resp.data;
    } catch (err: any) {
      setError(err.response?.data?.error || '更新失败');
      throw err;
    }
  };

  const deleteAd = async (id: string) => {
    setError(null);
    try {
      await api.delete(`/ads/${id}`);
      await fetchAds();
    } catch (err: any) {
      setError(err.response?.data?.error || '删除失败');
      throw err;
    }
  };

  return {
    ads,
    loading,
    error,
    fetchAds,
    createAd,
    updateAd,
    deleteAd,
  };
}
