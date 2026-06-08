import React, { useCallback, useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Select, Space, Typography, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';

const { Title, Paragraph } = Typography;

interface ShopOption {
  shopId: string;
  shopDomain: string;
  name: string;
}

interface MappingRow {
  id: string;
  account_id: string;
  account_name: string | null;
  shop_id: string;
  shop_domain: string;
  shop_name: string | null;
  updated_at: string;
}

export const ShopMapping: React.FC = () => {
  const { accounts } = useAccountStore();
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mapResp, shopResp] = await Promise.all([
        api.get('/analytics/shop-mappings'),
        api.get('/analytics/shops'),
      ]);
      setMappings(mapResp.data || []);
      setShops(shopResp.data || []);
    } catch (err: any) {
      message.error(err.response?.data?.error || '加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const account = accounts.find((a) => a.id === values.accountId);
      const shop = shops.find((s) => s.shopId === values.shopId);
      if (!shop) {
        message.error('请选择店铺');
        return;
      }
      await api.post('/analytics/shop-mappings', {
        accountId: values.accountId,
        accountName: account?.name || '',
        shopId: shop.shopId,
        shopDomain: shop.shopDomain,
        shopName: shop.name,
      });
      message.success('保存成功');
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/analytics/shop-mappings/${id}`);
      message.success('已删除');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  const columns: ColumnsType<MappingRow> = [
    { title: '广告账户 ID', dataIndex: 'account_id', key: 'account_id', width: 180, ellipsis: true },
    { title: '账户名称', dataIndex: 'account_name', key: 'account_name', width: 220, ellipsis: true },
    { title: '店铺 ID', dataIndex: 'shop_id', key: 'shop_id', width: 120 },
    { title: '店铺名称', dataIndex: 'shop_name', key: 'shop_name', width: 140, ellipsis: true },
    { title: '店铺域名', dataIndex: 'shop_domain', key: 'shop_domain', width: 220, ellipsis: true },
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
      width: 100,
      render: (_, record) => (
        <Popconfirm title="确定删除此映射？" onConfirm={() => handleDelete(record.id)}>
          <Button type="link" danger icon={<DeleteOutlined />} size="small">删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>店铺映射配置</Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            将 Facebook 广告账户绑定到 Shoplazza 店铺，用于 UTM 数据匹配（utm_content = ad_id）。请先在「店铺 Token」页面配置店铺凭证。
          </Paragraph>
        </div>
        <Space>
          <Button onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            添加映射
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={mappings}
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1100 }}
      />

      <Modal
        title="添加账户-店铺映射"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="accountId"
            label="Facebook 广告账户"
            rules={[{ required: true, message: '请选择广告账户' }]}
          >
            <Select
              showSearch
              placeholder="选择广告账户"
              optionFilterProp="label"
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.name || a.id} (${a.id})`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="shopId"
            label="Shoplazza 店铺"
            rules={[{ required: true, message: '请选择店铺' }]}
          >
            <Select
              showSearch
              placeholder="选择店铺"
              optionFilterProp="label"
              options={shops.map((s) => ({
                value: s.shopId,
                label: `${s.name} — ${s.shopDomain}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
