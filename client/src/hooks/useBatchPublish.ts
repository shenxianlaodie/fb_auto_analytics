import { useState, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';
import { BatchJobStatus } from '../types/facebook';

export function useBatchPublish() {
  const [jobStatus, setJobStatus] = useState<BatchJobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { accountId } = useAccountStore();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const downloadTemplate = useCallback(async () => {
    try {
      const resp = await api.get('/batch/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([resp.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'fb_batch_ads_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.error || '下载模板失败');
    }
  }, []);

  const uploadCSV = useCallback(async (file: File) => {
    if (!accountId) {
      setError('请先选择广告账户');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('accountId', accountId);

      const resp = await api.post('/batch/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Start polling for progress
      const jobId = resp.data.jobId;
      startPolling(jobId);
      return resp.data;
    } catch (err: any) {
      setError(err.response?.data?.error || '上传失败');
      setLoading(false);
    }
  }, [accountId]);

  const startPolling = (jobId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const resp = await api.get(`/batch/status/${jobId}`);
        const status: BatchJobStatus = resp.data;
        setJobStatus(status);

        if (status.status === 'completed' || status.status === 'failed') {
          stopPolling();
          setLoading(false);
        }
      } catch {
        stopPolling();
        setLoading(false);
      }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const checkJobStatus = useCallback(async (jobId: string) => {
    try {
      const resp = await api.get(`/batch/status/${jobId}`);
      setJobStatus(resp.data);
      return resp.data;
    } catch (err: any) {
      setError(err.response?.data?.error || '查询状态失败');
    }
  }, []);

  return {
    jobStatus,
    loading,
    error,
    downloadTemplate,
    uploadCSV,
    checkJobStatus,
    stopPolling,
  };
}
