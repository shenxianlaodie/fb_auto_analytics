import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface TopPerformersTableProps {
  title: string;
  data: any[];
  loading?: boolean;
  type: 'campaign' | 'adset' | 'ad';
}

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
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a, b) => a.spend - b.spend,
    },
    {
      title: '展示',
      dataIndex: 'impressions',
      key: 'impressions',
      width: 100,
      render: (v: number) => v.toLocaleString(),
      sorter: (a, b) => a.impressions - b.impressions,
    },
    {
      title: '点击',
      dataIndex: 'clicks',
      key: 'clicks',
      width: 80,
      render: (v: number) => v.toLocaleString(),
      sorter: (a, b) => a.clicks - b.clicks,
    },
    {
      title: 'CTR',
      dataIndex: 'ctr',
      key: 'ctr',
      width: 80,
      render: (v: number) => `${v.toFixed(2)}%`,
      sorter: (a, b) => a.ctr - b.ctr,
    },
    {
      title: 'CPC',
      dataIndex: 'cpc',
      key: 'cpc',
      width: 80,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a, b) => a.cpc - b.cpc,
    },
    {
      title: '转化',
      dataIndex: 'conversions',
      key: 'conversions',
      width: 80,
      render: (v: number) => v.toLocaleString(),
      sorter: (a, b) => a.conversions - b.conversions,
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
