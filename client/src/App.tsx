import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppLayout } from './components/Layout/AppLayout';
import { ErrorBoundary } from './components/Common/ErrorBoundary';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { Dashboard } from './pages/Dashboard';
import { AdsManager } from './pages/AdsManager';
import { AdCreate } from './pages/AdCreate';
import { BatchPublish } from './pages/BatchPublish';
import { ShopMapping } from './pages/ShopMapping';
import { ShopTokens } from './pages/ShopTokens';
import { CrossAccountSummary } from './pages/CrossAccountSummary';
import { SpuTopBoard } from './pages/SpuTopBoard';
import { TokenPool } from './pages/TokenPool';
import { ConnectFacebook } from './pages/ConnectFacebook';
import { UserManagement } from './pages/UserManagement';
import { useAuthStore } from './store/authStore';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/connect-facebook" element={<ConnectFacebook />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="ads" element={<AdsManager />} />
        <Route path="ads/create" element={<AdCreate />} />
        <Route path="cross-account" element={<CrossAccountSummary />} />
        <Route path="spu-top" element={<SpuTopBoard />} />
        <Route path="batch" element={<BatchPublish />} />
        <Route path="shop-mapping" element={<ShopMapping />} />
        <Route path="shop-tokens" element={<ShopTokens />} />
        <Route path="token-pool" element={<TokenPool />} />
        <Route path="users" element={<UserManagement />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
          },
        }}
      >
        <AntApp>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <AppRoutes />
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </ErrorBoundary>
  );
}
