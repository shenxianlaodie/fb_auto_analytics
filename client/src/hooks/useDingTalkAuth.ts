import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useAccountStore } from '../store/accountStore';
import { FBAdAccount } from '../types/facebook';

export function useDingTalkAuth() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, setAuth, setUserInfo, logout } = useAuthStore();
  const { setAccounts, setAccount } = useAccountStore();
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const resp = await api.get('/auth/status');
      if (resp.data.authenticated) {
        await fetchCurrentUser();
        await fetchAccounts();
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  async function fetchCurrentUser() {
    try {
      const resp = await api.get('/auth/me');
      const { role, allowedAccounts } = resp.data;
      setUserInfo(role || 'viewer', allowedAccounts || []);
    } catch (err: any) {
      console.error('Failed to fetch user info:', err);
    }
  }

  async function fetchAccounts() {
    try {
      const resp = await api.get('/accounts');
      const accounts: FBAdAccount[] = resp.data.data || resp.data || [];
      setAccounts(accounts);
      if (accounts.length > 0) {
        setAccount(accounts[0].id, accounts[0].name);
      }
    } catch (err: any) {
      console.error('Failed to fetch ad accounts:', err);
    }
    setLoading(false);
  }

  async function login() {
    try {
      setLoading(true);
      setError(null);
      const resp = await api.get('/auth/login');
      window.location.href = resp.data.redirectUrl;
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败');
      setLoading(false);
    }
  }

  function handleCallback(token: string) {
    setAuth(token, '');
    setLoading(false);
    navigate('/', { replace: true });
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return {
    loading,
    error,
    isAuthenticated,
    login,
    handleCallback,
    handleLogout,
  };
}
