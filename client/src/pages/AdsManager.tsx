import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Switch, Space, Tag,
  Typography, message, Image, DatePicker, Alert,
} from 'antd';
import dayjs from 'dayjs';
import {
  PlusOutlined, ReloadOutlined, EditOutlined,
  RightOutlined, DownOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';
import { FBCampaign, FBAdSet, FBAd } from '../types/facebook';
import { EmptyState } from '../components/Common/EmptyState';
import { ColumnOrderSettings } from '../components/AdsManager/ColumnOrderSettings';
import { useColumnOrderStore } from '../store/columnOrderStore';
import { useUIStore } from '../store/uiStore';
import { applyColumnOrder } from '../utils/columnOrder';

const { RangePicker } = DatePicker;

const { Title } = Typography;

interface UtmAggMetrics {
  spend: number;
  utmUv: number;
  utmOrders: number;
  utmSales: number;
  utmAddToCart: number;
  utmBeginCheckout: number;
}

function aggregateAdsMetrics(ads: any[]): UtmAggMetrics {
  let spend = 0;
  let utmUv = 0;
  let utmOrders = 0;
  let utmSales = 0;
  let utmAddToCart = 0;
  let utmBeginCheckout = 0;
  for (const ad of ads) {
    spend += Number(ad.spend) || 0;
    utmUv += Number(ad.utmUv) || 0;
    utmOrders += Number(ad.utmOrders) || 0;
    utmSales += Number(ad.utmSales) || 0;
    utmAddToCart += Number(ad.utmAddToCart) || 0;
    utmBeginCheckout += Number(ad.utmBeginCheckout) || 0;
  }
  return { spend, utmUv, utmOrders, utmSales, utmAddToCart, utmBeginCheckout };
}

function fmtCostPerUv(spend: number, uv: number): string {
  if (!uv || uv <= 0) return '-';
  return `$${(spend / uv).toFixed(2)}`;
}

function fmtCostPerOrder(spend: number, orders: number): string {
  if (!orders || orders <= 0) return '-';
  return `$${(spend / orders).toFixed(2)}`;
}

function fmtCostPerCount(spend: number, count: number): string {
  if (!count || count <= 0) return '-';
  return `$${(spend / count).toFixed(2)}`;
}

function fmtRoas(sales: number, spend: number): string {
  if (!spend || spend <= 0) return '-';
  return (sales / spend).toFixed(2);
}

function fmtOrders(orders: number): string {
  const n = Number(orders) || 0;
  return n > 0 ? String(n) : '-';
}

function cmpStr(a: string, b: string): number {
  return (a || '').localeCompare(b || '', 'zh-CN');
}

function cmpNum(a: number, b: number): number {
  return (a || 0) - (b || 0);
}

function parseBudget(r: { daily_budget?: string; lifetime_budget?: string }): number {
  const b = r.daily_budget || r.lifetime_budget;
  return b ? parseInt(b, 10) / 100 : 0;
}

function adsForCampaign(campaignId: string, ads: any[]): any[] {
  return ads.filter((a) => (a.campaignId || a.campaign_id) === campaignId);
}

function adsForAdset(adsetId: string, ads: any[]): any[] {
  return ads.filter((a) => (a.adsetId || a.adset_id) === adsetId);
}

function renderStatusTag(status: string, level: 'campaign' | 'adset' | 'ad' = 'ad') {
  const pausedLabel = level === 'campaign' ? '已暂停' : '暂停';
  return (
    <Tag color={status === 'ACTIVE' ? 'green' : status === 'PAUSED' ? 'orange' : 'default'}>
      {status === 'ACTIVE' ? '投放中' : status === 'PAUSED' ? pausedLabel : status}
    </Tag>
  );
}

function filterHierarchy(
  campaigns: any[],
  adsets: FBAdSet[],
  ads: FBAd[],
  searchAdId: string,
  searchName: string,
) {
  const adIdQ = searchAdId.trim().toLowerCase();
  const nameQ = searchName.trim().toLowerCase();

  if (!adIdQ && !nameQ) {
    return {
      campaigns,
      adsets,
      ads,
      expandCampaignIds: [] as string[],
      expandAdsetIds: [] as string[],
    };
  }

  const campaignIds = new Set<string>();
  const adsetIds = new Set<string>();
  const adIds = new Set<string>();

  for (const c of campaigns) {
    const cid = c.id;
    const campaignNameMatch = nameQ && (c.name || '').toLowerCase().includes(nameQ);
    const childAdsets = adsets.filter((a) => ((a as any).campaignId || a.campaign_id) === cid);

    if (campaignNameMatch) {
      campaignIds.add(cid);
      childAdsets.forEach((a) => adsetIds.add(a.id));
      adsForCampaign(cid, ads).forEach((a) => adIds.add(a.id));
      continue;
    }

    for (const adset of childAdsets) {
      const asid = adset.id;
      const adsetNameMatch = nameQ && (adset.name || '').toLowerCase().includes(nameQ);
      const adsInSet = adsForAdset(asid, ads);

      if (adsetNameMatch) {
        campaignIds.add(cid);
        adsetIds.add(asid);
        adsInSet.forEach((a) => adIds.add(a.id));
        continue;
      }

      for (const ad of adsInSet) {
        const adIdMatch = adIdQ && String(ad.id).toLowerCase() === adIdQ;
        const adNameMatch = nameQ && (ad.name || '').toLowerCase().includes(nameQ);
        if (adIdMatch || adNameMatch) {
          campaignIds.add(cid);
          adsetIds.add(asid);
          adIds.add(ad.id);
        }
      }
    }
  }

  return {
    campaigns: campaigns.filter((c) => campaignIds.has(c.id)),
    adsets: adsets.filter((a) => adsetIds.has(a.id)),
    ads: ads.filter((a) => adIds.has(a.id)),
    expandCampaignIds: [...campaignIds],
    expandAdsetIds: [...adsetIds],
  };
}

interface SyncMeta {
  structureSyncedAt: string | null;
  metricsSyncedAt: string | null;
  utmSyncedAt: string | null;
  refreshing: boolean;
  dateStart?: string;
  dateEnd?: string;
  timezone?: string;
  syncWarnings?: string[];
  spendSummary?: {
    totalSpend: number;
    adsWithSpend: number;
    totalAds: number;
    campaignsWithSpend: number;
    totalCampaigns: number;
  };
}

const OBJECTIVES: Record<string, string> = {
  OUTCOME_TRAFFIC: '流量',
  OUTCOME_SALES: '转化',
  OUTCOME_AWARENESS: '品牌认知',
  OUTCOME_ENGAGEMENT: '互动',
  OUTCOME_LEADS: '潜在客户',
  OUTCOME_APP_PROMOTION: '应用推广',
};

export const AdsManager: React.FC = () => {
  const { accountId, accountName } = useAccountStore();
  const { dateRange, setDateRange } = useUIStore();
  const campaignColumnOrder = useColumnOrderStore((s) => s.orders.campaign);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [allAdSets, setAllAdSets] = useState<FBAdSet[]>([]);
  const [allAds, setAllAds] = useState<FBAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null);
  const loadedRef = useRef(false);
  const dateRef = useRef(`${dateRange[0]}~${dateRange[1]}`);
  const readPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getDateRange = () => ({ dateStart: dateRange[0], dateEnd: dateRange[1] });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'campaign' | 'adset' | 'ad'>('campaign');
  const [parentId, setParentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [searchAdId, setSearchAdId] = useState('');
  const [searchName, setSearchName] = useState('');

  const filtered = useMemo(
    () => filterHierarchy(campaigns, allAdSets, allAds, searchAdId, searchName),
    [campaigns, allAdSets, allAds, searchAdId, searchName],
  );
  const searchActive = !!(searchAdId.trim() || searchName.trim());
  const displayCampaigns = useMemo(
    () => [...filtered.campaigns].sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0)),
    [filtered.campaigns],
  );
  const displayAdsets = filtered.adsets;
  const displayAds = filtered.ads;

  const applyHierarchy = (data: any) => {
    setCampaigns(data.campaigns || []);
    setAllAdSets(data.adsets || []);
    setAllAds(data.ads || []);
    if (data.meta) setSyncMeta(data.meta);
  };

  const loadHierarchy = useCallback(async () => {
    if (!accountId) return;
    const { dateStart, dateEnd } = getDateRange();

    const resp = await api.get('/analytics/hierarchy', {
      params: { accountId, accountName, dateStart, dateEnd },
    });
    applyHierarchy(resp.data);
  }, [accountId, accountName, dateRange]);

  const fetchAll = useCallback(async () => {
    if (!accountId || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);

    try {
      await loadHierarchy();
    } catch (err: any) {
      console.error('Hierarchy load failed:', err);
      message.warning(err.response?.data?.error || '加载数据失败');
    }

    setLoading(false);
  }, [accountId, loadHierarchy]);

  useEffect(() => {
    if (!accountId) return;
    setCampaigns([]);
    setAllAdSets([]);
    setAllAds([]);
    setSyncMeta(null);
    loadedRef.current = false;
    dateRef.current = `${dateRange[0]}~${dateRange[1]}`;
    if (readPollRef.current) {
      clearInterval(readPollRef.current);
      readPollRef.current = null;
    }
    fetchAll();
    return () => {
      if (readPollRef.current) clearInterval(readPollRef.current);
    };
  }, [accountId, dateRange, fetchAll]);

  useEffect(() => {
    if (!accountId) return;
    readPollRef.current = setInterval(() => {
      loadHierarchy().catch(() => {});
    }, 60_000);
    return () => {
      if (readPollRef.current) {
        clearInterval(readPollRef.current);
        readPollRef.current = null;
      }
    };
  }, [accountId, dateRange, loadHierarchy]);

  // 跨日/换日期时重新加载
  useEffect(() => {
    const key = `${dateRange[0]}~${dateRange[1]}`;
    if (key !== dateRef.current && accountId) {
      dateRef.current = key;
      loadedRef.current = false;
      fetchAll();
    }
  }, [dateRange, accountId, fetchAll]);

  // 切回标签页时读库（不触发外部同步）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && accountId) {
        loadHierarchy().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [accountId, loadHierarchy]);

  const refresh = async () => {
    setLoading(true);
    try {
      await loadHierarchy();
      message.success('已从数据库重新加载');
    } catch (err: any) {
      message.warning(err.response?.data?.error || '加载失败');
    }
    setLoading(false);
  };

  // --- Actions ---
  const openCreateModal = (type: 'campaign' | 'adset' | 'ad', parent?: string) => {
    setModalType(type);
    setParentId(parent || null);
    setEditingId(null);
    form.resetFields();
    if (type === 'campaign') {
      form.setFieldsValue({ objective: 'OUTCOME_TRAFFIC', status: 'PAUSED' });
    } else {
      form.setFieldsValue({ status: 'PAUSED' });
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (modalType === 'campaign') {
        if (editingId) {
          await api.put(`/campaigns/${editingId}`, { name: values.name, status: values.status });
        } else {
          await api.post('/campaigns', { accountId, ...values });
        }
      } else if (modalType === 'adset') {
        if (editingId) {
          await api.put(`/adsets/${editingId}`, { name: values.name, status: values.status });
        } else {
          await api.post('/adsets', {
            accountId, campaignId: parentId, name: values.name,
            targeting: { age_min: 18, age_max: 65, geo_locations: { countries: ['US'] } },
            budget: { daily: values.daily_budget || 1000 },
            bidStrategy: 'LOWEST_COST_WITHOUT_CAP', status: values.status,
          });
        }
      } else if (modalType === 'ad') {
        if (editingId) {
          await api.put(`/ads/${editingId}`, { name: values.name, status: values.status });
        } else {
          await api.post('/ads', {
            accountId, adsetId: parentId, name: values.name,
            creative: {
              title: values.headline, body: values.body_text || '',
              imageUrl: values.image_url, linkUrl: values.link,
              callToAction: values.cta || 'SHOP_NOW',
            },
            status: values.status,
          });
        }
      }

      message.success(editingId ? '更新成功' : '创建成功');
      setModalOpen(false);
      loadedRef.current = false;
      fetchAll();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (type: string, id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      const endpoints: Record<string, string> = { campaign: `/campaigns/${id}`, adset: `/adsets/${id}`, ad: `/ads/${id}` };
      await api.put(endpoints[type], { status: newStatus });
      message.success(newStatus === 'ACTIVE' ? '已开启' : '已暂停');
      loadedRef.current = false;
      fetchAll();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '操作失败');
    }
  };

  const [editingBudget, setEditingBudget] = useState<{ id: string; type: string; current: number } | null>(null);

  const handleUpdateBudget = async (type: string, id: string, budgetCents: number) => {
    try {
      const endpoints: Record<string, string> = { campaign: `/campaigns/${id}`, adset: `/adsets/${id}` };
      await api.put(endpoints[type], { budget: { daily: budgetCents } });
      message.success('预算已更新');
      loadedRef.current = false;
      fetchAll();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '预算更新失败');
    }
    setEditingBudget(null);
  };

  const handleEdit = (type: 'campaign' | 'adset' | 'ad', record: any) => {
    setModalType(type);
    setEditingId(record.id);
    form.resetFields();
    if (type === 'campaign') {
      form.setFieldsValue({ name: record.name, objective: record.objective, status: record.status });
    } else if (type === 'adset') {
      form.setFieldsValue({ name: record.name, status: record.status });
    } else {
      form.setFieldsValue({ name: record.name, status: record.status });
    }
    setModalOpen(true);
  };

  // --- Campaign columns ---
  const campaignColumns: ColumnsType<any> = [
    {
      title: '广告系列名', dataIndex: 'name', key: 'name', width: 180, ellipsis: true, fixed: 'left' as const,
      sorter: (a, b) => cmpStr(a.name, b.name),
    },
    {
      title: '投放状态', dataIndex: 'status', key: 'status', width: 90,
      sorter: (a, b) => cmpStr(a.status, b.status),
      render: (s: string) => renderStatusTag(s, 'campaign'),
    },
    {
      title: '预算', key: 'budget', width: 100,
      sorter: (a, b) => cmpNum(parseBudget(a), parseBudget(b)),
      render: (_: any, r: any) => {
        const budget = parseBudget(r);
        if (editingBudget?.id === r.id && editingBudget?.type === 'campaign') {
          return (
            <Input
              autoFocus
              size="small"
              type="number"
              defaultValue={budget}
              style={{ width: 80 }}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v > 0) handleUpdateBudget('campaign', r.id, v);
                else setEditingBudget(null);
              }}
              onPressEnter={(e: any) => {
                const v = parseInt(e.target.value, 10);
                if (v > 0) handleUpdateBudget('campaign', r.id, v);
                else setEditingBudget(null);
              }}
            />
          );
        }
        return (
          <span
            style={{ cursor: 'pointer' }}
            onDoubleClick={() => setEditingBudget({ id: r.id, type: 'campaign', current: budget })}
            title="双击编辑预算"
          >
            {budget > 0 ? `$${budget.toFixed(0)}` : '-'}
          </span>
        );
      },
    },
    {
      title: '成效', key: 'utmOrders', width: 70,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForCampaign(a.id, displayAds));
        const mb = aggregateAdsMetrics(adsForCampaign(b.id, displayAds));
        return cmpNum(ma.utmOrders, mb.utmOrders);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForCampaign(r.id, displayAds));
        return fmtOrders(m.utmOrders);
      },
    },
    {
      title: '单次成效\n花费', key: 'purchases', width: 90,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForCampaign(a.id, displayAds));
        const mb = aggregateAdsMetrics(adsForCampaign(b.id, displayAds));
        const va = ma.utmOrders > 0 ? ma.spend / ma.utmOrders : -1;
        const vb = mb.utmOrders > 0 ? mb.spend / mb.utmOrders : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForCampaign(r.id, displayAds));
        return fmtCostPerOrder(m.spend, m.utmOrders);
      },
    },
    {
      title: '已花费\n金额', key: 'spend', width: 90,
      defaultSortOrder: 'descend' as const,
      sorter: (a, b) => cmpNum(Number(a.spend) || 0, Number(b.spend) || 0),
      render: (_: any, r: any) => (r.spend != null && !isNaN(r.spend)) ? `$${Number(r.spend).toFixed(2)}` : '-',
    },
    {
      title: 'CPM', key: 'cpm', width: 80,
      sorter: (a, b) => cmpNum(Number(a.cpm) || 0, Number(b.cpm) || 0),
      render: (_: any, r: any) => (r.cpm != null && !isNaN(r.cpm)) ? `$${r.cpm.toFixed(2)}` : '-',
    },
    {
      title: '单次连接\n点击花费', key: 'uniqueClicks', width: 100,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForCampaign(a.id, displayAds));
        const mb = aggregateAdsMetrics(adsForCampaign(b.id, displayAds));
        const va = ma.utmUv > 0 ? ma.spend / ma.utmUv : -1;
        const vb = mb.utmUv > 0 ? mb.spend / mb.utmUv : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForCampaign(r.id, displayAds));
        return fmtCostPerUv(m.spend, m.utmUv);
      },
    },
    {
      title: '单次加购\n费用', key: 'costPerAddToCart', width: 90,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForCampaign(a.id, displayAds));
        const mb = aggregateAdsMetrics(adsForCampaign(b.id, displayAds));
        const va = ma.utmAddToCart > 0 ? ma.spend / ma.utmAddToCart : -1;
        const vb = mb.utmAddToCart > 0 ? mb.spend / mb.utmAddToCart : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForCampaign(r.id, displayAds));
        return fmtCostPerCount(m.spend, m.utmAddToCart);
      },
    },
    {
      title: '单次结账\n费用', key: 'costPerInitiateCheckout', width: 90,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForCampaign(a.id, displayAds));
        const mb = aggregateAdsMetrics(adsForCampaign(b.id, displayAds));
        const va = ma.utmBeginCheckout > 0 ? ma.spend / ma.utmBeginCheckout : -1;
        const vb = mb.utmBeginCheckout > 0 ? mb.spend / mb.utmBeginCheckout : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForCampaign(r.id, displayAds));
        return fmtCostPerCount(m.spend, m.utmBeginCheckout);
      },
    },
    {
      title: 'ROAS', key: 'costPerPurchase', width: 90,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForCampaign(a.id, displayAds));
        const mb = aggregateAdsMetrics(adsForCampaign(b.id, displayAds));
        const va = ma.spend > 0 ? ma.utmSales / ma.spend : -1;
        const vb = mb.spend > 0 ? mb.utmSales / mb.spend : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForCampaign(r.id, displayAds));
        return fmtRoas(m.utmSales, m.spend);
      },
    },
    {
      title: '广告编号', dataIndex: 'id', key: 'id', width: 160, ellipsis: true,
      sorter: (a, b) => cmpStr(a.id, b.id),
    },
    { title: '操作', key: 'actions', width: 220, fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => openCreateModal('adset', record.id)}>+广告组</Button>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => handleEdit('campaign', record)}>编辑</Button>
          <Switch
            size="small"
            checked={record.status === 'ACTIVE'}
            onChange={() => handleToggleStatus('campaign', record.id, record.status)}
            checkedChildren="开" unCheckedChildren="关"
          />
        </Space>
      ),
    },
  ];

  const orderedCampaignColumns = useMemo(
    () => applyColumnOrder(campaignColumns, campaignColumnOrder),
    [campaignColumns, campaignColumnOrder],
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>📢 广告管理</Title>
        <Space>
          {syncMeta?.refreshing && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>同步中…</Typography.Text>
          )}
          {syncMeta?.spendSummary && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              今日花费 ${syncMeta.spendSummary.totalSpend.toFixed(2)}
              （{syncMeta.spendSummary.adsWithSpend}/{syncMeta.spendSummary.totalAds} 条广告有消耗
              ，{syncMeta.spendSummary.campaignsWithSpend} 个系列）
            </Typography.Text>
          )}
          {syncMeta?.metricsSyncedAt && !syncMeta.refreshing && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              FB {new Date(syncMeta.metricsSyncedAt).toLocaleTimeString()}
              {syncMeta.utmSyncedAt ? ` · UTM ${new Date(syncMeta.utmSyncedAt).toLocaleTimeString()}` : ''}
              {syncMeta.structureSyncedAt ? ` · 结构 ${new Date(syncMeta.structureSyncedAt).toLocaleTimeString()}` : ''}
            </Typography.Text>
          )}
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>刷新</Button>
          <ColumnOrderSettings />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateModal('campaign')}>
            创建广告系列
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <RangePicker
          value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
          onChange={(dates) => {
            if (dates?.[0] && dates?.[1]) {
              setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
            }
          }}
          allowClear={false}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>时区 UTC+8</Typography.Text>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="搜索广告编号（精确匹配）"
          value={searchAdId}
          onChange={(e) => setSearchAdId(e.target.value)}
          style={{ width: 260 }}
        />
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="模糊搜索系列 / 广告组 / 广告名称"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          style={{ width: 320 }}
        />
        {searchActive && (
          <Typography.Text type="secondary" style={{ lineHeight: '32px' }}>
            匹配 {displayCampaigns.length} 个系列 / {displayAdsets.length} 个广告组 / {displayAds.length} 条广告
          </Typography.Text>
        )}
      </div>

      {syncMeta?.syncWarnings && syncMeta.syncWarnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="数据同步提示"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {syncMeta.syncWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      )}

      <Table
        columns={orderedCampaignColumns}
        dataSource={displayCampaigns}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1800 }}
        expandable={{
          expandedRowKeys: searchActive ? filtered.expandCampaignIds : undefined,
          expandIcon: ({ expanded, onExpand, record }) =>
            expanded ? (
              <DownOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 4 }} />
            ) : (
              <RightOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 4 }} />
            ),
          expandedRowRender: (campaign) => {
            const campaignAdSets = displayAdsets.filter((a: any) => (a.campaignId || a.campaign_id) === campaign.id);
            return (
              <AdSetSubTable
                adsets={campaignAdSets}
                allAds={displayAds}
                expandAll={searchActive}
                onEdit={handleEdit}
                onToggleStatus={handleToggleStatus}
                editingBudget={editingBudget}
                setEditingBudget={setEditingBudget}
                handleUpdateBudget={handleUpdateBudget}
                onCreateAd={(adsetId) => openCreateModal('ad', adsetId)}
                onCreateAdSet={() => openCreateModal('adset', campaign.id)}
              />
            );
          },
        }}
        locale={{ emptyText: <EmptyState title="暂无广告系列" description="点击右上角按钮创建" actionText="创建广告系列" onAction={() => openCreateModal('campaign')} /> }}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editingId ? `编辑${modalType === 'campaign' ? '广告系列' : modalType === 'adset' ? '广告组' : '广告'}` : `创建${modalType === 'campaign' ? '广告系列' : modalType === 'adset' ? '广告组' : '广告'}`}
        open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)}
        confirmLoading={submitting} destroyOnHidden width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={100} />
          </Form.Item>
          {modalType === 'campaign' && !editingId && (
            <Form.Item name="objective" label="广告目标">
              <Select options={Object.entries(OBJECTIVES).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
          )}
          {modalType === 'adset' && !editingId && (
            <Form.Item name="daily_budget" label="日预算 (美分)">
              <Input type="number" placeholder="1000 = $10.00" />
            </Form.Item>
          )}
          {modalType === 'ad' && !editingId && (
            <>
              <Form.Item name="headline" label="广告标题" rules={[{ required: true }]}>
                <Input maxLength={40} showCount />
              </Form.Item>
              <Form.Item name="body_text" label="正文">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
              <Form.Item name="image_url" label="图片链接">
                <Input placeholder="https://..." />
              </Form.Item>
              <Form.Item name="link" label="目标链接" rules={[{ required: true }]}>
                <Input placeholder="https://..." />
              </Form.Item>
              <Form.Item name="cta" label="CTA" initialValue="SHOP_NOW">
                <Select options={[
                  { value: 'SHOP_NOW', label: '立即购买' },
                  { value: 'LEARN_MORE', label: '了解更多' },
                  { value: 'SIGN_UP', label: '注册' },
                ]} />
              </Form.Item>
            </>
          )}
          <Form.Item name="status" label="状态">
            <Select options={[
              { value: 'ACTIVE', label: '投放中' },
              { value: 'PAUSED', label: '已暂停' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// --- AdSet list (receives pre-filtered data, no API calls) ---
function AdSetSubTable({
  adsets,
  allAds,
  expandAll,
  onEdit,
  onToggleStatus,
  editingBudget,
  setEditingBudget,
  handleUpdateBudget,
  onCreateAd,
  onCreateAdSet,
}: {
  adsets: any[];
  allAds: any[];
  expandAll?: boolean;
  onEdit: (type: 'adset' | 'ad', record: any) => void;
  onToggleStatus: (type: string, id: string, currentStatus: string) => void;
  editingBudget: { id: string; type: string; current: number } | null;
  setEditingBudget: (v: { id: string; type: string; current: number } | null) => void;
  handleUpdateBudget: (type: string, id: string, budgetCents: number) => void;
  onCreateAd: (adsetId: string) => void;
  onCreateAdSet: () => void;
}) {
  const adsetColumnOrder = useColumnOrderStore((s) => s.orders.adset);
  const adsetColumns: ColumnsType<any> = [
    {
      title: '广告组名称', dataIndex: 'name', key: 'name', width: 160, ellipsis: true, fixed: 'left' as const,
      sorter: (a, b) => cmpStr(a.name, b.name),
    },
    {
      title: '投放状态', dataIndex: 'status', key: 'status', width: 90,
      sorter: (a, b) => cmpStr(a.status, b.status),
      render: (s: string) => renderStatusTag(s, 'adset'),
    },
    {
      title: '日预算', key: 'budget', width: 100,
      sorter: (a, b) => cmpNum(parseBudget(a), parseBudget(b)),
      render: (_: any, r: any) => {
        const b = parseBudget(r);
        if (editingBudget?.id === r.id && editingBudget?.type === 'adset') {
          return (
            <Input
              autoFocus size="small" type="number" defaultValue={b}
              style={{ width: 80 }}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v > 0) handleUpdateBudget('adset', r.id, v);
                else setEditingBudget(null);
              }}
              onPressEnter={(e: any) => {
                const v = parseInt(e.target.value, 10);
                if (v > 0) handleUpdateBudget('adset', r.id, v);
                else setEditingBudget(null);
              }}
            />
          );
        }
        return (
          <span style={{ cursor: 'pointer' }}
            onDoubleClick={() => setEditingBudget({ id: r.id, type: 'adset', current: b })}
            title="双击编辑预算">
            {b > 0 ? `$${b.toFixed(0)}` : '-'}
          </span>
        );
      },
    },
    {
      title: '已花费', key: 'spend', width: 90,
      sorter: (a, b) => cmpNum(Number(a.spend) || 0, Number(b.spend) || 0),
      render: (_: any, r: any) => (r.spend != null && !isNaN(r.spend)) ? `$${r.spend.toFixed(2)}` : '-',
    },
    {
      title: 'CPM', key: 'cpm', width: 80,
      sorter: (a, b) => cmpNum(Number(a.cpm) || 0, Number(b.cpm) || 0),
      render: (_: any, r: any) => (r.cpm != null && !isNaN(r.cpm)) ? `$${r.cpm.toFixed(2)}` : '-',
    },
    {
      title: '单次连接\n点击花费', key: 'uniqueClicks', width: 100,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForAdset(a.id, allAds));
        const mb = aggregateAdsMetrics(adsForAdset(b.id, allAds));
        const va = ma.utmUv > 0 ? ma.spend / ma.utmUv : -1;
        const vb = mb.utmUv > 0 ? mb.spend / mb.utmUv : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForAdset(r.id, allAds));
        return fmtCostPerUv(m.spend, m.utmUv);
      },
    },
    {
      title: '成效', key: 'utmOrders', width: 70,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForAdset(a.id, allAds));
        const mb = aggregateAdsMetrics(adsForAdset(b.id, allAds));
        return cmpNum(ma.utmOrders, mb.utmOrders);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForAdset(r.id, allAds));
        return fmtOrders(m.utmOrders);
      },
    },
    {
      title: '单次成效\n花费', key: 'purchases', width: 90,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForAdset(a.id, allAds));
        const mb = aggregateAdsMetrics(adsForAdset(b.id, allAds));
        const va = ma.utmOrders > 0 ? ma.spend / ma.utmOrders : -1;
        const vb = mb.utmOrders > 0 ? mb.spend / mb.utmOrders : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForAdset(r.id, allAds));
        return fmtCostPerOrder(m.spend, m.utmOrders);
      },
    },
    {
      title: 'ROAS', key: 'costPerPurchase', width: 90,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForAdset(a.id, allAds));
        const mb = aggregateAdsMetrics(adsForAdset(b.id, allAds));
        const va = ma.spend > 0 ? ma.utmSales / ma.spend : -1;
        const vb = mb.spend > 0 ? mb.utmSales / mb.spend : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForAdset(r.id, allAds));
        return fmtRoas(m.utmSales, m.spend);
      },
    },
    {
      title: '单次加购\n费用', key: 'costPerAddToCart', width: 90,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForAdset(a.id, allAds));
        const mb = aggregateAdsMetrics(adsForAdset(b.id, allAds));
        const va = ma.utmAddToCart > 0 ? ma.spend / ma.utmAddToCart : -1;
        const vb = mb.utmAddToCart > 0 ? mb.spend / mb.utmAddToCart : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForAdset(r.id, allAds));
        return fmtCostPerCount(m.spend, m.utmAddToCart);
      },
    },
    {
      title: '单次结账\n费用', key: 'costPerInitiateCheckout', width: 90,
      sorter: (a, b) => {
        const ma = aggregateAdsMetrics(adsForAdset(a.id, allAds));
        const mb = aggregateAdsMetrics(adsForAdset(b.id, allAds));
        const va = ma.utmBeginCheckout > 0 ? ma.spend / ma.utmBeginCheckout : -1;
        const vb = mb.utmBeginCheckout > 0 ? mb.spend / mb.utmBeginCheckout : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => {
        const m = aggregateAdsMetrics(adsForAdset(r.id, allAds));
        return fmtCostPerCount(m.spend, m.utmBeginCheckout);
      },
    },
    {
      title: '广告组编号', dataIndex: 'id', key: 'id', width: 160, ellipsis: true,
      sorter: (a, b) => cmpStr(a.id, b.id),
    },
    { title: '操作', key: 'actions', width: 220, fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => onCreateAd(record.id)}>+广告</Button>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => onEdit('adset', record)}>编辑</Button>
          <Switch
            size="small"
            checked={record.status === 'ACTIVE'}
            onChange={() => onToggleStatus('adset', record.id, record.status)}
            checkedChildren="开" unCheckedChildren="关"
          />
        </Space>
      ),
    },
  ];

  const orderedAdsetColumns = useMemo(
    () => applyColumnOrder(adsetColumns, adsetColumnOrder),
    [adsetColumns, adsetColumnOrder],
  );

  return (
    <div style={{ margin: '0 0 8px 24px', padding: '8px 0', borderLeft: '3px solid #1677ff', paddingLeft: 12 }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tag color="blue">广告组</Tag>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onCreateAdSet}>+添加广告组</Button>
      </div>
      <Table
        columns={orderedAdsetColumns}
        dataSource={adsets}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 1200 }}
        expandable={{
          expandedRowKeys: expandAll ? adsets.map((a) => a.id) : undefined,
          expandIcon: ({ expanded, onExpand, record }) =>
            expanded ? (
              <DownOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 4 }} />
            ) : (
              <RightOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 4 }} />
            ),
          expandedRowRender: (adset) => {
            const adsetAds = adsForAdset(adset.id, allAds);
            return (
              <AdSubTable
                ads={adsetAds}
                onEdit={onEdit}
                onToggleStatus={onToggleStatus}
                onCreate={() => onCreateAd(adset.id)}
              />
            );
          },
        }}
        locale={{ emptyText: '暂无广告组' }}
      />
    </div>
  );
}

