import React, { useCallback, useEffect, useState } from 'react';
import { Row, Col, DatePicker, Space, Typography, Alert } from 'antd';
import dayjs from 'dayjs';
import { MetricsCard } from '../components/Analytics/MetricsCard';
import { PieChartCard } from '../components/Analytics/PieChartCard';
import { TopPerformersTable } from '../components/Analytics/TopPerformersTable';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';
import { useUIStore } from '../store/uiStore';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

interface DbDashboard {
  overview: {
    spend: number;
    utmUv: number;
    utmOrders: number;
    utmSales: number;
    roas: number;
    matched: number;
    unmatched: number;
    totalAds: number;
  };
  campaigns: Array<{ id: string; name: string; spend: number; status: string }>;
  meta?: { syncWarnings?: string[]; metricsSyncedAt?: string | null; utmSyncedAt?: string | null };
}

export const Dashboard: React.FC = () => {
  const { accountId, accountName } = useAccountStore();
  const { dateRange, setDateRange } = useUIStore();
  const [data, setData] = useState<DbDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/analytics/dashboard', {
        params: {
          accountId,
          accountName,
          dateStart: dateRange[0],
          dateEnd: dateRange[1],
        },
      });
      setData(resp.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [accountId, accountName, dateRange]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const overview = data?.overview;
  const pieData = (data?.campaigns || []).map((c) => ({
    name: c.name || c.id,
    value: c.spend ?? 0,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>📊 数据仪表盘</Title>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>DB-First · UTC+8</Text>
          <RangePicker
            value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
            onChange={(dates) => {
              if (dates?.[0] && dates?.[1]) {
                setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
              }
            }}
            allowClear={false}
          />
        </Space>
      </div>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
      {data?.meta?.syncWarnings?.map((w) => (
        <Alert key={w} type="warning" message={w} style={{ marginBottom: 8 }} showIcon />
      ))}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <MetricsCard title="总花费 (FB)" value={overview?.spend || 0} prefix="$" precision={2} loading={loading} color="#1677ff" />
        </Col>
        <Col xs={12} sm={6}>
          <MetricsCard title="UTM 访客 (uv)" value={overview?.utmUv || 0} precision={0} loading={loading} color="#52c41a" />
        </Col>
        <Col xs={12} sm={6}>
          <MetricsCard title="成效 (orders)" value={overview?.utmOrders || 0} precision={0} loading={loading} color="#fa8c16" />
        </Col>
        <Col xs={12} sm={6}>
          <MetricsCard title="ROAS (sales/spend)" value={overview?.roas || 0} precision={2} loading={loading} color="#722ed1" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={8}>
          <PieChartCard title="广告系列花费占比" data={pieData} loading={loading} />
        </Col>
        <Col xs={24} lg={16}>
          <TopPerformersTable
            title="🏆 广告系列 TOP（按花费）"
            data={(data?.campaigns || []).map((c) => ({
              id: c.id,
              name: c.name,
              spend: c.spend,
              status: c.status,
            }))}
            loading={loading}
            type="campaign"
          />
        </Col>
      </Row>

      {overview && (
        <Alert
          type="info"
          showIcon
          message={`UTM 匹配：${overview.matched}/${overview.totalAds} 条广告已匹配，${overview.unmatched} 条未匹配`}
        />
      )}
    </div>
  );
};
