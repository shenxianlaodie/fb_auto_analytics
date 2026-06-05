import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, InputNumber, Space, Tag,
  Popconfirm, Typography, message, Slider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAdSets } from '../hooks/useAdSets';
import { useCampaigns } from '../hooks/useCampaigns';
import { FBAdSet } from '../types/facebook';
import { EmptyState } from '../components/Common/EmptyState';

const { Title, Text } = Typography;

export const AdSets: React.FC = () => {
  const { adsets, loading, fetchAdSets, createAdSet, updateAdSet, deleteAdSet } = useAdSets();
  const { campaigns, fetchCampaigns } = useCampaigns();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 65]);

  useEffect(() => {
    fetchAdSets();
    fetchCampaigns();
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ bidStrategy: 'LOWEST_COST_WITHOUT_CAP', status: 'PAUSED' });
    setAgeRange([18, 65]);
    setModalOpen(true);
  };

  const handleEdit = (record: FBAdSet) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      status: record.status,
      daily_budget: parseInt(record.daily_budget || '0') || undefined,
    });
    if (record.targeting) {
      form.setFieldsValue({
        targeting_gender: record.targeting.genders?.[0] === 1 ? 'male' : record.targeting.genders?.[0] === 2 ? 'female' : 'all',
      });
      setAgeRange([record.targeting.age_min || 18, record.targeting.age_max || 65]);
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const targeting = {
        age_min: ageRange[0],
        age_max: ageRange[1],
        geo_locations: { countries: ['US'] },
        genders: values.targeting_gender && values.targeting_gender !== 'all'
          ? [values.targeting_gender === 'male' ? 1 : 2]
          : undefined,
      };

      if (editingId) {
        await updateAdSet(editingId, {
          name: values.name,
          status: values.status,
          budget: values.daily_budget ? { daily: values.daily_budget } : undefined,
        });
        message.success('更新成功');
      } else {
        await createAdSet({
          campaignId: values.campaignId,
          name: values.name,
          targeting,
          budget: { daily: values.daily_budget || 1000 },
          bidStrategy: values.bidStrategy,
          status: values.status,
        });
        message.success('创建成功');
      }

      setModalOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<FBAdSet> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '日预算',
      dataIndex: 'daily_budget',
      key: 'daily_budget',
      width: 100,
      render: (v: string) => v ? `$${(parseInt(v) / 100).toFixed(2)}` : '-',
    },
    {
      title: '出价策略',
      dataIndex: 'bid_strategy',
      key: 'bid_strategy',
      width: 140,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : status === 'PAUSED' ? 'orange' : 'default'}>
          {status === 'ACTIVE' ? '投放中' : status === 'PAUSED' ? '已暂停' : status}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_time',
      key: 'created_time',
      width: 160,
      render: (time: string) => new Date(time).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除此广告组？" onConfirm={() => deleteAdSet(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>🎯 广告组</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchAdSets()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建广告组</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={adsets}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <EmptyState title="暂无广告组" description="请先创建广告系列，再创建广告组" /> }}
      />

      <Modal
        title={editingId ? '编辑广告组' : '创建广告组'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入广告组名称' }]}>
            <Input placeholder="例如：18-35岁女性用户" maxLength={100} />
          </Form.Item>

          {!editingId && (
            <Form.Item name="campaignId" label="所属广告系列" rules={[{ required: true, message: '请选择广告系列' }]}>
              <Select
                placeholder="选择广告系列"
                options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
          )}

          <Form.Item label={`受众年龄: ${ageRange[0]} - ${ageRange[1]} 岁`}>
            <Slider
              range
              min={13}
              max={65}
              value={ageRange}
              onChange={(val) => setAgeRange(val as [number, number])}
            />
          </Form.Item>

          <Form.Item name="targeting_gender" label="性别" initialValue="all">
            <Select
              options={[
                { value: 'all', label: '全部' },
                { value: 'male', label: '男性' },
                { value: 'female', label: '女性' },
              ]}
            />
          </Form.Item>

          <Form.Item name="daily_budget" label="日预算 (美分)">
            <InputNumber min={100} max={10000000} style={{ width: '100%' }} placeholder="1000 (即 $10.00)" />
          </Form.Item>

          <Form.Item name="bidStrategy" label="出价策略">
            <Select
              options={[
                { value: 'LOWEST_COST_WITHOUT_CAP', label: '最低成本（无上限）' },
                { value: 'LOWEST_COST_WITH_BID_CAP', label: '最低成本（有上限）' },
                { value: 'COST_CAP', label: '成本上限' },
              ]}
            />
          </Form.Item>

          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: 'ACTIVE', label: '投放中' },
                { value: 'PAUSED', label: '已暂停' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
