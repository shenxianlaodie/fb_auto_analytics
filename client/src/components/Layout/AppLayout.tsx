import React, { useEffect, useState, useRef } from 'react';
import { Layout, Menu, Button, Select, Typography, theme, App } from 'antd';
import {
  DashboardOutlined,
  RocketOutlined,
  UploadOutlined,
  ShopOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  GlobalOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAccountStore } from '../../store/accountStore';
import { useUIStore } from '../../store/uiStore';
import api from '../../services/api';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, setUserInfo } = useAuthStore();
  const { userRole, userAllowedAccounts } = useAuthStore();
  const { accountId, accountName, accounts, setAccount, setAccounts } = useAccountStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { token: themeToken } = theme.useToken();
  const { message } = App.useApp();
  const [fetching, setFetching] = useState(false);
  const fetchedRef = useRef(false);

  const loadAccounts = async (refresh = false) => {
    setFetching(true);
    try {
      const resp = await api.get('/accounts', { params: refresh ? { refresh: 'true' } : {} });
      const list = resp.data.data || resp.data || [];
      setAccounts(list);
      const total = resp.data.total ?? list.length;
      if (resp.data.source === 'facebook') {
        message.success(`已同步 ${total} 个广告账户`);
      } else if (resp.data.warning) {
        message.warning(resp.data.warning);
      }
    } catch (err: any) {
      console.error('[AppLayout] Failed to load accounts:', err);
      message.error(err.response?.data?.error || '加载广告账户失败');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    // 每次进入时刷新用户角色和权限
    api.get('/auth/me').then((r) => {
      setUserInfo(r.data.role || 'viewer', r.data.allowedAccounts || []);
    }).catch(() => {});
    const needRefresh = sessionStorage.getItem('accounts_refresh') === '1';
    if (needRefresh) sessionStorage.removeItem('accounts_refresh');
    loadAccounts(needRefresh);
  }, []);

  const allMenuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '数据仪表盘' },
    { key: '/ads', icon: <RocketOutlined />, label: '广告管理' },
    { key: '/cross-account', icon: <GlobalOutlined />, label: '跨账户汇总' },
    { key: '/spu-top', icon: <TrophyOutlined />, label: 'SPU TOP 榜' },
    { key: '/batch', icon: <UploadOutlined />, label: '批量发布' },
    { key: '/shop-tokens', icon: <KeyOutlined />, label: '店铺 Token', adminOnly: true },
    { key: '/shop-mapping', icon: <ShopOutlined />, label: '店铺映射', adminOnly: true },
    { key: '/token-pool', icon: <KeyOutlined />, label: 'Token池', adminOnly: true },
    { key: '/users', icon: <TeamOutlined />, label: '用户管理', adminOnly: true },
  ];

  const menuItems = allMenuItems.filter(
    (item) => !item.adminOnly || userRole === 'admin'
  );

  const handleMenuClick = (key: string) => {
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={sidebarCollapsed}
        style={{
          background: themeToken.colorBgContainer,
          borderRight: `1px solid ${themeToken.colorBorderSecondary}`,
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
        }}>
          <Text strong style={{ fontSize: sidebarCollapsed ? 14 : 16, color: themeToken.colorPrimary }}>
            {sidebarCollapsed ? 'FB' : 'FB Auto Analytics'}
          </Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => handleMenuClick(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header style={{
          background: themeToken.colorBgContainer,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          height: 64,
        }}>
          <Button
            type="text"
            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleSidebar}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Select
              value={accountId || undefined}
              onChange={(val, option: any) => setAccount(val, option?.label || '')}
              style={{ minWidth: 280 }}
              placeholder={fetching ? '加载账户中...' : `选择广告账户 (${accounts.length})`}
              loading={fetching}
              showSearch
              optionFilterProp="label"
              options={accounts
                .filter((acc) => {
                  if (userRole === 'admin' && userAllowedAccounts.length === 0) return true;
                  const accId = (acc.account_id || acc.id || '').replace(/^act_/, '');
                  return userAllowedAccounts.some(
                    (a: string) => a.replace(/^act_/, '') === accId
                  );
                })
                .map((acc) => ({
                  value: acc.id,
                  label: acc.account_status === 1
                    ? (acc.name || acc.id)
                    : `${acc.name || acc.id} (停用)`,
                }))}
            />
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={fetching}
              title="从 Facebook 刷新账户列表"
              onClick={() => loadAccounts(true)}
            />
            <Text type="secondary">{accountName || '未选择账户'}</Text>
            <Button
              type="text"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            >
              退出
            </Button>
          </div>
        </Header>

        <Content style={{
          margin: 24,
          padding: 24,
          background: themeToken.colorBgContainer,
          borderRadius: themeToken.borderRadiusLG,
          minHeight: 280,
          overflow: 'auto',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
