import React from 'react';
import { Button, Image, Input, Space, Switch, Tag } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  UtmAggMetrics, aggregateAdsMetrics, adsForAdset, adsForCampaign,
  cmpNum, cmpStr, fmtCostPerCount, fmtCostPerOrder, fmtCostPerUv, fmtOrders, fmtRoas,
  ownStatusOf, parseBudget, renderDeliveryStatusCell,
} from './helpers';
import { NameCell } from './NameCell';
import type { Level } from '../../store/adsManagerStore';

export interface ColumnsCtx {
  allAds: any[];
  editingBudget: { id: string; type: string } | null;
  setEditingBudget: (v: { id: string; type: string } | null) => void;
  onUpdateBudget: (type: 'campaign' | 'adset', id: string, budgetCents: number) => void;
  onToggleStatus: (level: Level, id: string, current: string) => void;
  onRename: (level: Level, id: string, name: string) => Promise<void>;
  onCopy: (level: Level, record: any) => void;
  onEdit: (level: Level, record: any) => void;
  onCreateChild: (level: 'adset' | 'ad', parentId: string) => void;
}

// --- 通用列 ---

function nameCol(ctx: ColumnsCtx, level: Level, title: string): any {
  return {
    title, dataIndex: 'name', key: 'name', width: 220, fixed: 'left' as const,
    sorter: (a: any, b: any) => cmpStr(a.name, b.name),
    render: (_: any, r: any) => (
      <NameCell
        name={r.name}
        onRename={(newName) => ctx.onRename(level, r.id, newName)}
        onCopy={() => ctx.onCopy(level, r)}
      />
    ),
  };
}

function switchCol(ctx: ColumnsCtx, level: Level): any {
  return {
    title: '开/关', key: 'toggle', width: 64,
    render: (_: any, r: any) => (
      <Switch
        size="small"
        checked={ownStatusOf(r) === 'ACTIVE'}
        onChange={() => ctx.onToggleStatus(level, r.id, ownStatusOf(r))}
        checkedChildren="开" unCheckedChildren="关"
      />
    ),
  };
}

function statusCol(level: Level): any {
  return {
    title: '投放状态', dataIndex: 'status', key: 'status', width: 110,
    sorter: (a: any, b: any) => cmpStr(a.status, b.status),
    render: (_: string, record: any) => renderDeliveryStatusCell(record, level),
  };
}

function budgetCol(ctx: ColumnsCtx, type: 'campaign' | 'adset', title: string): any {
  return {
    title, key: 'budget', width: 100,
    sorter: (a: any, b: any) => cmpNum(parseBudget(a), parseBudget(b)),
    render: (_: any, r: any) => {
      const budget = parseBudget(r);
      if (ctx.editingBudget?.id === r.id && ctx.editingBudget?.type === type) {
        const commit = (raw: string) => {
          const v = parseInt(raw, 10);
          if (v > 0) ctx.onUpdateBudget(type, r.id, v);
          else ctx.setEditingBudget(null);
        };
        return (
          <Input
            autoFocus size="small" type="number" defaultValue={budget} style={{ width: 80 }}
            onBlur={(e) => commit(e.target.value)}
            onPressEnter={(e: any) => commit(e.target.value)}
          />
        );
      }
      return (
        <span
          style={{ cursor: 'pointer' }}
          onDoubleClick={() => ctx.setEditingBudget({ id: r.id, type })}
          title="双击编辑预算"
        >
          {budget > 0 ? `$${budget.toFixed(0)}` : '-'}
        </span>
      );
    },
  };
}

function spendCol(): any {
  return {
    title: '已花费\n金额', key: 'spend', width: 90,
    defaultSortOrder: 'descend' as const,
    sorter: (a: any, b: any) => cmpNum(Number(a.spend) || 0, Number(b.spend) || 0),
    render: (_: any, r: any) =>
      r.spend != null && !isNaN(r.spend) ? `$${Number(r.spend).toFixed(2)}` : '-',
  };
}

function cpmCol(): any {
  return {
    title: 'CPM', key: 'cpm', width: 80,
    sorter: (a: any, b: any) => cmpNum(Number(a.cpm) || 0, Number(b.cpm) || 0),
    render: (_: any, r: any) =>
      r.cpm != null && !isNaN(r.cpm) ? `$${Number(r.cpm).toFixed(2)}` : '-',
  };
}

function idCol(title: string): any {
  return {
    title, dataIndex: 'id', key: 'id', width: 160, ellipsis: true,
    sorter: (a: any, b: any) => cmpStr(a.id, b.id),
  };
}

