import React from 'react';
import { Card, Radio } from 'antd';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ComposedChart, Bar,
} from 'recharts';
import { TrendDataPoint } from '../../types/facebook';
import dayjs from 'dayjs';

interface TrendChartProps {
  data: TrendDataPoint[];
  loading?: boolean;
  metric?: 'spend' | 'impressions' | 'clicks' | 'conversions';
  onMetricChange?: (metric: string) => void;
}

const safeNum = (v: unknown): number => (v != null && !isNaN(Number(v)) ? Number(v) : 0);

const METRICS_CONFIG: Record<string, { label: string; color: string; format: (v: number) => string; yAxisLabel: string }> = {
  spend: { label: '花费', color: '#1677ff', format: (v) => `$${safeNum(v).toFixed(2)}`, yAxisLabel: '花费 ($)' },
  impressions: { label: '展示', color: '#52c41a', format: (v) => safeNum(v).toLocaleString(), yAxisLabel: '展示数' },
  clicks: { label: '点击', color: '#fa8c16', format: (v) => safeNum(v).toLocaleString(), yAxisLabel: '点击数' },
  conversions: { label: '转化', color: '#722ed1', format: (v) => safeNum(v).toLocaleString(), yAxisLabel: '转化数' },
};

export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  loading = false,
  metric = 'spend',
  onMetricChange,
}) => {
  const config = METRICS_CONFIG[metric] || METRICS_CONFIG.spend;

  const chartData = data.map((d) => ({
    date: dayjs(d.date).format('MM/DD'),
    value: safeNum(d[metric as keyof TrendDataPoint]),
    impressions: safeNum(d.impressions),
    clicks: safeNum(d.clicks),
    spend: safeNum(d.spend),
    conversions: safeNum(d.conversions),
  }));

  return (
    <Card
      loading={loading}
      title="趋势分析"
      extra={
        <Radio.Group
          value={metric}
          onChange={(e) => onMetricChange?.(e.target.value)}
          size="small"
          optionType="button"
        >
          {Object.entries(METRICS_CONFIG).map(([key, cfg]) => (
            <Radio.Button key={key} value={key}>{cfg.label}</Radio.Button>
          ))}
        </Radio.Group>
      }
    >
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`color${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={config.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" fontSize={12} />
          <YAxis fontSize={12} tickFormatter={config.format} />
          <Tooltip
            formatter={(value: number) => [config.format(value), config.label]}
            labelFormatter={(label) => `日期: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={config.color}
            fill={`url(#color${metric})`}
            strokeWidth={2}
            name={config.label}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};
