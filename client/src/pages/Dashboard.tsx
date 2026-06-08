import React, { useEffect, useState } from 'react';
import { Row, Col, DatePicker, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { MetricsCard } from '../components/Analytics/MetricsCard';
import { TrendChart } from '../components/Analytics/TrendChart';
import { PieChartCard } from '../components/Analytics/PieChartCard';
import { TopPerformersTable } from '../components/Analytics/TopPerformersTable';
import { useInsights } from '../hooks/useInsights';
import { useUIStore } from '../store/uiStore';

const { RangePicker } = DatePicker;
const { Title } = Typography;

export const Dashboard: React.FC = () => {
  const {
    overview,
    trends,
    campaignInsights,
    loading,
    error,
    fetchDashboard,
  } = useInsights();

  const { dateRange, setDateRange } = useUIStore();
  const [trendMetric, setTrendMetric] = useState<string>('spend');

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const pieData = campaignInsights.map((c) => ({
    name: c.name || c.id,
    value: c.spend ?? 0,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>📊 数据仪表盘</Title>
        <RangePicker
          value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
            }
          }}
          allowClear={false}
        />
      </div>

      {/* Top Metrics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <MetricsCard
            title="总花费"
            value={overview?.spend || 0}
            prefix="$"
            precision={2}
            change={overview?.spendChange}
            loading={loading}
            color="#1677ff"
          />
        </Col>
        <Col xs={12} sm={6}>
          <MetricsCard
            title="展示数"
            value={overview?.impressions || 0}
            suffix=""
            precision={0}
            change={overview?.impressionsChange}
            loading={loading}
            color="#52c41a"
          />
        </Col>
        <Col xs={12} sm={6}>
          <MetricsCard
            title="点击数"
            value={overview?.clicks || 0}
            precision={0}
            change={overview?.clicksChange}
            loading={loading}
            color="#fa8c16"
          />
        </Col>
        <Col xs={12} sm={6}>
          <MetricsCard
            title="转化数"
            value={overview?.conversions || 0}
            precision={0}
            change={overview?.conversionsChange}
            loading={loading}
            color="#722ed1"
          />
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <TrendChart
            data={trends}
            loading={loading}
            metric={trendMetric as any}
            onMetricChange={setTrendMetric}
          />
        </Col>
        <Col xs={24} lg={8}>
          <PieChartCard
            title="广告系列花费占比"
            data={pieData}
            loading={loading}
          />
        </Col>
      </Row>

      {/* Top Performers Table */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <TopPerformersTable
            title="🏆 广告系列 TOP 排行"
            data={campaignInsights}
            loading={loading}
            type="campaign"
          />
        </Col>
      </Row>
    </div>
  );
};
