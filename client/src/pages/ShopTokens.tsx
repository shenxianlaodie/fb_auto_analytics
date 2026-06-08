import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Switch, Space, Typography,
  Popconfirm, message, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../services/api';

const { Title, Paragraph } = Typography;

interface ShopTokenRow {
  id: string;
  shop_id: string;
  shop_domain: string;
  shop_name: string | null;
  token_preview: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const ShopTokens: React.FC = () => {
  const [rows, setRows] = useState<ShopTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShopTokenRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/analytics/shop-tokens');
      setRows(resp.data || []);
    } catch (err: any) {
      message.error(err.response?.data?.error || '加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true });
    setModalOpen(true);
  };

  const openEdit = (record: ShopTokenRow) => {
    setEditing(record);
    form.setFieldsValue({
      shopId: record.shop_id,
      shopDomain: record.shop_domain,
      shopName: record.shop_name || '',
      accessToken: '',
      isActive: record.is_active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await api.post('/analytics/shop-tokens', {
        shopId: values.shopId,
        shopDomain: values.shopDomain,
        shopName: values.shopName || undefined,
        accessToken: values.accessToken || undefined,
        isActive: values.isActive,
      });
      message.success(editing ? '更新成功' : '添加成功');
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async (record: ShopTokenRow) => {
    setTestingId(record.id);
    try {
      const resp = await api.post(`/analytics/shop-tokens/${record.id}/test`);
      const { utmRows, dateStart } = resp.data;
      message.success(`Token 有效：今日（${dateStart}）拉取到 ${utmRows} 条 UTM 数据`);
    } catch (err: any) {
      message.error(err.response?.data?.error || '测试失败');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/analytics/shop-tokens/${id}`);
      message.success('已删除');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  const columns: ColumnsType<ShopTokenRow> = [
    { title: '店铺 ID', dataIndex: 'shop_id', key: 'shop_id', width: 120 },
    { title: '店铺名称', dataIndex: 'shop_name', key: 'shop_name', width: 140, ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    { title: '店铺域名', dataIndex: 'shop_domain', key: 'shop_domain', width: 240, ellipsis: true },
    { title: 'Token', dataIndex: 'token_preview', key: 'token_preview', width: 120 },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 90,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<ApiOutlined />}
            loading={testingId === record.id}
            onClick={() => handleTest(record)}
          >
            测试
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除此店铺 Token？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>店铺 Token 管理</Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            在此配置 Shoplazza 店铺的 OpenAPI Token，用于 UTM 数据同步
          </Paragraph>
        </div>
        <Space>
          <Button onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            添加店铺
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1160 }}
      />

      <Modal
        title={editing ? '编辑店铺 Token' : '添加店铺 Token'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields(); }}
        confirmLoading={submitting}
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="shopId"
            label="店铺 ID"
            rules={[{ required: true, message: '请输入店铺 ID' }]}
          >
            <Input placeholder="例如 2392762" disabled={!!editing} />
          </Form.Item>
          <Form.Item
            name="shopDomain"
            label="店铺域名"
            rules={[{ required: true, message: '请输入店铺域名' }]}
          >
            <Input placeholder="shutiaoes.myshoplaza.com" />
          </Form.Item>
          <Form.Item name="shopName" label="店铺名称（可选）">
            <Input placeholder="shutiaoes" />
          </Form.Item>
          <Form.Item
            name="accessToken"
            label="Access Token"
            rules={editing ? [] : [{ required: true, message: '请输入 Token' }]}
            extra={editing ? '留空则保持原 Token 不变' : undefined}
          >
            <Input.Password placeholder={editing ? '留空不修改' : 'Shoplazza OpenAPI Token'} />
          </Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
