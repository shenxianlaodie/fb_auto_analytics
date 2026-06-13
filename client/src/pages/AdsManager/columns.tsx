import React from 'react';
import { Button, Image, Input, Space, Switch, Tag, Typography } from 'antd';
import { CaretDownOutlined, CaretRightOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  UtmAggMetrics, aggregateAdsMetrics, adsForAdset, adsForCampaign,
  cmpNum, cmpStr, fmtCostPerCount, fmtCostPerOrder, fmtCostPerUv, fmtOrders, fmtRoas,
  formatBudgetUsd, getBudgetKind, ownStatusOf, parseBudget, renderDeliveryStatusCell,
  usdToCents, type BudgetKind,
} from './helpers';
import { NameCell } from './NameCell';
import type { Level } from '../../store/adsManagerStore';

export interface ColumnsCtx {
  allAds: any[];
  editingBudget: { id: string; type: string } | null;
  setEditingBudget: (v: { id: string; type: string } | null) => void;
  onUpdateBudget: (type: 'campaign' | 'adset', id: string, budgetCents: number, kind: BudgetKind) => void;
  onToggleStatus: (level: Level, id: string, current: string) => void;
  onRename: (level: Level, id: string, name: string) => Promise<void>;
  onCopy: (level: Level, record: any) => void;
  onEdit: (level: Level, record: any) => void;
  onCreateChild: (level: 'adset' | 'ad', parentId: string) => void;
  onDrillIn?: (level: 'campaign' | 'adset', record: any) => void;
  timeBreakdown?: 'none' | 'day';
  expandedKeys?: string[];
  onToggleExpand?: (id: string) => void;
}

// --- 通用列 ---

/** 按日细分展开列（置于名称列左侧，与 FB 广告管理一致） */
function expandCol(ctx: ColumnsCtx): any | null {
  if (ctx.timeBreakdown !== 'day') return null;
  return {
    title: '',
    key: '_expand',
    width: 40,
    fixed: 'left' as const,
    className: 'ads-daily-expand-col',
    render: (_: any, r: any) => {
      if (r._isDailyRow) return null;
      const expanded = ctx.expandedKeys?.includes(r.id);
      return (
        <Button
          type="text"
          size="small"
          aria-label={expanded ? '收起按日明细' : '展开按日明细'}
          icon={expanded ? <CaretDownOutlined style={{ fontSize: 12 }} /> : <CaretRightOutlined style={{ fontSize: 12 }} />}
          onClick={(e) => {
            e.stopPropagation();
            ctx.onToggleExpand?.(r.id);
          }}
          style={{ width: 28, minWidth: 28, height: 28, padding: 0, color: '#595959' }}
        />
      );
    },
  };
}

function nameCol(
  ctx: ColumnsCtx,
  level: Level,
  title: string,
  drillable = false,
): any {
  return {
    title, dataIndex: 'name', key: 'name', width: 220, fixed: 'left' as const,
    sorter: (a: any, b: any) => {
      if (a._isDailyRow || b._isDailyRow) return 0;
      return cmpStr(a.name, b.name);
    },
    render: (_: any, r: any) => {
      if (r._isDailyRow) {
        return (
          <Typography.Text type="secondary" style={{ paddingLeft: 8 }}>
            {r._date || r.name}
          </Typography.Text>
        );
      }
      return (
        <NameCell
          name={r.name}
          drillable={drillable}
          onDrillIn={
            drillable && ctx.onDrillIn
              ? () => ctx.onDrillIn!(level as 'campaign' | 'adset', r)
              : undefined
          }
          onRename={(newName) => ctx.onRename(level, r.id, newName)}
          onCopy={() => ctx.onCopy(level, r)}
        />
      );
    },
  };
}

function prependExpandCol(ctx: ColumnsCtx, cols: any[]): any[] {
  const col = expandCol(ctx);
  const base = col ? [col, ...cols] : cols;
  if (ctx.timeBreakdown === 'day') {
    return base.map((c) => {
      const { sorter, defaultSortOrder, ...rest } = c;
      return rest;
    });
  }
  return base;
}

function switchCol(ctx: ColumnsCtx, level: Level): any {
  return {
    title: '开/关', key: 'toggle', width: 64,
    render: (_: any, r: any) => {
      if (r._isDailyRow) return null;
      return (
        <Switch
          size="small"
          checked={ownStatusOf(r) === 'ACTIVE'}
          onChange={() => ctx.onToggleStatus(level, r.id, ownStatusOf(r))}
          checkedChildren="开" unCheckedChildren="关"
        />
      );
    },
  };
}

