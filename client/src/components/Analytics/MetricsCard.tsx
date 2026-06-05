import React from 'react';
import { Card, Statistic, Typography } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface MetricsCardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  precision?: number;
  change?: number; // percentage change
  loading?: boolean;
  color?: string;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  prefix = '',
  suffix = '',
  precision = 2,
  change,
  loading = false,
  color,
}) => {
  const isPositive = change !== undefined && change >= 0;
  const showChange = change !== undefined && change !== 0;

  return (
    <Card loading={loading} bordered={false} style={{ height: '100%' }}>
      <Statistic
        title={<Text type="secondary">{title}</Text>}
        value={value}
        prefix={prefix}
        suffix={suffix}
        precision={precision}
        valueStyle={{ color: color || undefined, fontSize: 28, fontWeight: 600 }}
      />
      {showChange && (
        <div style={{ marginTop: 8 }}>
          {isPositive ? (
            <ArrowUpOutlined style={{ color: '#52c41a', marginRight: 4 }} />
          ) : (
            <ArrowDownOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />
          )}
          <Text
            style={{ color: isPositive ? '#52c41a' : '#ff4d4f' }}
          >
            {Math.abs(change)}% 环比
          </Text>
        </div>
      )}
    </Card>
  );
};
