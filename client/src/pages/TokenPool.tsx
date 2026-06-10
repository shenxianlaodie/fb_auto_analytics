import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Tag, Space, Popconfirm, message, Card, Statistic, Row, Col, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, KeyOutlined, LinkOutlined, WarningOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';

interface PoolToken {
  id: string;
  name: string;
  access_token: string;
  owner_name: string | null;
  assigned_accounts: string[] | null;
  status: 'active' | 'cooling' | 'disabled' | 'expired';
  cooldown_until: string | null;
  expires_at: string | null;
  call_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface RateLimitEvent {
  accountId: string;
  type: 'account' | 'token';
  at: string;
  message?: string;
}

const statusMap: Record<string, { color: string; label: string }> = {
  active: { color: 'green', label: '在线' },
  cooling: { color: 'orange', label: '冷却中' },
  disabled: { color: 'default', label: '已停用' },
  expired: { color: 'red', label: '已过期' },
};

function formatCooldownRemaining(until: string | null): string {
  if (!until) return '-';
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return '即将恢复';
  const min = Math.ceil(ms / 60000);
  return `约 ${min} 分钟`;
}

export const TokenPool: React.FC = () => {
  const [tokens, setTokens] = useState<PoolToken[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<PoolToken | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [searchParams] = useSearchParams();
  const successMsg = searchParams.get('success');
  const errorMsg = searchParams.get('error');

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const [tokenResp, statsResp] = await Promise.all([
        api.get('/tokens'),
        api.get('/tokens/stats'),
      ]);
      setTokens(tokenResp.data.data || []);
      setRateLimits(statsResp.data.recentRateLimits || []);
    } catch {
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
    } catch {
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

  const openAssign = (record: PoolToken) => {
    setAssignTarget(record);
    assignForm.setFieldsValue({
      assignedAccounts: (record.assigned_accounts || []).join('\n'),
    });
    setAssignModalOpen(true);
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    try {
      const values = await assignForm.validateFields();
      const accounts = String(values.assignedAccounts || '')
        .split(/[\n,]+/)
        .map((s: string) => s.trim().replace(/^act_/, ''))
        .filter(Boolean);
      await api.put(`/tokens/${assignTarget.id}`, { assignedAccounts: accounts });
      message.success('账户绑定已更新');
      setAssignModalOpen(false);
      fetchTokens();
    } catch (err: any) {
      if (err.response) message.error(err.response.data?.error || '保存失败');
    }
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
      title: '绑定账户', key: 'assigned',
      render: (_: unknown, record: PoolToken) => {
        const n = record.assigned_accounts?.length || 0;
        return n > 0 ? <Tag>{n} 个</Tag> : <span style={{ color: '#999' }}>自动匹配</span>;
      },
    },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (s: string, record: PoolToken) => (
        <Space direction="vertical" size={0}>
          <Tag color={statusMap[s]?.color}>{statusMap[s]?.label || s}</Tag>
          {s === 'cooling' && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatCooldownRemaining(record.cooldown_until)}
            </Typography.Text>
          )}
        </Space>
      ),
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
      render: (_: unknown, record: PoolToken) => (
        <Space>
          <Button size="small" onClick={() => openAssign(record)}>绑定账户</Button>
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

  const rateLimitColumns = [
    {
      title: '时间',
      dataIndex: 'at',
      key: 'at',
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (t: string) => (t === 'account' ? '账户限流' : 'Token 限流'),
    },
    { title: '账户', dataIndex: 'accountId', key: 'accountId', render: (v: string) => v || '-' },
    { title: '说明', dataIndex: 'message', key: 'message' },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}><Card><Statistic title="Token 总数" value={tokens.length} prefix={<KeyOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="在线" value={activeCount} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="冷却中" value={coolingCount} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="已过期" value={expiredCount} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="累计调用" value={totalCalls} /></Card></Col>
        <Col span={4}><Card><Statistic title="近期限流" value={rateLimits.length} prefix={<WarningOutlined />} valueStyle={{ color: rateLimits.length > 0 ? '#fa8c16' : undefined }} /></Card></Col>
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

      {rateLimits.length > 0 && (
        <>
          <h4 style={{ marginTop: 32 }}>最近限流记录</h4>
          <Table
            dataSource={rateLimits}
            columns={rateLimitColumns}
            rowKey={(r) => `${r.at}-${r.accountId}-${r.type}`}
            pagination={{ pageSize: 10 }}
            size="small"
          />
        </>
      )}

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

      <Modal
        title={`绑定广告账户 — ${assignTarget?.name || ''}`}
        open={assignModalOpen}
        onOk={handleAssign}
        onCancel={() => setAssignModalOpen(false)}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          每行一个账户 ID（可带 act_ 前缀）。留空则使用自动匹配（按 ad_accounts.user_id）。
        </Typography.Paragraph>
        <Form form={assignForm} layout="vertical">
          <Form.Item name="assignedAccounts">
            <Input.TextArea rows={8} placeholder="647601474804558&#10;1113604493975536" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
