import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Select, Tag, Space, message, Typography } from 'antd';
import { ReloadOutlined, EditOutlined } from '@ant-design/icons';
import api from '../services/api';
import { useAccountStore } from '../store/accountStore';

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

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<DingTalkUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [editUser, setEditUser] = useState<DingTalkUser | null>(null);
  const [editRole, setEditRole] = useState<string>('viewer');
  const [editAccounts, setEditAccounts] = useState<string[]>([]);
  const { accounts } = useAccountStore();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/users');
      setUsers(resp.data.data || []);
    } catch (err: any) {
      message.error('获取用户列表失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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
    } catch (err: any) {
      message.error('保存失败');
    }
  };

  const columns = [
    { title: '昵称', dataIndex: 'name', key: 'name' },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (v: string | null) => v || '-' },
    {
      title: '角色', dataIndex: 'role', key: 'role',
      render: (r: string) => <Tag color={r === 'admin' ? 'blue' : 'green'}>{r === 'admin' ? '管理员' : '普通用户'}</Tag>,
    },
    {
      title: '可访问账户', dataIndex: 'allowed_accounts', key: 'accounts',
      render: (arr: string[]) => {
        if (!arr || arr.length === 0) return <Tag>全部</Tag>;
        return arr.map((a) => <Tag key={a} style={{ marginBottom: 4 }}>{a.replace(/^act_/, '')}</Tag>);
      },
    },
    {
      title: '操作', key: 'actions',
      render: (_: any, record: DingTalkUser) => (
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
            <Typography.Text strong>可访问广告账户（不选 = 全部）</Typography.Text>
            <Select
              mode="multiple"
              value={editAccounts}
              onChange={setEditAccounts}
              style={{ width: '100%', marginTop: 8 }}
              placeholder="选择广告账户"
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.name || a.id} (${a.id.replace(/^act_/, '')})`,
              }))}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
};
