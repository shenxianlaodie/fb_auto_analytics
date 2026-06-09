import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Tag, Space, Popconfirm, message, Card, Statistic, Row, Col } from 'antd';
import { PlusOutlined, ReloadOutlined, KeyOutlined, LinkOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';

interface PoolToken {
  id: string;
  name: string;
  access_token: string;
  owner_name: string | null;
  status: 'active' | 'cooling' | 'disabled' | 'expired';
  cooldown_until: string | null;
  call_count: number;
  last_used_at: string | null;
  created_at: string;
}

const statusMap: Record<string, { color: string; label: string }> = {
  active: { color: 'green', label: '在线' },
  cooling: { color: 'orange', label: '冷却中' },
  disabled: { color: 'default', label: '已停用' },
  expired: { color: 'red', label: '已过期' },
};

export const TokenPool: React.FC = () => {
  const [tokens, setTokens] = useState<PoolToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [form] = Form.useForm();
  const [searchParams] = useSearchParams();
  const successMsg = searchParams.get('success');
  const errorMsg = searchParams.get('error');

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/tokens');
      setTokens(resp.data.data || []);
    } catch (err: any) {
      message.error('获取 Token 列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  useEffect(() => {
    if (successMsg) message.success(`${decodeURIComponent(successMsg)} 的 Token 已入池`);
    if (errorMsg) message.error(decodeURIComponent(errorMsg));
  }, [successMsg, errorMsg]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const resp = await api.get('/tokens/connect');
      window.location.href = resp.data.redirectUrl;
    } catch (err: any) {
      message.error('获取授权链接失败');
      setConnecting(false);
    }
  };

  const handleAdd = async () => {
    try {
      const values = await form.validateFields();
      const resp = await api.post('/tokens', values);
      message.success(resp.data.message || 'Token 已添加');
      setModalOpen(false);
      form.resetFields();
      fetchTokens();
    } catch (err: any) {
      if (err.response) {
        message.error(err.response.data?.error || '添加失败');
      }
    }
  };

  const handleToggle = async (id: string, status: string) => {
    const newStatus = status === 'disabled' ? 'active' : 'disabled';
    await api.put(`/tokens/${id}`, { status: newStatus });
    message.success(status === 'disabled' ? '已启用' : '已停用');
    fetchTokens();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/tokens/${id}`);
    message.success('已删除');
    fetchTokens();
  };

  const activeCount = tokens.filter(t => t.status === 'active').length;
  const coolingCount = tokens.filter(t => t.status === 'cooling').length;
  const expiredCount = tokens.filter(t => t.status === 'expired').length;
  const totalCalls = tokens.reduce((s, t) => s + (t.call_count || 0), 0);

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: 'Token', dataIndex: 'access_token', key: 'token',
      render: (v: string) => <code>{v.substring(0, 20)}...{v.substring(v.length - 8)}</code>,
    },
    { title: '所属人', dataIndex: 'owner_name', key: 'owner' },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.label || s}</Tag>,
    },
    {
      title: '过期时间', dataIndex: 'expires_at', key: 'expires',
      render: (v: string) => {
        if (!v) return '-';
        const d = new Date(v);
        const isExpired = d < new Date();
        return <span style={{ color: isExpired ? 'red' : undefined }}>{d.toLocaleDateString('zh-CN')}{isExpired ? ' (已过期)' : ''}</span>;
      },
    },
    { title: '调用次数', dataIndex: 'call_count', key: 'calls' },
    {
      title: '最后使用', dataIndex: 'last_used_at', key: 'last_used',
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作', key: 'actions',
      render: (_: any, record: PoolToken) => (
        <Space>
          <Button
            size="small"
            type={record.status === 'disabled' ? 'primary' : 'default'}
            onClick={() => handleToggle(record.id, record.status)}
          >
            {record.status === 'disabled' ? '启用' : '停用'}
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="Token 总数" value={tokens.length} prefix={<KeyOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="在线" value={activeCount} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="冷却中" value={coolingCount} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="已过期" value={expiredCount} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="累计调用" value={totalCalls} /></Card></Col>
      </Row>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h3>Token 池管理</h3>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchTokens}>刷新</Button>
          <Button icon={<LinkOutlined />} onClick={handleConnect} loading={connecting}>绑定 Facebook</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>添加 Token</Button>
        </Space>
      </div>

      <Table dataSource={tokens} columns={columns} rowKey="id" loading={loading} />

      <Modal
        title="添加 Facebook Token"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入' }]}>
            <Input placeholder="如：员工张三的Token" />
          </Form.Item>
          <Form.Item name="accessToken" label="Facebook Access Token" rules={[{ required: true, message: '请输入' }]}>
            <Input.TextArea rows={4} placeholder="粘贴长效 access token" />
          </Form.Item>
          <Form.Item name="ownerName" label="所属人">
            <Input placeholder="Token 所属的 Facebook 用户名" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
