import React from 'react';
import { Card } from 'antd';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PieChartCardProps {
  title: string;
  data: { name: string; value: number }[];
  loading?: boolean;
  colors?: string[];
}

const DEFAULT_COLORS = [
  '#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96',
  '#13c2c2', '#f5222d', '#2f54eb', '#faad14', '#a0d911',
];

export const PieChartCard: React.FC<PieChartCardProps> = ({
  title,
  data,
  loading = false,
  colors = DEFAULT_COLORS,
}) => {
  const chartData = data
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const renderLabel = ({ name, percent }: any) =>
    `${name} ${(percent * 100).toFixed(0)}%`;

  return (
    <Card loading={loading} title={title}>
      {chartData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={120}
              paddingAngle={2}
              dataKey="value"
              label={renderLabel}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [`$${value.toFixed(2)}`, '花费']}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};
