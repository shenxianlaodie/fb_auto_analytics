import React, { useCallback, useEffect, useState } from 'react';
import { Row, Col, DatePicker, Space, Typography, Alert } from 'antd';
import dayjs from 'dayjs';
import { MetricsCard } from '../components/Analytics/MetricsCard';
import { TopPerformersTable } from '../components/Analytics/TopPerformersTable';
import api from '../services/api';
import { useUIStore } from '../store/uiStore';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

interface CrossAccountTotals {
  spend: number;
  utmUv: number;
  utmOrders: number;
  utmSales: number;
  roas: number;
  aov: number;
  conversionRate: number;
  matched: number;
  unmatched: number;
  totalAds: number;
}

interface CrossAccountRow extends CrossAccountTotals {
  accountId: string;
  accountName: string;
  utmAddToCart: number;
  utmBeginCheckout: number;
  cpc: number;
  costPerAddToCart: number;
  costPerInitiateCheckout: number;
  costPerOrder: number;
}

interface CrossAccountResponse {
  totals: CrossAccountTotals;
  accounts: CrossAccountRow[];
}

export const Dashboard: React.FC = () => {
  const { dateRange, setDateRange } = useUIStore();
  const [data, setData] = useState<CrossAccountResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/analytics/cross-account', {
        params: {
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
  }, [dateRange]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const totals = data?.totals;
  const aov =
    totals?.aov ??
    (totals && totals.utmOrders > 0 ? totals.utmSales / totals.utmOrders : 0);
  const conversionRate =
    totals?.conversionRate ??
    (totals && totals.utmUv > 0 ? (totals.utmOrders / totals.utmUv) * 100 : 0);

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

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={4}>
          <MetricsCard title="总花费 (FB)" value={totals?.spend || 0} prefix="$" precision={2} loading={loading} color="#1677ff" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <MetricsCard title="UTM 访客 (uv)" value={totals?.utmUv || 0} precision={0} loading={loading} color="#52c41a" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <MetricsCard title="成效 (orders)" value={totals?.utmOrders || 0} precision={0} loading={loading} color="#fa8c16" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <MetricsCard title="ROAS (sales/spend)" value={totals?.roas || 0} precision={2} loading={loading} color="#722ed1" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <MetricsCard title="客单价" value={aov} prefix="$" precision={2} loading={loading} color="#13c2c2" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <MetricsCard title="转化率" value={conversionRate} suffix="%" precision={2} loading={loading} color="#eb2f96" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <TopPerformersTable
            title="🏆 广告账户 TOP"
            data={data?.accounts || []}
            loading={loading}
            type="account"
          />
        </Col>
      </Row>

      {totals && (
        <Alert
          type="info"
          showIcon
          message={`UTM 匹配：${totals.matched}/${totals.totalAds} 条广告已匹配，${totals.unmatched} 条未匹配`}
        />
      )}
    </div>
  );
};
