import React, { useState } from 'react';
import { Button, Input, Space, Typography } from 'antd';
import { CopyOutlined, EditOutlined } from '@ant-design/icons';

/** FB 风格名称单元格：可下钻、hover 浮现重命名/复制 */
export function NameCell({
  name,
  drillable,
  onDrillIn,
  onRename,
  onCopy,
}: {
  name: string;
  drillable?: boolean;
  onDrillIn?: () => void;
  onRename: (newName: string) => Promise<void>;
  onCopy: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <Input
        autoFocus
        size="small"
        defaultValue={name}
        disabled={saving}
        onBlur={() => setEditing(false)}
        onPressEnter={async (e: any) => {
          const v = e.target.value.trim();
          if (!v || v === name) {
            setEditing(false);
            return;
          }
          setSaving(true);
          try {
            await onRename(v);
          } catch {
            // 错误提示由调用方负责
          } finally {
            setSaving(false);
            setEditing(false);
          }
        }}
      />
    );
  }

  const nameNode =
    drillable && onDrillIn ? (
      <Typography.Link
        ellipsis
        style={{ flex: 1, maxWidth: '100%' }}
        title={name}
        onClick={(e) => {
          e.stopPropagation();
          onDrillIn();
        }}
      >
        {name}
      </Typography.Link>
    ) : (
      <Typography.Text ellipsis style={{ flex: 1 }} title={name}>
        {name}
      </Typography.Text>
    );

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 24 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {nameNode}
      {hover && (
        <Space size={0}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            title="重命名"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          />
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            title="复制"
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
          />
        </Space>
      )}
    </div>
  );
}
