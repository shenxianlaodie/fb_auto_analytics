import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, DatePicker, Dropdown, Input, Popconfirm, Space, Table, Tabs, Tag, Typography, message,
} from 'antd';
import { CloseOutlined, DeleteOutlined, FileTextOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAccountStore } from '../../store/accountStore';
import { useUIStore } from '../../store/uiStore';
import { Level, useAdsManagerStore } from '../../store/adsManagerStore';
import { useColumnOrderStore } from '../../store/columnOrderStore';
import { applyColumnOrder } from '../../utils/columnOrder';
import { ColumnOrderSettings } from '../../components/AdsManager/ColumnOrderSettings';
import { EmptyState } from '../../components/Common/EmptyState';
import { useHierarchy } from './useHierarchy';
import { adsetIdOf, campaignIdOf, filterHierarchy } from './helpers';
import { buildAdColumns, buildAdsetColumns, buildCampaignColumns } from './columns';
import { EditModal, EditTarget } from './EditModal';
import { CopyModal, CopyOptions, CopyTarget } from './CopyModal';
import { BulkActionBar } from './BulkActionBar';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const COPY_ENDPOINT: Record<Level, string> = {
  campaign: '/campaigns', adset: '/adsets', ad: '/ads',
};
const PUT_ENDPOINT: Record<Level, string> = {
  campaign: '/campaigns', adset: '/adsets', ad: '/ads',
};

