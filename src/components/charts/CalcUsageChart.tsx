'use client';

/**
 * ESVA Calculator Usage Bar Chart
 * --------------------------------
 * Recharts BarChart showing top calculators by usage count.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export interface CalcUsageData {
  name: string;
  count: number;
  calculatorId: string;
}

interface CalcUsageChartProps {
  data: CalcUsageData[];
  height?: number;
}

const COLORS = [
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
];

interface TooltipPayloadItem {
  payload: CalcUsageData;
  value: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!;
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-[var(--text-primary)]">{item.payload.name}</p>
      <p className="text-xs text-[var(--text-secondary)]">
        {item.value}회 사용
      </p>
    </div>
  );
}

export default function CalcUsageChart({ data, height = 300 }: CalcUsageChartProps) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-[var(--text-tertiary)]"
        style={{ height }}
      >
        사용 데이터가 없습니다
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 11 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={32}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
