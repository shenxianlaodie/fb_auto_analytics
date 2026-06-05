import React from 'react';
import { Empty, Button, Flex, Typography } from 'antd';

const { Text } = Typography;

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = '暂无数据',
  description = '',
  actionText,
  onAction,
  icon,
}) => {
  return (
    <Flex vertical align="center" justify="center" style={{ padding: '60px 0' }}>
      <Empty
        image={icon || Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <>
            <Text strong>{title}</Text>
            {description && (
              <>
                <br />
                <Text type="secondary">{description}</Text>
              </>
            )}
          </>
        }
      >
        {actionText && onAction && (
          <Button type="primary" onClick={onAction}>
            {actionText}
          </Button>
        )}
      </Empty>
    </Flex>
  );
};
