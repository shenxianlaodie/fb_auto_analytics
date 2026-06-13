import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  fmtAov,
  fmtCostPerCount,
  fmtCostPerOrder,
  fmtCostPerUv,
  fmtRoas,
} from '../../pages/AdsManager/helpers';

interface TopPerformersTableProps {
  title: string;
  data: any[];
  loading?: boolean;
  type: 'campaign' | 'adset' | 'ad' | 'account';
}

const fmtNum = (v: unknown) =>
  v != null && !isNaN(Number(v)) ? Number(v).toLocaleString() : '-';
const fmtMoney = (v: unknown) =>
  v != null && !isNaN(Number(v)) ? `$${Number(v).toFixed(2)}` : '-';
const fmtPct = (v: unknown) =>
  v != null && !isNaN(Number(v)) ? `${Number(v).toFixed(2)}%` : '-';

const campaignColumns: ColumnsType<any> = [
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

const fmtDerivedCost = (precomputed: unknown, spend: number, count: number) => {
  const p = Number(precomputed);
  if (p > 0) return fmtMoney(p);
  return fmtCostPerCount(spend, count);
};

const accountColumns: ColumnsType<any> = [
  {
    title: '名称',
    dataIndex: 'accountName',
    key: 'accountName',
    width: 220,
    ellipsis: true,
  },
  {
    title: 'ROAS',
    dataIndex: 'roas',
    key: 'roas',
    width: 80,
    render: (_: unknown, r: any) => fmtRoas(r.utmSales, r.spend),
    sorter: (a, b) => (a.roas ?? 0) - (b.roas ?? 0),
  },
  {
    title: '花费',
    dataIndex: 'spend',
    key: 'spend',
    width: 100,
    render: (v: unknown) => fmtMoney(v),
    sorter: (a, b) => (a.spend ?? 0) - (b.spend ?? 0),
    defaultSortOrder: 'descend',
  },
  {
    title: '销售额',
    dataIndex: 'utmSales',
    key: 'utmSales',
    width: 100,
    render: (v: unknown) => fmtMoney(v),
    sorter: (a, b) => (a.utmSales ?? 0) - (b.utmSales ?? 0),
  },
  {
    title: '客单价',
    key: 'aov',
    width: 90,
    render: (_: unknown, r: any) => fmtAov(r.utmSales, r.utmOrders),
    sorter: (a, b) => (a.aov ?? 0) - (b.aov ?? 0),
  },
  {
    title: 'CPC',
    key: 'cpc',
    width: 90,
    render: (_: unknown, r: any) => fmtCostPerUv(r.spend, r.utmUv),
    sorter: (a, b) => (a.cpc ?? 0) - (b.cpc ?? 0),
  },
  {
    title: '单次加购费用',
    key: 'costPerAddToCart',
    width: 110,
    render: (_: unknown, r: any) => fmtDerivedCost(r.costPerAddToCart, r.spend, r.utmAddToCart),
    sorter: (a, b) => (a.costPerAddToCart ?? 0) - (b.costPerAddToCart ?? 0),
  },
  {
    title: '单次结账费用',
    key: 'costPerInitiateCheckout',
    width: 110,
    render: (_: unknown, r: any) =>
      fmtDerivedCost(r.costPerInitiateCheckout, r.spend, r.utmBeginCheckout),
    sorter: (a, b) => (a.costPerInitiateCheckout ?? 0) - (b.costPerInitiateCheckout ?? 0),
  },
  {
    title: '单次成效花费',
    key: 'costPerOrder',
    width: 110,
    render: (_: unknown, r: any) => fmtCostPerOrder(r.spend, r.utmOrders),
    sorter: (a, b) => (a.costPerOrder ?? 0) - (b.costPerOrder ?? 0),
  },
];

export const TopPerformersTable: React.FC<TopPerformersTableProps> = ({
  title,
  data,
  loading = false,
  type,
}) => {
  const isAccount = type === 'account';
  const columns = isAccount ? accountColumns : campaignColumns;

  return (
    <Card title={title}>
      <Table
        columns={columns}
        dataSource={data}
        rowKey={isAccount ? 'accountId' : 'id'}
        loading={loading}
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={isAccount ? { x: 'max-content' } : { x: 900 }}
        locale={{ emptyText: '暂无数据' }}
      />
    </Card>
  );
};
