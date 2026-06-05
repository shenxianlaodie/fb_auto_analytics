import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm,
  Typography, message, Image,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  RightOutlined, DownOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';
import { FBCampaign, FBAdSet, FBAd } from '../types/facebook';
import { EmptyState } from '../components/Common/EmptyState';

const { Title } = Typography;

const OBJECTIVES: Record<string, string> = {
  OUTCOME_TRAFFIC: '流量',
  OUTCOME_SALES: '转化',
  OUTCOME_AWARENESS: '品牌认知',
  OUTCOME_ENGAGEMENT: '互动',
  OUTCOME_LEADS: '潜在客户',
  OUTCOME_APP_PROMOTION: '应用推广',
};

export const AdsManager: React.FC = () => {
  const { accountId } = useAccountStore();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [allAdSets, setAllAdSets] = useState<FBAdSet[]>([]);
  const [allAds, setAllAds] = useState<FBAd[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'campaign' | 'adset' | 'ad'>('campaign');
  const [parentId, setParentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Fetch all data: each call independent, failure doesn't block others
  const fetchAll = useCallback(async () => {
    if (!accountId || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);

    const now = new Date();
    const dateStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateEnd = now.toISOString().split('T')[0];

    try {
      const resp = await api.get('/insights/hierarchy', {
        params: { accountId, dateStart, dateEnd, limit: 200 },
      });
      setCampaigns(resp.data.campaigns || []);
      setAllAdSets(resp.data.adsets || []);
      setAllAds(resp.data.ads || []);
    } catch (err: any) {
      console.error('Hierarchy insights failed:', err);
      message.warning(err.response?.data?.error || '加载失败，可能是 API 限流，可稍后刷新');
    }

    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    // Only fetch if no data yet (backend cache handles freshness)
    if (accountId && campaigns.length === 0) {
      loadedRef.current = false;
      fetchAll();
    }
  }, [accountId]);

  const refresh = () => {
    loadedRef.current = false;
    fetchAll();
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

  const handleDelete = async (type: string, id: string) => {
    try {
      const endpoints: Record<string, string> = { campaign: `/campaigns/${id}`, adset: `/adsets/${id}`, ad: `/ads/${id}` };
      await api.delete(endpoints[type]);
      message.success('已删除');
      loadedRef.current = false;
      fetchAll();
    } catch {
      message.error('删除失败');
    }
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
    { title: '广告系列名', dataIndex: 'name', key: 'name', width: 180, ellipsis: true, fixed: 'left' as const },
    { title: '投放状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => (
        <Tag color={s === 'ACTIVE' ? 'green' : s === 'PAUSED' ? 'orange' : 'default'}>
          {s === 'ACTIVE' ? '投放中' : s === 'PAUSED' ? '已暂停' : s}
        </Tag>
      ),
    },
    { title: '预算', key: 'budget', width: 100,
      render: (_: any, r: any) => {
        const budget = r.daily_budget || r.lifetime_budget;
        return budget ? `$${(parseInt(budget) / 100).toFixed(0)}` : '-';
      },
    },
    { title: 'ROAS\n(购物)', key: 'roas', width: 90,
      render: (_: any, r: any) => (r.roas != null && !isNaN(r.roas)) ? `${r.roas.toFixed(2)}` : '-',
    },
    { title: '成效\n(购物)', key: 'purchases', width: 80,
      render: (_: any, r: any) => (r.purchases != null && !isNaN(r.purchases)) ? r.purchases.toLocaleString() : '-',
    },
    { title: '已花费\n金额', key: 'spend', width: 90,
      render: (_: any, r: any) => (r.spend != null && !isNaN(r.spend)) ? `$${r.spend.toFixed(2)}` : '-',
    },
    { title: 'CPM', key: 'cpm', width: 80,
      render: (_: any, r: any) => (r.cpm != null && !isNaN(r.cpm)) ? `$${r.cpm.toFixed(2)}` : '-',
    },
    { title: '单次链接\n点击费用\n(独立)', key: 'costPerUniqueClick', width: 100,
      render: (_: any, r: any) => (r.costPerUniqueClick != null && !isNaN(r.costPerUniqueClick)) ? `$${r.costPerUniqueClick.toFixed(2)}` : '-',
    },
    { title: '链接点击\n(独立)', key: 'uniqueClicks', width: 90,
      render: (_: any, r: any) => (r.uniqueClicks != null && !isNaN(r.uniqueClicks)) ? r.uniqueClicks.toLocaleString() : '-',
    },
    { title: '单次加购\n费用', key: 'costPerAddToCart', width: 90,
      render: (_: any, r: any) => (r.costPerAddToCart != null && !isNaN(r.costPerAddToCart)) ? `$${r.costPerAddToCart.toFixed(2)}` : '-',
    },
    { title: '单次结账\n费用', key: 'costPerInitiateCheckout', width: 90,
      render: (_: any, r: any) => (r.costPerInitiateCheckout != null && !isNaN(r.costPerInitiateCheckout)) ? `$${r.costPerInitiateCheckout.toFixed(2)}` : '-',
    },
    { title: '单次支付\n信息费用', key: 'costPerAddPaymentInfo', width: 100,
      render: (_: any, r: any) => (r.costPerAddPaymentInfo != null && !isNaN(r.costPerAddPaymentInfo)) ? `$${r.costPerAddPaymentInfo.toFixed(2)}` : '-',
    },
    { title: '单次购物\n费用', key: 'costPerPurchase', width: 90,
      render: (_: any, r: any) => (r.costPerPurchase != null && !isNaN(r.costPerPurchase)) ? `$${r.costPerPurchase.toFixed(2)}` : '-',
    },
    { title: '广告编号', dataIndex: 'id', key: 'id', width: 160, ellipsis: true },
    { title: '操作', key: 'actions', width: 200, fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => openCreateModal('adset', record.id)}>+广告组</Button>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => handleEdit('campaign', record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete('campaign', record.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>📢 广告管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateModal('campaign')}>
            创建广告系列
          </Button>
        </Space>
      </div>

      <Table
        columns={campaignColumns}
        dataSource={campaigns}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1800 }}
        expandable={{
          expandIcon: ({ expanded, onExpand, record }) =>
            expanded ? (
              <DownOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 4 }} />
            ) : (
              <RightOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 4 }} />
            ),
          expandedRowRender: (campaign) => {
            const campaignAdSets = allAdSets.filter((a: any) => (a.campaignId || a.campaign_id) === campaign.id);
            return (
              <AdSetSubTable
                adsets={campaignAdSets}
                allAds={allAds}
                onEdit={handleEdit}
                onDelete={handleDelete}
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
        confirmLoading={submitting} destroyOnClose width={500}
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
  onEdit,
  onDelete,
  onCreateAd,
  onCreateAdSet,
}: {
  adsets: FBAdSet[];
  allAds: FBAd[];
  onEdit: (type: 'adset' | 'ad', record: any) => void;
  onDelete: (type: string, id: string) => void;
  onCreateAd: (adsetId: string) => void;
  onCreateAdSet: () => void;
}) {
  const adsetColumns: ColumnsType<FBAdSet> = [
    { title: '广告组名称', dataIndex: 'name', key: 'name', width: 160, ellipsis: true, fixed: 'left' as const },
    { title: '投放状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => (
        <Tag color={s === 'ACTIVE' ? 'green' : s === 'PAUSED' ? 'orange' : 'default'}>
          {s === 'ACTIVE' ? '投放中' : s === 'PAUSED' ? '暂停' : s}
        </Tag>
      ),
    },
    { title: '日预算', key: 'budget', width: 100,
      render: (_: any, r: any) => {
        const b = r.daily_budget || r.lifetime_budget;
        return b ? `$${(parseInt(b) / 100).toFixed(0)}` : '-';
      },
    },
    { title: '已花费', key: 'spend', width: 90,
      render: (_: any, r: any) => (r.spend != null && !isNaN(r.spend)) ? `$${r.spend.toFixed(2)}` : '-',
    },
    { title: 'CPM', key: 'cpm', width: 80,
      render: (_: any, r: any) => (r.cpm != null && !isNaN(r.cpm)) ? `$${r.cpm.toFixed(2)}` : '-',
    },
    { title: '链接点击\n(独立)', key: 'uniqueClicks', width: 90,
      render: (_: any, r: any) => (r.uniqueClicks != null && !isNaN(r.uniqueClicks)) ? r.uniqueClicks.toLocaleString() : '-',
    },
    { title: 'ROAS\n(购物)', key: 'roas', width: 90,
      render: (_: any, r: any) => (r.roas != null && !isNaN(r.roas)) ? r.roas.toFixed(2) : '-',
    },
    { title: '成效\n(购物)', key: 'purchases', width: 80,
      render: (_: any, r: any) => (r.purchases != null && !isNaN(r.purchases)) ? r.purchases.toLocaleString() : '-',
    },
    { title: '单次购物\n费用', key: 'costPerPurchase', width: 90,
      render: (_: any, r: any) => (r.costPerPurchase != null && !isNaN(r.costPerPurchase)) ? `$${r.costPerPurchase.toFixed(2)}` : '-',
    },
    { title: '广告组编号', dataIndex: 'id', key: 'id', width: 160, ellipsis: true },
    { title: '操作', key: 'actions', width: 200, fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" type="link" onClick={() => onCreateAd(record.id)}>+广告</Button>
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => onEdit('adset', record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => onDelete('adset', record.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ margin: '0 0 8px 24px', padding: '8px 0', borderLeft: '3px solid #1677ff', paddingLeft: 12 }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tag color="blue">广告组</Tag>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onCreateAdSet}>+添加广告组</Button>
      </div>
      <Table
        columns={adsetColumns}
        dataSource={adsets}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 1200 }}
        expandable={{
          expandIcon: ({ expanded, onExpand, record }) =>
            expanded ? (
              <DownOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 4 }} />
            ) : (
              <RightOutlined onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 4 }} />
            ),
          expandedRowRender: (adset) => {
            const adsetAds = allAds.filter((a: any) => (a.adsetId || a.adset_id) === adset.id);
            return (
              <AdSubTable
                ads={adsetAds}
                onEdit={onEdit}
                onDelete={onDelete}
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
  onDelete,
  onCreate,
}: {
  ads: FBAd[];
  onEdit: (type: 'ad', record: any) => void;
  onDelete: (type: string, id: string) => void;
  onCreate: () => void;
}) {
  const adColumns: ColumnsType<FBAd> = [
    { title: '广告名称', dataIndex: 'name', key: 'name', width: 180, ellipsis: true, fixed: 'left' as const },
    { title: '创意', dataIndex: 'creative', key: 'creative', width: 70,
      render: (c: any) => c?.thumbnail_url
        ? <Image src={c.thumbnail_url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
        : <Tag>无</Tag>,
    },
    { title: '投放状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => (
        <Tag color={s === 'ACTIVE' ? 'green' : s === 'PAUSED' ? 'orange' : 'default'}>
          {s === 'ACTIVE' ? '投放中' : s === 'PAUSED' ? '暂停' : s}
        </Tag>
      ),
    },
    { title: '已花费', key: 'spend', width: 90,
      render: (_: any, r: any) => (r.spend != null && !isNaN(r.spend)) ? `$${r.spend.toFixed(2)}` : '-',
    },
    { title: 'CPM', key: 'cpm', width: 80,
      render: (_: any, r: any) => (r.cpm != null && !isNaN(r.cpm)) ? `$${r.cpm.toFixed(2)}` : '-',
    },
    { title: '链接点击\n(独立)', key: 'uniqueClicks', width: 90,
      render: (_: any, r: any) => (r.uniqueClicks != null && !isNaN(r.uniqueClicks)) ? r.uniqueClicks.toLocaleString() : '-',
    },
    { title: '成效\n(购物)', key: 'purchases', width: 80,
      render: (_: any, r: any) => (r.purchases != null && !isNaN(r.purchases)) ? r.purchases.toLocaleString() : '-',
    },
    { title: '单次购物\n费用', key: 'costPerPurchase', width: 90,
      render: (_: any, r: any) => (r.costPerPurchase != null && !isNaN(r.costPerPurchase)) ? `$${r.costPerPurchase.toFixed(2)}` : '-',
    },
    { title: '广告编号', dataIndex: 'id', key: 'id', width: 160, ellipsis: true },
    { title: '操作', key: 'actions', width: 140, fixed: 'right' as const,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />}
            onClick={() => onEdit('ad', record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => onDelete('ad', record.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ margin: '4px 0 8px 24px', padding: '8px 0', borderLeft: '3px solid #52c41a', paddingLeft: 12 }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tag color="green">广告</Tag>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onCreate}>+添加广告</Button>
      </div>
      <Table
        columns={adColumns}
        dataSource={ads}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 1100 }}
        locale={{ emptyText: '暂无广告' }}
      />
    </div>
  );
}