export const AdsManager: React.FC = () => {
  const navigate = useNavigate();
  const { accountId } = useAccountStore();
  const [drafts, setDrafts] = useState<{ id: string; name: string; updated_at: string }[]>([]);

  const loadDrafts = async () => {
    if (!accountId) return;
    try {
      const resp = await api.get('/drafts', { params: { accountId } });
      setDrafts(resp.data || []);
    } catch {
      // 草稿加载失败不阻塞页面
    }
  };

  const removeDraft = async (id: string) => {
    await api.delete(`/drafts/${id}`);
    loadDrafts();
  };
  const { dateRange, setDateRange } = useUIStore();
  const { activeTab, selected, setActiveTab, setSelected, clearSelected } = useAdsManagerStore();
  const columnOrders = useColumnOrderStore((s) => s.orders);
  const { campaigns, adsets, ads, loading, syncMeta, reload, refresh } = useHierarchy();

  const [searchAdId, setSearchAdId] = useState('');
  const [searchName, setSearchName] = useState('');
  const [editingBudget, setEditingBudget] = useState<{ id: string; type: string } | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [copySubmitting, setCopySubmitting] = useState(false);

  useEffect(() => {
    clearSelected();
  }, [accountId]);

  // --- 搜索过滤 ---
  const filtered = useMemo(
    () => filterHierarchy(campaigns, adsets, ads, searchAdId, searchName),
    [campaigns, adsets, ads, searchAdId, searchName],
  );
  const searchActive = !!(searchAdId.trim() || searchName.trim());

  // --- 勾选联动筛选（FB 风格）---
  const selCampaigns = selected.campaign;
  const selAdsets = selected.adset;

  const tabCampaigns = useMemo(
    () => [...filtered.campaigns].sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0)),
    [filtered.campaigns],
  );
  const tabAdsets = useMemo(
    () => (selCampaigns.length
      ? filtered.adsets.filter((a) => selCampaigns.includes(campaignIdOf(a)))
      : filtered.adsets),
    [filtered.adsets, selCampaigns],
  );
  const tabAds = useMemo(() => {
    if (selAdsets.length) return filtered.ads.filter((a) => selAdsets.includes(adsetIdOf(a)));
    if (selCampaigns.length) return filtered.ads.filter((a) => selCampaigns.includes(campaignIdOf(a)));
    return filtered.ads;
  }, [filtered.ads, selAdsets, selCampaigns]);

  const dataOfTab: Record<Level, any[]> = { campaign: tabCampaigns, adset: tabAdsets, ad: tabAds };
  const recordsOfSelected = (level: Level) =>
    dataOfTab[level].filter((r) => selected[level].includes(r.id));

  // --- 操作 ---
  const handleToggleStatus = async (level: Level, id: string, current: string) => {
    const newStatus = current === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await api.put(`${PUT_ENDPOINT[level]}/${id}`, { status: newStatus });
      message.success(newStatus === 'ACTIVE' ? '已开启' : '已暂停');
      reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '操作失败');
    }
  };

  const handleRename = async (level: Level, id: string, name: string) => {
    try {
      await api.put(`${PUT_ENDPOINT[level]}/${id}`, { name });
      message.success('名称已更新');
      reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '重命名失败');
      throw err;
    }
  };

  const handleUpdateBudget = async (type: 'campaign' | 'adset', id: string, budgetCents: number) => {
    try {
      await api.put(`${PUT_ENDPOINT[type]}/${id}`, { budget: { daily: budgetCents } });
      message.success('预算已更新');
      reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '预算更新失败');
    }
    setEditingBudget(null);
  };

  const handleBulkStatus = async (status: 'ACTIVE' | 'PAUSED') => {
    const ids = recordsOfSelected(activeTab).map((r: any) => r.id);
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      const resp = await api.post('/bulk/status', { level: activeTab, ids, status });
      const { succeeded, failed } = resp.data;
      if (failed.length === 0) {
        message.success(`已${status === 'ACTIVE' ? '开启' : '暂停'} ${succeeded.length} 项`);
      } else {
        message.warning(
          `成功 ${succeeded.length} 项，失败 ${failed.length} 项：${failed[0].error}`,
        );
      }
      reload();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '批量操作失败');
    }
    setBulkLoading(false);
  };

  const openCopy = (level: Level, records: any[]) => {
    if (records.length === 0) return;
    setCopyTarget({ level, records });
  };

  const handleCopySubmit = async (opts: CopyOptions) => {
    if (!copyTarget) return;
    setCopySubmitting(true);
    const { level, records } = copyTarget;
    let ok = 0;
    let firstError = '';
    for (const r of records) {
      try {
        const body: Record<string, any> = { count: opts.count, statusOption: opts.statusOption };
        if (level === 'adset' && opts.targetId) body.targetCampaignId = opts.targetId;
        if (level === 'ad' && opts.targetId) body.targetAdsetId = opts.targetId;
        await api.post(`${COPY_ENDPOINT[level]}/${r.id}/copy`, body);
        ok++;
      } catch (err: any) {
        if (!firstError) firstError = err?.response?.data?.error || '复制失败';
      }
    }
    setCopySubmitting(false);
    setCopyTarget(null);
    if (ok === records.length) message.success(`已复制 ${ok} 项，正在同步结构...`);
    else message.warning(`成功 ${ok}/${records.length} 项：${firstError}`);
    // 复制结果需从 FB 拉取结构才能入库展示
    refresh();
  };

  // --- 列与表格 ---
  const columnsCtx = {
    allAds: filtered.ads,
    editingBudget,
    setEditingBudget,
    onUpdateBudget: handleUpdateBudget,
    onToggleStatus: handleToggleStatus,
    onRename: handleRename,
    onCopy: (level: Level, record: any) => openCopy(level, [record]),
    onEdit: (level: Level, record: any) => setEditTarget({ level, record, parentId: null }),
    onCreateChild: (level: 'adset' | 'ad', parentId: string) =>
      setEditTarget({ level, record: null, parentId }),
  };

  const campaignColumns = useMemo(
    () => applyColumnOrder(buildCampaignColumns(columnsCtx), columnOrders.campaign),
    [filtered.ads, editingBudget, columnOrders.campaign],
  );
  const adsetColumns = useMemo(
    () => applyColumnOrder(buildAdsetColumns(columnsCtx), columnOrders.adset),
    [filtered.ads, editingBudget, columnOrders.adset],
  );
  const adColumns = useMemo(
    () => applyColumnOrder(buildAdColumns(columnsCtx), columnOrders.ad),
    [filtered.ads, editingBudget, columnOrders.ad],
  );

  const renderTable = (level: Level, columns: any[], data: any[]) => (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="id"
      loading={loading}
      size="middle"
      scroll={{ x: 1800 }}
      rowSelection={{
        selectedRowKeys: selected[level],
        onChange: (keys) => setSelected(level, keys as string[]),
      }}
      rowClassName={(record: any) =>
        level === 'ad' && record.utmMatched === false && Number(record.spend) > 0
          ? 'utm-unmatched-row' : ''
      }
      locale={{
        emptyText: level === 'campaign'
          ? <EmptyState title="暂无广告系列" description="点击右上角创建" actionText="创建"
              onAction={() => navigate('/ads/create')} />
          : '暂无数据',
      }}
      pagination={{ pageSize: 20, showSizeChanger: true }}
    />
  );

  // --- 联动筛选提示条 ---
  const filterChips: { label: string; clear: () => void }[] = [];
  if (activeTab !== 'campaign' && selCampaigns.length > 0) {
    filterChips.push({
      label: `已筛选：${selCampaigns.length} 个广告系列`,
      clear: () => clearSelected('campaign'),
    });
  }
  if (activeTab === 'ad' && selAdsets.length > 0) {
    filterChips.push({
      label: `已筛选：${selAdsets.length} 个广告组`,
      clear: () => clearSelected('adset'),
    });
  }

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
          <Dropdown.Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={() => navigate('/ads/create')}
            onOpenChange={(open) => { if (open) loadDrafts(); }}
            menu={{
              items: drafts.length === 0
                ? [{ key: 'empty', label: '暂无草稿', disabled: true }]
                : drafts.map((d) => ({
                    key: d.id,
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 220 }}
                        onClick={() => navigate(`/ads/create?draftId=${d.id}`)}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                        <span style={{ fontSize: 11, color: '#999' }}>
                          {new Date(d.updated_at).toLocaleDateString()}
                        </span>
                        <Popconfirm title="删除该草稿？"
                          onConfirm={(e) => { e?.stopPropagation(); removeDraft(d.id); }}>
                          <DeleteOutlined onClick={(e) => e.stopPropagation()} style={{ color: '#ff4d4f' }} />
                        </Popconfirm>
                      </div>
                    ),
                  })),
            }}
          >
            <PlusOutlined /> 创建广告
          </Dropdown.Button>
        </Space>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
            匹配 {filtered.campaigns.length} 个系列 / {filtered.adsets.length} 个广告组 / {filtered.ads.length} 条广告
          </Typography.Text>
        )}
      </div>

      {syncMeta?.syncWarnings && syncMeta.syncWarnings.length > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }} message="数据同步提示"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {syncMeta.syncWarnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          }
        />
      )}

      {filterChips.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {filterChips.map((chip) => (
            <Tag key={chip.label} closable closeIcon={<CloseOutlined />} onClose={chip.clear} color="blue">
              {chip.label}
            </Tag>
          ))}
        </div>
      )}

      <BulkActionBar
        count={recordsOfSelected(activeTab).length}
        loading={bulkLoading}
        onEnable={() => handleBulkStatus('ACTIVE')}
        onPause={() => handleBulkStatus('PAUSED')}
        onCopy={() => openCopy(activeTab, recordsOfSelected(activeTab))}
        onClear={() => clearSelected(activeTab)}
      />

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as Level)}
        items={[
          {
            key: 'campaign',
            label: `广告系列 (${tabCampaigns.length})`,
            children: renderTable('campaign', campaignColumns, tabCampaigns),
          },
          {
            key: 'adset',
            label: `广告组 (${tabAdsets.length})`,
            children: renderTable('adset', adsetColumns, tabAdsets),
          },
          {
            key: 'ad',
            label: `广告 (${tabAds.length})`,
            children: renderTable('ad', adColumns, tabAds),
          },
        ]}
      />

      <EditModal
        target={editTarget}
        accountId={accountId}
        onClose={() => setEditTarget(null)}
        onDone={reload}
      />
      <CopyModal
        target={copyTarget}
        campaigns={campaigns}
        adsets={adsets}
        submitting={copySubmitting}
        onCancel={() => setCopyTarget(null)}
        onSubmit={handleCopySubmit}
      />
    </div>
  );
};