function statusCol(level: Level): any {
  return {
    title: '投放状态', dataIndex: 'status', key: 'status', width: 110,
    sorter: (a: any, b: any) => {
      if (a._isDailyRow || b._isDailyRow) return 0;
      return cmpStr(a.status, b.status);
    },
    render: (_: string, record: any) => {
      if (record._isDailyRow) return null;
      return renderDeliveryStatusCell(record, level);
    },
  };
}

function budgetCol(ctx: ColumnsCtx, type: 'campaign' | 'adset', title: string): any {
  return {
    title, key: 'budget', width: 100,
    sorter: (a: any, b: any) => {
      if (a._isDailyRow || b._isDailyRow) return 0;
      return cmpNum(parseBudget(a), parseBudget(b));
    },
    render: (_: any, r: any) => {
      if (r._isDailyRow) return null;
      const budget = parseBudget(r);
      const kind = getBudgetKind(r);
      if (ctx.editingBudget?.id === r.id && ctx.editingBudget?.type === type) {
        const commit = (raw: string) => {
          const v = parseFloat(raw);
          if (Number.isFinite(v) && v > 0) {
            ctx.onUpdateBudget(type, r.id, usdToCents(v), kind);
          } else {
            ctx.setEditingBudget(null);
          }
        };
        return (
          <Input
            autoFocus size="small" type="number" step="0.01" min="0.01"
            defaultValue={budget > 0 ? budget.toFixed(2) : ''} style={{ width: 88 }}
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
          {formatBudgetUsd(budget)}
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
    render: (_: any, r: any) => {
      const v = Number(r.spend);
      if (r._isDailyRow && (!v || v <= 0)) return '-';
      return r.spend != null && !isNaN(r.spend) ? `$${v.toFixed(2)}` : '-';
    },
  };
}

function cpmCol(): any {
  return {
    title: 'CPM', key: 'cpm', width: 80,
    sorter: (a: any, b: any) => cmpNum(Number(a.cpm) || 0, Number(b.cpm) || 0),
    render: (_: any, r: any) => {
      const v = Number(r.cpm);
      if (r._isDailyRow && (!v || v <= 0)) return '-';
      return r.cpm != null && !isNaN(r.cpm) ? `$${v.toFixed(2)}` : '-';
    },
  };
}

function idCol(title: string): any {
  return {
    title, dataIndex: 'id', key: 'id', width: 160, ellipsis: true,
    sorter: (a: any, b: any) => {
      if (a._isDailyRow || b._isDailyRow) return 0;
      return cmpStr(a.id, b.id);
    },
    render: (id: string, r: any) => (r._isDailyRow ? null : id),
  };
}

/** 系列/组层 UTM 聚合指标列（聚合子广告；单日行直接读字段） */
function aggMetricCols(childAdsOf: (r: any) => any[]): any[] {
  const metricsOf = (r: any): UtmAggMetrics => {
    if (r._isDailyRow) {
      return {
        spend: Number(r.spend) || 0,
        utmUv: Number(r.utmUv) || 0,
        utmOrders: Number(r.utmOrders) || 0,
        utmSales: Number(r.utmSales) || 0,
        utmAddToCart: Number(r.utmAddToCart) || 0,
        utmBeginCheckout: Number(r.utmBeginCheckout) || 0,
      };
    }
    return aggregateAdsMetrics(childAdsOf(r));
  };
  const col = (
    title: string, key: string, width: number,
    value: (m: UtmAggMetrics) => number,
    text: (m: UtmAggMetrics, r?: any) => string,
  ): any => ({
    title, key, width,
    sorter: (a: any, b: any) => {
      if (a._isDailyRow || b._isDailyRow) return 0;
      return cmpNum(value(metricsOf(a)), value(metricsOf(b)));
    },
    render: (_: any, r: any) => {
      const m = metricsOf(r);
      if (r._isDailyRow && value(m) <= 0) return '-';
      return text(m, r);
    },
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
      if (a._isDailyRow || b._isDailyRow) return 0;
      const va = den(a) > 0 ? num(a) / den(a) : -1;
      const vb = den(b) > 0 ? num(b) / den(b) : -1;
      return cmpNum(va, vb);
    };
  const spend = (r: any) => Number(r.spend) || 0;
  const dashIfEmpty = (r: any, v: number | string) => {
    if (r._isDailyRow && (v === '-' || v === 0 || v === '0')) return '-';
    return v;
  };
  return [
    {
      title: '成效', dataIndex: 'utmOrders', key: 'utmOrders', width: 70,
      sorter: (a: any, b: any) => {
        if (a._isDailyRow || b._isDailyRow) return 0;
        return cmpNum(Number(a.utmOrders) || 0, Number(b.utmOrders) || 0);
      },
      render: (_: any, r: any) => dashIfEmpty(r, fmtOrders(Number(r.utmOrders) || 0)),
    },
    {
      title: '单次成效\n花费', key: 'purchases', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmOrders) || 0),
      render: (_: any, r: any) => dashIfEmpty(r, fmtCostPerOrder(spend(r), Number(r.utmOrders) || 0)),
    },
    {
      title: '单次连接\n点击花费', key: 'uniqueClicks', width: 100,
      sorter: ratio(spend, (r) => Number(r.utmUv) || 0),
      render: (_: any, r: any) => dashIfEmpty(r, fmtCostPerUv(spend(r), Number(r.utmUv) || 0)),
    },
    {
      title: '单次加购\n费用', key: 'costPerAddToCart', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmAddToCart) || 0),
      render: (_: any, r: any) => dashIfEmpty(r, fmtCostPerCount(spend(r), Number(r.utmAddToCart) || 0)),
    },
    {
      title: '单次结账\n费用', key: 'costPerInitiateCheckout', width: 90,
      sorter: ratio(spend, (r) => Number(r.utmBeginCheckout) || 0),
      render: (_: any, r: any) => dashIfEmpty(r, fmtCostPerCount(spend(r), Number(r.utmBeginCheckout) || 0)),
    },
    {
      title: 'ROAS', key: 'costPerPurchase', width: 90,
      sorter: ratio((r) => Number(r.utmSales) || 0, spend),
      render: (_: any, r: any) => dashIfEmpty(r, fmtRoas(Number(r.utmSales) || 0, spend(r))),
    },
  ];
}

