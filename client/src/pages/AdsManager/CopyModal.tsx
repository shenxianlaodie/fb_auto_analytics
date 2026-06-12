import React, { useState } from 'react';
import { Form, InputNumber, Modal, Select, Switch, Typography } from 'antd';
import type { Level } from '../../store/adsManagerStore';

const LEVEL_LABEL: Record<Level, string> = { campaign: '广告系列', adset: '广告组', ad: '广告' };

export interface CopyTarget {
  level: Level;
  records: any[]; // 待复制对象（单个或批量勾选）
}

export interface CopyOptions {
  count: number;
  statusOption: 'PAUSED' | 'INHERITED_FROM_SOURCE';
  targetId?: string; // adset 复制 → 目标系列；ad 复制 → 目标广告组
}

export function CopyModal({
  target,
  campaigns,
  adsets,
  submitting,
  onCancel,
  onSubmit,
}: {
  target: CopyTarget | null;
  campaigns: any[];
  adsets: any[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (opts: CopyOptions) => void;
}) {
  const [count, setCount] = useState(1);
  const [paused, setPaused] = useState(true);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);

  const level = target?.level;
  const targetOptions =
    level === 'adset'
      ? campaigns.map((c) => ({ value: c.id, label: c.name }))
      : level === 'ad'
        ? adsets.map((a) => ({ value: a.id, label: a.name }))
        : [];

  return (
    <Modal
      title={target ? `复制 ${target.records.length} 个${LEVEL_LABEL[target.level]}` : ''}
      open={!!target}
      onOk={() => onSubmit({ count, statusOption: paused ? 'PAUSED' : 'INHERITED_FROM_SOURCE', targetId })}
      onCancel={onCancel}
      confirmLoading={submitting}
      okText="复制"
      destroyOnHidden
      afterClose={() => { setCount(1); setPaused(true); setTargetId(undefined); }}
    >
      <Form layout="vertical">
        <Form.Item label="每个对象复制份数">
          <InputNumber min={1} max={10} value={count} onChange={(v) => setCount(v || 1)} />
        </Form.Item>
        <Form.Item label="以暂停状态创建副本">
          <Switch checked={paused} onChange={setPaused} checkedChildren="是" unCheckedChildren="否" />
          {!paused && (
            <Typography.Paragraph type="warning" style={{ fontSize: 12, marginTop: 4 }}>
              副本将继承原对象状态，可能立即产生消耗
            </Typography.Paragraph>
          )}
        </Form.Item>
        {(level === 'adset' || level === 'ad') && (
          <Form.Item label={level === 'adset' ? '目标广告系列（默认保留原系列）' : '目标广告组（默认保留原组）'}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="保持原位置"
              value={targetId}
              onChange={setTargetId}
              options={targetOptions}
            />
          </Form.Item>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          复制广告系列/广告组时将同时复制其下层对象（深复制）。
        </Typography.Text>
      </Form>
    </Modal>
  );
}
