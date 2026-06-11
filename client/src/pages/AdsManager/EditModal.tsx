import React, { useEffect, useState } from 'react';
import { Form, Input, Modal, Select, message } from 'antd';
import api from '../../services/api';
import { ownStatusOf } from './helpers';
import type { Level } from '../../store/adsManagerStore';

const OBJECTIVES: Record<string, string> = {
  OUTCOME_SALES: '转化',
  OUTCOME_TRAFFIC: '流量',
  OUTCOME_AWARENESS: '品牌认知',
  OUTCOME_ENGAGEMENT: '互动',
  OUTCOME_LEADS: '潜在客户',
  OUTCOME_APP_PROMOTION: '应用推广',
};

const LEVEL_LABEL: Record<Level, string> = { campaign: '广告系列', adset: '广告组', ad: '广告' };

export interface EditTarget {
  level: Level;
  record: any | null;       // null = 创建
  parentId: string | null;  // 创建 adset/ad 时的父级 id
}

export function EditModal({
  target,
  accountId,
  onClose,
  onDone,
}: {
  target: EditTarget | null;
  accountId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const editing = !!target?.record;

  useEffect(() => {
    if (!target) return;
    form.resetFields();
    if (target.record) {
      form.setFieldsValue({
        name: target.record.name,
        objective: target.record.objective,
        status: ownStatusOf(target.record),
      });
    } else if (target.level === 'campaign') {
      form.setFieldsValue({ objective: 'OUTCOME_SALES', status: 'PAUSED' });
    } else {
      form.setFieldsValue({ status: 'PAUSED' });
    }
  }, [target, form]);

  const handleSubmit = async () => {
    if (!target) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const { level, record, parentId } = target;

      if (level === 'campaign') {
        if (record) {
          await api.put(`/campaigns/${record.id}`, { name: values.name, status: values.status });
        } else {
          await api.post('/campaigns', { accountId, ...values });
        }
      } else if (level === 'adset') {
        if (record) {
          await api.put(`/adsets/${record.id}`, { name: values.name, status: values.status });
        } else {
          await api.post('/adsets', {
            accountId, campaignId: parentId, name: values.name,
            targeting: { age_min: 18, age_max: 65, geo_locations: { countries: ['US'] } },
            budget: { daily: values.daily_budget || 1000 },
            bidStrategy: 'LOWEST_COST_WITHOUT_CAP', status: values.status,
          });
        }
      } else {
        if (record) {
          await api.put(`/ads/${record.id}`, { name: values.name, status: values.status });
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

      message.success(record ? '更新成功' : '创建成功');
      onClose();
      onDone();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={target ? `${editing ? '编辑' : '创建'}${LEVEL_LABEL[target.level]}` : ''}
      open={!!target}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={submitting}
      destroyOnHidden
      width={500}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input maxLength={100} />
        </Form.Item>
        {target?.level === 'campaign' && !editing && (
          <Form.Item name="objective" label="广告目标">
            <Select options={Object.entries(OBJECTIVES).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
        )}
        {target?.level === 'adset' && !editing && (
          <Form.Item name="daily_budget" label="日预算 (美分)">
            <Input type="number" placeholder="1000 = $10.00" />
          </Form.Item>
        )}
        {target?.level === 'ad' && !editing && (
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
  );
}
