import React from 'react';
import { Button, Typography } from 'antd';
import { CloseOutlined, CopyOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';

export function BulkActionBar({
  count,
  loading,
  onEnable,
  onPause,
  onCopy,
  onClear,
}: {
  count: number;
  loading: boolean;
  onEnable: () => void;
  onPause: () => void;
  onCopy: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      style={{
        background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6,
        padding: '8px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <Typography.Text strong>已选 {count} 项</Typography.Text>
      <Button size="small" icon={<PlayCircleOutlined />} onClick={onEnable} loading={loading}>批量开启</Button>
      <Button size="small" icon={<PauseCircleOutlined />} onClick={onPause} loading={loading}>批量暂停</Button>
      <Button size="small" icon={<CopyOutlined />} onClick={onCopy}>复制</Button>
      <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClear}>取消选择</Button>
    </div>
  );
}
