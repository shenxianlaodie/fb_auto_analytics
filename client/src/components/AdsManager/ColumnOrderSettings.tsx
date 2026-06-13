import React, { useState } from 'react';
import { Button, Checkbox, Divider, Popover, Tabs, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  EyeInvisibleOutlined,
  HolderOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useColumnOrderStore } from '../../store/columnOrderStore';
import {
  COLUMN_LABELS,
  getHiddenOptionalColumns,
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
  onHide,
}: {
  level: TableLevel;
  order: string[];
  onChange: (order: string[]) => void;
  onHide: (key: string) => void;
}) {
  const labels = COLUMN_LABELS[level];
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null) return;
    onChange(moveItem(order, dragIndex, targetIndex));
    setDragIndex(null);
  };

  if (!order.length) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        暂无已显示列
      </Typography.Text>
    );
  }

  return (
    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
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
            icon={<EyeInvisibleOutlined />}
            title="隐藏"
            onClick={() => onHide(key)}
          />
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

function OptionalColumnList({
  level,
  hiddenKeys,
  onToggle,
}: {
  level: TableLevel;
  hiddenKeys: string[];
  onToggle: (key: string, visible: boolean) => void;
}) {
  const labels = COLUMN_LABELS[level];

  if (!hiddenKeys.length) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        所有可选列已显示
      </Typography.Text>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {hiddenKeys.map((key) => (
        <Checkbox key={key} onChange={(e) => onToggle(key, e.target.checked)}>
          {labels[key] || key}
        </Checkbox>
      ))}
    </div>
  );
}

export const ColumnOrderSettings: React.FC = () => {
  const { layout, setOrder, toggleColumn, resetOrder, resetAll } = useColumnOrderStore();

  const content = (
    <div style={{ width: 360 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
        拖拽调整列顺序；可选列默认隐藏，勾选后显示。表头右缘可拖拽调整列宽，刷新后保留。
      </Typography.Paragraph>
      <Tabs
        size="small"
        items={LEVELS.map((level) => ({
          key: level,
          label: TABLE_LEVEL_LABELS[level],
          children: (
            <div>
              <Typography.Text strong style={{ fontSize: 12 }}>已显示列</Typography.Text>
              <SortableColumnList
                level={level}
                order={layout[level].order}
                onChange={(next) => setOrder(level, next)}
                onHide={(key) => toggleColumn(level, key, false)}
              />
              <Divider style={{ margin: '12px 0' }} />
              <Typography.Text strong style={{ fontSize: 12 }}>可选列（默认隐藏）</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <OptionalColumnList
                  level={level}
                  hiddenKeys={getHiddenOptionalColumns(level, layout[level].order)}
                  onToggle={(key, visible) => toggleColumn(level, key, visible)}
                />
              </div>
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
    <Popover content={content} title="列设置" trigger="click" placement="bottomRight">
      <Button icon={<SettingOutlined />}>列设置</Button>
    </Popover>
  );
};
