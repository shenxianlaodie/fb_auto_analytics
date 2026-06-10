import React, { useState } from 'react';
import { App, Button, Popover, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  HolderOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useSpuTopColumnOrderStore } from '../../store/spuTopColumnOrderStore';
import {
  SPU_TOP_COLUMN_LABELS,
  SpuTopColumnKey,
} from '../../utils/spuTopColumnOrder';

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SortableColumnList({
  order,
  disabled,
  onChange,
}: {
  order: SpuTopColumnKey[];
  disabled?: boolean;
  onChange: (order: SpuTopColumnKey[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || disabled) return;
    onChange(moveItem(order, dragIndex, targetIndex));
    setDragIndex(null);
  };

  return (
    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
      {order.map((key, index) => (
        <div
          key={key}
          draggable={!disabled}
          onDragStart={() => !disabled && setDragIndex(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(index)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 4px',
            borderBottom: '1px solid #f0f0f0',
            background: dragIndex === index ? '#fafafa' : undefined,
            cursor: disabled ? 'default' : 'grab',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <HolderOutlined style={{ color: '#999' }} />
          <span style={{ flex: 1, fontSize: 13 }}>{SPU_TOP_COLUMN_LABELS[key]}</span>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={disabled || index === 0}
            onClick={() => onChange(moveItem(order, index, index - 1))}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={disabled || index === order.length - 1}
            onClick={() => onChange(moveItem(order, index, index + 1))}
          />
        </div>
      ))}
    </div>
  );
}

export const SpuTopColumnSettings: React.FC = () => {
  const { message } = App.useApp();
  const { order, saving, saveOrder, resetOrder } = useSpuTopColumnOrderStore();
  const [open, setOpen] = useState(false);

  const handleChange = async (next: SpuTopColumnKey[]) => {
    try {
      await saveOrder(next);
      message.success('列顺序已保存，全员生效');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    }
  };

  const handleReset = async () => {
    try {
      await resetOrder();
      message.success('已恢复默认列顺序');
    } catch (err: any) {
      message.error(err.response?.data?.error || '恢复失败');
    }
  };

  const content = (
    <div style={{ width: 280 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
        拖拽或使用箭头调整表头列顺序，保存后所有用户同步生效。
      </Typography.Paragraph>
      <SortableColumnList order={order} disabled={saving} onChange={handleChange} />
      <Button
        size="small"
        type="link"
        style={{ paddingLeft: 0, marginTop: 8 }}
        disabled={saving}
        onClick={handleReset}
      >
        恢复默认
      </Button>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={content}
      title="表头列顺序"
      trigger="click"
      placement="bottomRight"
    >
      <Button icon={<SettingOutlined />} loading={saving}>
        列设置
      </Button>
    </Popover>
  );
};
