import React, { useCallback, useRef } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useColumnOrderStore } from '../../store/columnOrderStore';
import type { TableLevel } from '../../utils/columnOrder';

const MIN_WIDTH = 48;
const MAX_WIDTH = 600;
const NO_RESIZE_KEYS = new Set(['_expand']);

interface ResizableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  columnKey?: string;
  width?: number;
  onResize?: (key: string, width: number) => void;
}

const ResizableHeaderCell: React.FC<ResizableHeaderCellProps> = ({
  columnKey,
  width,
  onResize,
  children,
  style,
  ...rest
}) => {
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!columnKey || !onResize || NO_RESIZE_KEYS.has(columnKey)) return;
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startWidth.current = width ?? (e.currentTarget as HTMLElement).offsetWidth;

    const onMouseMove = (ev: MouseEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + ev.clientX - startX.current));
      onResize(columnKey, next);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const resizable = columnKey && onResize && !NO_RESIZE_KEYS.has(columnKey);

  return (
    <th {...rest} style={{ ...style, position: 'relative', userSelect: 'none' }}>
      {children}
      {resizable && (
        <span
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onMouseDown}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: 'col-resize',
            zIndex: 1,
          }}
        />
      )}
    </th>
  );
};

export interface ResizableTableProps<T> extends TableProps<T> {
  level: TableLevel;
  columnKeys: string[];
}

export function ResizableTable<T extends object>({
  level,
  columnKeys,
  columns,
  components,
  ...rest
}: ResizableTableProps<T>) {
  const setColumnWidth = useColumnOrderStore((s) => s.setColumnWidth);
  const handleResize = useCallback(
    (key: string, width: number) => {
      setColumnWidth(level, key, width);
    },
    [level, setColumnWidth],
  );

  const cols = (columns as ColumnsType<T>) ?? [];
  const keys = columnKeys.length ? columnKeys : cols.map((c) => String(c.key ?? ''));

  const mergedColumns = cols.map((col, index) => {
    const key = String(col.key ?? index);
    return {
      ...col,
      onHeaderCell: () => ({
        columnKey: key,
        width: col.width as number | undefined,
        onResize: handleResize,
      }),
    };
  });

  return (
    <Table<T>
      {...rest}
      columns={mergedColumns}
      components={{
        ...components,
        header: {
          ...components?.header,
          cell: ResizableHeaderCell,
        },
      }}
    />
  );
}
