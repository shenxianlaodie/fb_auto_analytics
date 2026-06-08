import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface TopPerformersTableProps {
  title: string;
  data: any[];
  loading?: boolean;
  type: 'campaign' | 'adset' | 'ad';
}

const fmtNum = (v: unknown) =>
  v != null && !isNaN(Number(v)) ? Number(v).toLocaleString() : '-';
const fmtMoney = (v: unknown) =>
  v != null && !isNaN(Number(v)) ? `$${Number(v).toFixed(2)}` : '-';
const fmtPct = (v: unknown) =>
  v != null && !isNaN(Number(v)) ? `${Number(v).toFixed(2)}%` : '-';

export const TopPerformersTable: React.FC<TopPerformersTableProps> = ({
  title,
  data,
  loading = false,
  type,
}) => {
  const columns: ColumnsType<any> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : status === 'PAUSED' ? 'orange' : 'default'}>
          {status === 'ACTIVE' ? '投放中' : status === 'PAUSED' ? '已暂停' : status}
        </Tag>
      ),
    },
    {
      title: '花费',
      dataIndex: 'spend',
      key: 'spend',
      width: 100,
      render: (v: unknown) => fmtMoney(v),
      sorter: (a, b) => (a.spend ?? 0) - (b.spend ?? 0),
    },
    {
      title: '展示',
      dataIndex: 'impressions',
      key: 'impressions',
      width: 100,
      render: (v: unknown) => fmtNum(v),
      sorter: (a, b) => (a.impressions ?? 0) - (b.impressions ?? 0),
    },
    {
      title: '点击',
      dataIndex: 'clicks',
      key: 'clicks',
      width: 80,
      render: (v: unknown) => fmtNum(v),
      sorter: (a, b) => (a.clicks ?? 0) - (b.clicks ?? 0),
    },
    {
      title: 'CTR',
      dataIndex: 'ctr',
      key: 'ctr',
      width: 80,
      render: (v: unknown) => fmtPct(v),
      sorter: (a, b) => (a.ctr ?? 0) - (b.ctr ?? 0),
    },
    {
      title: 'CPC',
      dataIndex: 'cpc',
      key: 'cpc',
      width: 80,
      render: (v: unknown) => fmtMoney(v),
      sorter: (a, b) => (a.cpc ?? 0) - (b.cpc ?? 0),
    },
    {
      title: '转化',
      key: 'conversions',
      width: 80,
      render: (_: unknown, record: any) =>
        fmtNum(record.conversions ?? record.purchases),
      sorter: (a, b) =>
        (a.conversions ?? a.purchases ?? 0) - (b.conversions ?? b.purchases ?? 0),
    },
  ];

  return (
    <Card title={title}>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 900 }}
        locale={{ emptyText: '暂无数据' }}
      />
    </Card>
  );
};