// --- Ad list (receives pre-filtered data, no API calls) ---
function AdSubTable({
  ads,
  onEdit,
  onToggleStatus,
  onCreate,
}: {
  ads: any[];
  onEdit: (type: 'ad', record: any) => void;
  onToggleStatus: (type: string, id: string, currentStatus: string) => void;
  onCreate: () => void;
}) {
  const adColumnOrder = useColumnOrderStore((s) => s.orders.ad);
  const adColumns: ColumnsType<any> = [
    {
      title: '广告名称', dataIndex: 'name', key: 'name', width: 180, ellipsis: true, fixed: 'left' as const,
      sorter: (a, b) => cmpStr(a.name, b.name),
    },
    {
      title: '创意', dataIndex: 'creative', key: 'creative', width: 70,
      render: (c: any) => c?.thumbnail_url
        ? <Image src={c.thumbnail_url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
        : <Tag>无</Tag>,
    },
    {
      title: '活动关键词', dataIndex: 'utmCampaign', key: 'utmCampaign', width: 140, ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '投放状态', dataIndex: 'status', key: 'status', width: 90,
      sorter: (a, b) => cmpStr(a.status, b.status),
      render: (s: string) => renderStatusTag(s, 'ad'),
    },
    {
      title: '已花费', key: 'spend', width: 90,
      sorter: (a, b) => cmpNum(Number(a.spend) || 0, Number(b.spend) || 0),
      render: (_: any, r: any) => (r.spend != null && !isNaN(r.spend)) ? `$${r.spend.toFixed(2)}` : '-',
    },
    {
      title: 'CPM', key: 'cpm', width: 80,
      sorter: (a, b) => cmpNum(Number(a.cpm) || 0, Number(b.cpm) || 0),
      render: (_: any, r: any) => (r.cpm != null && !isNaN(r.cpm)) ? `$${r.cpm.toFixed(2)}` : '-',
    },
    {
      title: '单次连接\n点击花费', key: 'uniqueClicks', width: 100,
      sorter: (a, b) => {
        const va = Number(a.utmUv) > 0 ? Number(a.spend) / Number(a.utmUv) : -1;
        const vb = Number(b.utmUv) > 0 ? Number(b.spend) / Number(b.utmUv) : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => fmtCostPerUv(Number(r.spend) || 0, Number(r.utmUv) || 0),
    },
    {
      title: '成效', dataIndex: 'utmOrders', key: 'utmOrders', width: 70,
      sorter: (a, b) => cmpNum(Number(a.utmOrders) || 0, Number(b.utmOrders) || 0),
      render: (_: any, r: any) => fmtOrders(Number(r.utmOrders) || 0),
    },
    {
      title: '单次成效\n花费', key: 'purchases', width: 90,
      sorter: (a, b) => {
        const va = Number(a.utmOrders) > 0 ? Number(a.spend) / Number(a.utmOrders) : -1;
        const vb = Number(b.utmOrders) > 0 ? Number(b.spend) / Number(b.utmOrders) : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => fmtCostPerOrder(Number(r.spend) || 0, Number(r.utmOrders) || 0),
    },
    {
      title: 'ROAS', key: 'costPerPurchase', width: 90,
      sorter: (a, b) => {
        const va = Number(a.spend) > 0 ? Number(a.utmSales) / Number(a.spend) : -1;
        const vb = Number(b.spend) > 0 ? Number(b.utmSales) / Number(b.spend) : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => fmtRoas(Number(r.utmSales) || 0, Number(r.spend) || 0),
    },
    {
      title: '单次加购\n费用', key: 'costPerAddToCart', width: 90,
      sorter: (a, b) => {
        const va = Number(a.utmAddToCart) > 0 ? Number(a.spend) / Number(a.utmAddToCart) : -1;
        const vb = Number(b.utmAddToCart) > 0 ? Number(b.spend) / Number(b.utmAddToCart) : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => fmtCostPerCount(Number(r.spend) || 0, Number(r.utmAddToCart) || 0),
    },
    {
      title: '单次结账\n费用', key: 'costPerInitiateCheckout', width: 90,
      sorter: (a, b) => {
        const va = Number(a.utmBeginCheckout) > 0 ? Number(a.spend) / Number(a.utmBeginCheckout) : -1;
        const vb = Number(b.utmBeginCheckout) > 0 ? Number(b.spend) / Number(b.utmBeginCheckout) : -1;
        return cmpNum(va, vb);
      },
      render: (_: any, r: any) => fmtCostPerCount(Number(r.spend) || 0, Number(r.utmBeginCheckout) || 0),
    },
    {
      title: '广告编号', dataIndex: 'id', key: 'id', width: 160, ellipsis: true,
      sorter: (a, b) => cmpStr(a.id, b.id),
    },
    { title: '操作', key: 'actions', width: 180, fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => onEdit('ad', record)}>编辑</Button>
          <Switch
            size="small"
            checked={record.status === 'ACTIVE'}
            onChange={() => onToggleStatus('ad', record.id, record.status)}
            checkedChildren="开" unCheckedChildren="关"
          />
        </Space>
      ),
    },
  ];

  const orderedAdColumns = useMemo(
    () => applyColumnOrder(adColumns, adColumnOrder),
    [adColumns, adColumnOrder],
  );

  return (
    <div style={{ margin: '4px 0 8px 24px', padding: '8px 0', borderLeft: '3px solid #52c41a', paddingLeft: 12 }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tag color="green">广告</Tag>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onCreate}>+添加广告</Button>
      </div>
      <Table
        columns={orderedAdColumns}
        dataSource={ads}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 1200 }}
        rowClassName={(record) =>
          record.utmMatched === false && Number(record.spend) > 0 ? 'utm-unmatched-row' : ''
        }
        locale={{ emptyText: '暂无广告' }}
      />
    </div>
  );
}
