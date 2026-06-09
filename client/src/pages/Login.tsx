import React, { useEffect } from 'react';
import { Button, Card, Typography, Space, Flex, Alert } from 'antd';
import { DingtalkOutlined, ThunderboltOutlined, BarChartOutlined, RocketOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDingTalkAuth } from '../hooks/useDingTalkAuth';

const { Title, Text, Paragraph } = Typography;

export const Login: React.FC = () => {
  const { loading, error, isAuthenticated, login, handleCallback } = useDingTalkAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      handleCallback(token);
    }
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [searchParams, isAuthenticated]);

  const errorMsg = searchParams.get('error');

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
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <ThunderboltOutlined style={{ fontSize: 48, color: '#1677ff' }} />

          <div>
            <Title level={2} style={{ marginBottom: 8 }}>FB Auto Analytics</Title>
            <Text type="secondary">
              更简洁、更智能的 Facebook 广告管理平台
            </Text>
          </div>

          <Flex justify="center" gap={24}>
            <div style={{ textAlign: 'center' }}>
              <RocketOutlined style={{ fontSize: 24, color: '#52c41a' }} />
              <br />
              <Text type="secondary">批量发布</Text>
            </div>
            <div style={{ textAlign: 'center' }}>
              <BarChartOutlined style={{ fontSize: 24, color: '#1677ff' }} />
              <br />
              <Text type="secondary">可视化分析</Text>
            </div>
          </Flex>

          {(error || errorMsg) && (
            <Alert
              type="error"
              message={error || errorMsg}
              showIcon
              closable
            />
          )}

          <Button
            type="primary"
            size="large"
            icon={<DingtalkOutlined />}
            onClick={login}
            loading={loading}
            block
            style={{ height: 48, fontSize: 16 }}
          >
            使用钉钉账号登录
          </Button>

          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            登录即表示您授权使用钉钉账号进行身份认证。
            系统将通过管理员的 Facebook 广告账户获取数据。
          </Paragraph>
        </Space>
      </Card>
    </div>
  );
};