/** 系列/组层 UTM 聚合指标列（聚合子广告） */
function aggMetricCols(childAdsOf: (r: any) => any[]): any[] {
  const col = (
    title: string, key: string, width: number,
    value: (m: UtmAggMetrics) => number,
    text: (m: UtmAggMetrics) => string,
  ): any => ({
    title, key, width,
    sorter: (a: any, b: any) =>
      cmpNum(value(aggregateAdsMetrics(childAdsOf(a))), value(aggregateAdsMetrics(childAdsOf(b)))),
    render: (_: any, r: any) => text(aggregateAdsMetrics(childAdsOf(r))),
  });
  return [
    col('成效', 'utmOrders', 70, (m) => m.utmOrders, (m) => fmtOrders(m.utmOrders)),
    col('单次成效\n花费', 'purchases', 90,
      (m) => (m.utmOrders > 0 ? m.spend / m.utmOrders : -1),
      (m) => fmtCostPerOrder(m.spend, m.utmOrders)),
    col('单次连接\n点击花费', 'uniqueClicks', 100,
      (m) => (m.utmUv > 0 ? m.spend / m.utmUv : -1),
      (m) => fmtCostPerUv(m.spend, m.utmUv)),
    col('单次加购\n费用', 'costPerAddToCart', 90,
      (m) => (m.utmAddToCart > 0 ? m.spend / m.utmAddToCart : -1),
      (m) => fmtCostPerCount(m.spend, m.utmAddToCart)),
    col('单次结账\n费用', 'costPerInitiateCheckout', 90,
      (m) => (m.utmBeginCheckout > 0 ? m.spend / m.utmBeginCheckout : -1),
      (m) => fmtCostPerCount(m.spend, m.utmBeginCheckout)),
    col('ROAS', 'costPerPurchase', 90,
      (m) => (m.spend > 0 ? m.utmSales / m.spend : -1),
      (m) => fmtRoas(m.utmSales, m.spend)),
  ];
}

/** 广告层直接字段指标列 */
function adMetricCols(): any[] {
  const ratio = (num: (r: any) => number, den: (r: any) => number) =>
    (a: any, b: any) => {
      const va = den(a) > 0 ? num(a) / den(a) : -1;
      const vb = den(b) > 0 ? num(b) / den(b) : -1;
      return cmpNum(va, vb);
    };
  const spend = (r: any) => Number(r.spend) || 0;
  return [
    {
      title: '成效', dataIndex: 'utmOrders', key: 'utmOrders', width: 70,
      sorter: (a: any, b: any) => cmpNum(Number(a.utmOrders) || 0, Number(b.utmOrders) || 0),
      render: (_: any, r: any) => fmtOrders(Number(r.utmOrders) || 0),
    },
    {
      title: '单次成效\n花费', key: 'purchases', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmOrders) || 0),
      render: (_: any, r: any) => fmtCostPerOrder(spend(r), Number(r.utmOrders) || 0),
    },
    {
      title: '单次连接\n点击花费', key: 'uniqueClicks', width: 100,
      sorter: ratio(spend, (r) => Number(r.utmUv) || 0),
      render: (_: any, r: any) => fmtCostPerUv(spend(r), Number(r.utmUv) || 0),
    },
    {
      title: '单次加购\n费用', key: 'costPerAddToCart', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmAddToCart) || 0),
      render: (_: any, r: any) => fmtCostPerCount(spend(r), Number(r.utmAddToCart) || 0),
    },
    {
      title: '单次结账\n费用', key: 'costPerInitiateCheckout', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmBeginCheckout) || 0),
      render: (_: any, r: any) => fmtCostPerCount(spend(r), Number(r.utmBeginCheckout) || 0),
    },
    {
      title: 'ROAS', key: 'costPerPurchase', width: 90,
      sorter: ratio((r) => Number(r.utmSales) || 0, spend),
      render: (_: any, r: any) => fmtRoas(Number(r.utmSales) || 0, spend(r)),
    },
  ];
}

// --- 三层列构建 ---

export function buildCampaignColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return [
    nameCol(ctx, 'campaign', '广告系列名'),
    switchCol(ctx, 'campaign'),
    statusCol('campaign'),
    budgetCol(ctx, 'campaign', '预算'),
    ...aggMetricCols((r) => adsForCampaign(r.id, ctx.allAds)),
    spendCol(),
    cpmCol(),
    idCol('广告编号'),
    {
      title: '操作', key: 'actions', width: 160, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => ctx.onCreateChild('adset', record.id)}>+广告组</Button>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => ctx.onEdit('campaign', record)}>编辑</Button>
        </Space>
      ),
    },
  ];
}

export function buildAdsetColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return [
    nameCol(ctx, 'adset', '广告组名称'),
    switchCol(ctx, 'adset'),
    statusCol('adset'),
    budgetCol(ctx, 'adset', '日预算'),
    ...aggMetricCols((r) => adsForAdset(r.id, ctx.allAds)),
    spendCol(),
    cpmCol(),
    idCol('广告组编号'),
    {
      title: '操作', key: 'actions', width: 150, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => ctx.onCreateChild('ad', record.id)}>+广告</Button>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => ctx.onEdit('adset', record)}>编辑</Button>
        </Space>
      ),
    },
  ];
}

export function buildAdColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return [
    nameCol(ctx, 'ad', '广告名称'),
    switchCol(ctx, 'ad'),
    {
      title: '创意', dataIndex: 'creative', key: 'creative', width: 70,
      render: (c: any) =>
        c?.thumbnail_url
          ? <Image src={c.thumbnail_url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
          : <Tag>无</Tag>,
    },
    {
      title: '活动关键词', dataIndex: 'utmCampaign', key: 'utmCampaign', width: 140, ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    statusCol('ad'),
    spendCol(),
    cpmCol(),
    ...adMetricCols(),
    idCol('广告编号'),
    {
      title: '操作', key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Button size="small" type="link" icon={<EditOutlined />}
          onClick={() => ctx.onEdit('ad', record)}>编辑</Button>
      ),
    },
  ];
}
