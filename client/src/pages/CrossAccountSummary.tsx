import React, { useCallback, useEffect, useState } from 'react';
import { Table, Typography, DatePicker, Space, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import api from '../services/api';
import { useUIStore } from '../store/uiStore';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface CrossAccountRow {
  accountId: string;
  accountName: string;
  spend: number;
  utmUv: number;
  utmOrders: number;
  utmSales: number;
  roas: number;
  matched: number;
  unmatched: number;
  totalAds: number;
  metricsSyncedAt: string | null;
  utmSyncedAt: string | null;
}

interface CrossAccountResponse {
  dateStart: string;
  dateEnd: string;
  timezone: string;
  totals: CrossAccountRow;
  accounts: CrossAccountRow[];
}

export const CrossAccountSummary: React.FC = () => {
  const { dateRange, setDateRange } = useUIStore();
  const [data, setData] = useState<CrossAccountResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/analytics/cross-account', {
        params: { dateStart: dateRange[0], dateEnd: dateRange[1] },
      });
      setData(resp.data);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: ColumnsType<CrossAccountRow> = [
    { title: '账户', dataIndex: 'accountName', key: 'accountName', width: 220, ellipsis: true },
    { title: '花费', dataIndex: 'spend', key: 'spend', width: 100, render: (v) => `$${Number(v).toFixed(2)}` },
    { title: 'UV', dataIndex: 'utmUv', key: 'utmUv', width: 80 },
    { title: '成效', dataIndex: 'utmOrders', key: 'utmOrders', width: 80 },
    { title: '销售额', dataIndex: 'utmSales', key: 'utmSales', width: 100, render: (v) => `$${Number(v).toFixed(2)}` },
    { title: 'ROAS', dataIndex: 'roas', key: 'roas', width: 80, render: (v) => Number(v).toFixed(2) },
    {
      title: 'UTM 匹配',
      key: 'matched',
      width: 120,
      render: (_, r) => `${r.matched}/${r.totalAds}`,
    },
    {
      title: '最后同步',
      key: 'sync',
      width: 160,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.metricsSyncedAt ? new Date(r.metricsSyncedAt).toLocaleString() : '-'}
        </Text>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>🌐 跨账户汇总</Title>
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

      {data?.totals && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`合计：花费 $${data.totals.spend.toFixed(2)} · 成效 ${data.totals.utmOrders} · ROAS ${data.totals.roas.toFixed(2)} · 匹配 ${data.totals.matched}/${data.totals.totalAds}`}
        />
      )}

      <Table
        columns={columns}
        dataSource={data?.accounts || []}
        rowKey="accountId"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 50 }}
        scroll={{ x: 1100 }}
      />
    </div>
  );
};
