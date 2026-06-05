import React, { useEffect, useState, useRef } from 'react';
import { Layout, Menu, Button, Select, Typography, theme, message } from 'antd';
import {
  DashboardOutlined,
  RocketOutlined,
  UploadOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
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
  const { logout } = useAuthStore();
  const { accountId, accountName, accounts, setAccount, setAccounts } = useAccountStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { token: themeToken } = theme.useToken();
  const [fetching, setFetching] = useState(false);
  const fetchedRef = useRef(false);

  // Fetch ad accounts ONCE on mount
  useEffect(() => {
    if (!fetchedRef.current && !fetching) {
      fetchedRef.current = true;
      setFetching(true);
      api.get('/accounts')
        .then((resp) => {
          const list = resp.data.data || resp.data || [];
          console.log('[AppLayout] Loaded accounts:', list.length, list.map((a: any) => ({ id: a.id, name: a.name, status: a.account_status })));
          setAccounts(list);
        })
        .catch((err) => {
          console.error('[AppLayout] Failed to load accounts:', err);
          message.error('加载广告账户失败');
        });
    }
  }, []);

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '数据仪表盘' },
    { key: '/ads', icon: <RocketOutlined />, label: '广告管理' },
    { key: '/batch', icon: <UploadOutlined />, label: '批量发布' },
  ];

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
              style={{ minWidth: 220 }}
              placeholder="选择广告账户"
              options={accounts.map((acc) => ({
                value: acc.id,
                label: acc.name || acc.id,
              }))}
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
