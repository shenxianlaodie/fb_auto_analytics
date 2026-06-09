import React, { useState } from 'react';
import { Button, Popover, Tabs, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  HolderOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useColumnOrderStore } from '../../store/columnOrderStore';
import {
  COLUMN_LABELS,
  TABLE_LEVEL_LABELS,
  TableLevel,
} from '../../utils/columnOrder';

const LEVELS: TableLevel[] = ['campaign', 'adset', 'ad'];

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
  level,
  order,
  onChange,
}: {
  level: TableLevel;
  order: string[];
  onChange: (order: string[]) => void;
}) {
  const labels = COLUMN_LABELS[level];
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null) return;
    onChange(moveItem(order, dragIndex, targetIndex));
    setDragIndex(null);
  };

  return (
    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
      {order.map((key, index) => (
        <div
          key={key}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(index)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 4px',
            borderBottom: '1px solid #f0f0f0',
            background: dragIndex === index ? '#fafafa' : undefined,
            cursor: 'grab',
          }}
        >
          <HolderOutlined style={{ color: '#999' }} />
          <span style={{ flex: 1, fontSize: 13 }}>{labels[key] || key}</span>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={index === 0}
            onClick={() => onChange(moveItem(order, index, index - 1))}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === order.length - 1}
            onClick={() => onChange(moveItem(order, index, index + 1))}
          />
        </div>
      ))}
    </div>
  );
}

export const ColumnOrderSettings: React.FC = () => {
  const { orders, setOrder, resetOrder, resetAll } = useColumnOrderStore();

  const content = (
    <div style={{ width: 320 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
        拖拽或使用箭头调整列顺序。名称列固定在左侧，操作列固定在右侧。
      </Typography.Paragraph>
      <Tabs
        size="small"
        items={LEVELS.map((level) => ({
          key: level,
          label: TABLE_LEVEL_LABELS[level],
          children: (
            <div>
              <SortableColumnList
                level={level}
                order={orders[level]}
                onChange={(next) => setOrder(level, next)}
              />
              <Button
                size="small"
                type="link"
                style={{ paddingLeft: 0, marginTop: 8 }}
                onClick={() => resetOrder(level)}
              >
                恢复默认
              </Button>
            </div>
          ),
        }))}
      />
      <Button size="small" onClick={resetAll} block style={{ marginTop: 8 }}>
        全部恢复默认
      </Button>
    </div>
  );

  return (
    <Popover content={content} title="列顺序设置" trigger="click" placement="bottomRight">
      <Button icon={<SettingOutlined />}>列设置</Button>
    </Popover>
  );
};
