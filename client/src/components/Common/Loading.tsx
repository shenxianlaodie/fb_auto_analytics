import React from 'react';
import { Spin, Flex, Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface LoadingProps {
  tip?: string;
  fullScreen?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({ tip = '加载中...', fullScreen = false }) => {
  const content = (
    <Flex vertical align="center" justify="center" gap={12}>
      <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
      <Text type="secondary">{tip}</Text>
    </Flex>
  );

  if (fullScreen) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
      }}>
        {content}
      </div>
    );
  }

  return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      {content}
    </div>
  );
};
