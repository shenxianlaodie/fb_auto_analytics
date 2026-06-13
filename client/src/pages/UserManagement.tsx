import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Table, Button, Modal, Select, Tag, Space, message, Typography } from 'antd';
import { ReloadOutlined, EditOutlined } from '@ant-design/icons';
import api from '../services/api';

interface DingTalkUser {
  id: string;
  dingtalk_user_id: string;
  name: string | null;
  email: string | null;
  role: 'admin' | 'viewer';
  allowed_accounts: string[];
  created_at: string;
  updated_at: string;
}

interface AccountOption {
  id: string;
  name: string;
  account_id: string;
}

function accountsLabel(role: string): string {
  return role === 'admin'
    ? '可访问广告账户（不选 = 全部账户）'
    : '可访问广告账户（不选 = 无广告权限）';
}

function renderAllowedAccounts(role: string, arr: string[] | null | undefined) {
  if (!arr || arr.length === 0) {
    if (role === 'admin') return <Tag>全部</Tag>;
    return <Tag color="default">无权限</Tag>;
  }
  return arr.map((a) => (
    <Tag key={a} style={{ marginBottom: 4 }}>{a.replace(/^act_/, '')}</Tag>
  ));
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<DingTalkUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [editUser, setEditUser] = useState<DingTalkUser | null>(null);
  const [editRole, setEditRole] = useState<string>('viewer');
  const [editAccounts, setEditAccounts] = useState<string[]>([]);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/users');
      setUsers(resp.data.data || []);
    } catch {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAccountOptions = useCallback(async () => {
    try {
      const resp = await api.get('/users/account-options');
      setAccountOptions(resp.data.data || []);
    } catch {
      message.error('获取广告账户列表失败');
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchAccountOptions();
  }, [fetchUsers, fetchAccountOptions]);

  const openEdit = (user: DingTalkUser) => {
    setEditUser(user);
    setEditRole(user.role || 'viewer');
    setEditAccounts(user.allowed_accounts || []);
  };

  const handleSave = async () => {
    if (!editUser) return;
    try {
      await api.put(`/users/${editUser.id}`, { role: editRole, allowedAccounts: editAccounts });
      message.success('已更新');
      setEditUser(null);
      fetchUsers();
    } catch {
      message.error('保存失败');
    }
  };

  const selectOptions = useMemo(
    () => accountOptions.map((a) => ({
      value: a.id,
      label: `${a.name || a.id} (${a.account_id})`,
    })),
    [accountOptions],
  );

  const columns = [
    { title: '昵称', dataIndex: 'name', key: 'name' },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (v: string | null) => v || '-' },
    {
      title: '角色', dataIndex: 'role', key: 'role',
      render: (r: string) => (
        <Tag color={r === 'admin' ? 'blue' : 'green'}>{r === 'admin' ? '管理员' : '普通用户'}</Tag>
      ),
    },
    {
      title: '可访问账户', dataIndex: 'allowed_accounts', key: 'accounts',
      render: (arr: string[], record: DingTalkUser) => renderAllowedAccounts(record.role, arr),
    },
    {
      title: '操作', key: 'actions',
      render: (_: unknown, record: DingTalkUser) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>用户管理</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={fetchUsers}>刷新</Button>
      </div>

      <Table dataSource={users} columns={columns} rowKey="id" loading={loading} />

      <Modal
        title={`编辑用户: ${editUser?.name || ''}`}
        open={!!editUser}
        onOk={handleSave}
        onCancel={() => setEditUser(null)}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Typography.Text strong>角色</Typography.Text>
            <Select
              value={editRole}
              onChange={setEditRole}
              style={{ width: '100%', marginTop: 8 }}
              options={[
                { value: 'admin', label: '管理员 - 拥有全部权限' },
                { value: 'viewer', label: '普通用户 - 受账户限制' },
              ]}
            />
          </div>
          <div>
            <Typography.Text strong>{accountsLabel(editRole)}</Typography.Text>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              value={editAccounts}
              onChange={setEditAccounts}
              style={{ width: '100%', marginTop: 8 }}
              placeholder="搜索并选择广告账户"
              options={selectOptions}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
};
