import React, { useState } from 'react';
import { Button, Input, Space, Typography } from 'antd';
import { CopyOutlined, EditOutlined } from '@ant-design/icons';

/** FB 风格名称单元格：hover 浮现 重命名/复制，点击铅笔行内编辑 */
export function NameCell({
  name,
  onRename,
  onCopy,
}: {
  name: string;
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

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 24 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Typography.Text ellipsis style={{ flex: 1 }} title={name}>
        {name}
      </Typography.Text>
      {hover && (
        <Space size={0}>
          <Button size="small" type="text" icon={<EditOutlined />} title="重命名"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }} />
          <Button size="small" type="text" icon={<CopyOutlined />} title="复制"
            onClick={(e) => { e.stopPropagation(); onCopy(); }} />
        </Space>
      )}
    </div>
  );
}
