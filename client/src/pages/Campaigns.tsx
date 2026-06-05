import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, Popconfirm, Typography, message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCampaigns } from '../hooks/useCampaigns';
import { FBCampaign } from '../types/facebook';
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

export const Campaigns: React.FC = () => {
  const { campaigns, loading, fetchCampaigns, createCampaign, updateCampaign, deleteCampaign } = useCampaigns();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ objective: 'OUTCOME_TRAFFIC', status: 'PAUSED' });
    setModalOpen(true);
  };

  const handleEdit = (record: FBCampaign) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      objective: record.objective,
      status: record.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingId) {
        await updateCampaign(editingId, { name: values.name, status: values.status });
        message.success('更新成功');
      } else {
        await createCampaign(values);
        message.success('创建成功');
      }

      setModalOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return; // form validation error
      message.error(err?.response?.data?.error || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCampaign(id);
      message.success('已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const columns: ColumnsType<FBCampaign> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '目标',
      dataIndex: 'objective',
      key: 'objective',
      width: 120,
      render: (obj: string) => OBJECTIVES[obj] || obj,
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
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除此广告系列？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>🚀 广告系列</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchCampaigns}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建广告系列</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={campaigns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <EmptyState title="暂无广告系列" description="点击上方按钮创建第一个广告系列" /> }}
      />

      <Modal
        title={editingId ? '编辑广告系列' : '创建广告系列'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入广告系列名称' }]}>
            <Input placeholder="例如：618促销活动" maxLength={100} />
          </Form.Item>
          <Form.Item name="objective" label="广告目标" rules={[{ required: true }]}>
            <Select
              options={Object.entries(OBJECTIVES).map(([value, label]) => ({ value, label }))}
              disabled={!!editingId}
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
