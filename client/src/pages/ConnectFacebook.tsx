import React from 'react';
import { Button, Card, Typography, Space, message, Alert, Spin } from 'antd';
import { FacebookOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

const { Title, Text, Paragraph } = Typography;

export const ConnectFacebook: React.FC = () => {
  const [connecting, setConnecting] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const success = searchParams.get('success');

  React.useEffect(() => {
    if (success) {
      message.success('Facebook 绑定成功');
      navigate('/', { replace: true });
      return;
    }
    if (error) {
      message.error(decodeURIComponent(error));
    }
    // 检查是否需要绑定
    api.get('/tokens/need-bind').then((r) => {
      if (!r.data.needBind) {
        navigate('/', { replace: true });
      } else {
        setChecking(false);
      }
    }).catch(() => {
      setChecking(false);
    });
  }, [success, error]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const resp = await api.get('/tokens/connect');
      window.location.href = resp.data.redirectUrl;
    } catch (err: any) {
      message.error('获取授权链接失败');
      setConnecting(false);
    }
  };

  const handleSkip = () => {
    navigate('/', { replace: true });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1677ff 0%, #722ed1 100%)',
      padding: 24,
    }}>
      <Card style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        {checking ? (
          <Spin size="large" tip="检查绑定状态..." />
        ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <ThunderboltOutlined style={{ fontSize: 48, color: '#1677ff' }} />

          <div>
            <Title level={2} style={{ marginBottom: 8 }}>绑定 Facebook 账号</Title>
            <Text type="secondary">
              为了获取广告数据，您需要授权绑定一个 Facebook 账号。
            </Text>
          </div>

          <Alert
            type="info"
            message="您的 Facebook Token 将被加入系统 Token 池，用于拉取广告数据。不会访问您的个人隐私信息。"
            showIcon
          />

          <Button
            type="primary"
            size="large"
            icon={<FacebookOutlined />}
            onClick={handleConnect}
            loading={connecting}
            block
            style={{ height: 48, fontSize: 16 }}
          >
            绑定 Facebook 账号
          </Button>

          <Button type="link" onClick={handleSkip}>
            跳过，稍后绑定
          </Button>

          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            您也可以联系管理员在 Token 池中手动添加 Facebook Token
          </Paragraph>
        </Space>
        )}
      </Card>
    </div>
  );
};
