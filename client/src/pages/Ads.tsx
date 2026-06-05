import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag,
  Popconfirm, Typography, message, Image,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAds } from '../hooks/useAds';
import { useAdSets } from '../hooks/useAdSets';
import { FBAd } from '../types/facebook';
import { EmptyState } from '../components/Common/EmptyState';

const { Title } = Typography;

const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: '立即购买' },
  { value: 'LEARN_MORE', label: '了解更多' },
  { value: 'SIGN_UP', label: '注册' },
  { value: 'DOWNLOAD', label: '下载' },
  { value: 'CONTACT_US', label: '联系我们' },
  { value: 'BOOK_NOW', label: '立即预订' },
  { value: 'INSTALL_APP', label: '安装应用' },
];

export const Ads: React.FC = () => {
  const { ads, loading, fetchAds, createAd, updateAd, deleteAd } = useAds();
  const { adsets, fetchAdSets } = useAdSets();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAds();
    fetchAdSets();
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ status: 'PAUSED' });
    setModalOpen(true);
  };

  const handleEdit = (record: FBAd) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      status: record.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingId) {
        await updateAd(editingId, { name: values.name, status: values.status });
        message.success('更新成功');
      } else {
        await createAd({
          adsetId: values.adsetId,
          name: values.name,
          creative: {
            title: values.headline,
            body: values.body_text,
            imageUrl: values.image_url,
            linkUrl: values.link,
            callToAction: values.cta,
          },
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

  const columns: ColumnsType<FBAd> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      width: 200,
    },
    {
      title: '创意预览',
      dataIndex: 'creative',
      key: 'creative',
      width: 120,
      render: (creative: any) => (
        creative?.thumbnail_url ? (
          <Image src={creative.thumbnail_url} width={60} height={60} style={{ objectFit: 'cover', borderRadius: 4 }} />
        ) : creative?.image_url ? (
          <Image src={creative.image_url} width={60} height={60} style={{ objectFit: 'cover', borderRadius: 4 }} />
        ) : (
          <Tag>无图片</Tag>
        )
      ),
    },
    {
      title: '标题',
      dataIndex: 'creative',
      key: 'title',
      width: 200,
      ellipsis: true,
      render: (creative: any) => creative?.title || '-',
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
          <Popconfirm title="确定删除此广告？" onConfirm={() => deleteAd(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>📢 广告</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchAds()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建广告</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={ads}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <EmptyState title="暂无广告" description="请先创建广告系列和广告组，再创建广告" /> }}
      />

      <Modal
        title={editingId ? '编辑广告' : '创建广告'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="广告名称" rules={[{ required: true, message: '请输入广告名称' }]}>
            <Input placeholder="例如：618促销-产品A" maxLength={100} />
          </Form.Item>

          {!editingId && (
            <>
              <Form.Item name="adsetId" label="所属广告组" rules={[{ required: true, message: '请选择广告组' }]}>
                <Select
                  placeholder="选择广告组"
                  options={adsets.map((a) => ({ value: a.id, label: a.name }))}
                />
              </Form.Item>

              <Form.Item name="headline" label="广告标题" rules={[{ required: true, message: '请输入广告标题' }]}>
                <Input placeholder="例如：限时5折！全场包邮" maxLength={40} showCount />
              </Form.Item>

              <Form.Item name="body_text" label="广告正文">
                <Input.TextArea placeholder="描述你的产品或优惠..." rows={3} maxLength={500} showCount />
              </Form.Item>

              <Form.Item name="image_url" label="图片链接">
                <Input placeholder="https://example.com/image.jpg" />
              </Form.Item>

              <Form.Item name="link" label="目标链接" rules={[{ required: true, message: '请输入目标链接' }]}>
                <Input placeholder="https://example.com/landing-page" />
              </Form.Item>

              <Form.Item name="cta" label="行动号召 (CTA)" initialValue="SHOP_NOW">
                <Select options={CTA_OPTIONS} />
              </Form.Item>
            </>
          )}

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