// --- 三层列构建 ---

export function buildCampaignColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return prependExpandCol(ctx, [
    nameCol(ctx, 'campaign', '广告系列名', true),
    switchCol(ctx, 'campaign'),
    statusCol('campaign'),
    budgetCol(ctx, 'campaign', '预算'),
    ...aggMetricCols((r) => adsForCampaign(r.id, ctx.allAds)),
    spendCol(),
    cpmCol(),
    idCol('广告编号'),
    {
      title: '操作', key: 'actions', width: 160, fixed: 'right' as const,
      render: (_: any, record: any) => {
        if (record._isDailyRow) return null;
        return (
          <Space size="small">
            <Button size="small" type="link" onClick={() => ctx.onCreateChild('adset', record.id)}>+广告组</Button>
            <Button size="small" type="link" icon={<EditOutlined />}
              onClick={() => ctx.onEdit('campaign', record)}>编辑</Button>
          </Space>
        );
      },
    },
  ]);
}

export function buildAdsetColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return prependExpandCol(ctx, [
    nameCol(ctx, 'adset', '广告组名称', true),
    switchCol(ctx, 'adset'),
    statusCol('adset'),
    budgetCol(ctx, 'adset', '日预算'),
    ...aggMetricCols((r) => adsForAdset(r.id, ctx.allAds)),
    spendCol(),
    cpmCol(),
    idCol('广告组编号'),
    {
      title: '操作', key: 'actions', width: 150, fixed: 'right' as const,
      render: (_: any, record: any) => {
        if (record._isDailyRow) return null;
        return (
          <Space size="small">
            <Button size="small" type="link" onClick={() => ctx.onCreateChild('ad', record.id)}>+广告</Button>
            <Button size="small" type="link" icon={<EditOutlined />}
              onClick={() => ctx.onEdit('adset', record)}>编辑</Button>
          </Space>
        );
      },
    },
  ]);
}

export function buildAdColumns(ctx: ColumnsCtx): ColumnsType<any> {
  return prependExpandCol(ctx, [
    nameCol(ctx, 'ad', '广告名称'),
    switchCol(ctx, 'ad'),
    {
      title: '创意', dataIndex: 'creative', key: 'creative', width: 70,
      render: (c: any, r: any) => {
        if (r._isDailyRow) return null;
        return c?.thumbnail_url
          ? <Image src={c.thumbnail_url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
          : <Tag>无</Tag>;
      },
    },
    {
      title: '活动关键词', dataIndex: 'utmCampaign', key: 'utmCampaign', width: 140, ellipsis: true,
      render: (v: string | null, r: any) => (r._isDailyRow ? null : (v || '-')),
    },
    statusCol('ad'),
    spendCol(),
    cpmCol(),
    ...adMetricCols(),
    idCol('广告编号'),
    {
      title: '操作', key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: any, record: any) => {
        if (record._isDailyRow) return null;
        return (
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => ctx.onEdit('ad', record)}>编辑</Button>
        );
      },
    },
  ]);
}
