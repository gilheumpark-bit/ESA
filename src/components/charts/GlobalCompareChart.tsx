'use client';

/**
 * ESVA Global Standard Comparison Radar Chart
 * --------------------------------------------
 * Recharts RadarChart comparing values across countries.
 * Useful for: ampacity, voltage drop limits, grounding resistance limits.
 */

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

export interface CompareDataPoint {
  metric: string;
  [countryKey: string]: string | number;
}

export interface CountryConfig {
  key: string;
  name: string;
  color: string;
}

interface GlobalCompareChartProps {
  data: CompareDataPoint[];
  countries: CountryConfig[];
  height?: number;
}

const DEFAULT_COUNTRIES: CountryConfig[] = [
  { key: 'KR', name: '한국 (KEC)', color: '#3b82f6' },
  { key: 'US', name: '미국 (NEC)', color: '#ef4444' },
  { key: 'IEC', name: 'IEC', color: '#10b981' },
  { key: 'JP', name: '일본 (JEAC)', color: '#f59e0b' },
];

export default function GlobalCompareChart({
  data,
  countries = DEFAULT_COUNTRIES,
  height = 350,
}: GlobalCompareChartProps) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-[var(--text-tertiary)]"
        style={{ height }}
      >
        비교 데이터가 없습니다
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid strokeOpacity={0.3} />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
        />
        <PolarRadiusAxis
          tick={{ fontSize: 10 }}
          angle={90}
          domain={[0, 'auto']}
        />
        {countries.map(country => (
          <Radar
            key={country.key}
            name={country.name}
            dataKey={country.key}
            stroke={country.color}
            fill={country.color}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
        <Legend
          wrapperStyle={{ fontSize: '12px' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/**
 * Preset comparison data for common electrical standards.
 */
export const PRESET_COMPARISONS = {
  voltageDrop: {
    title: '전압강하 허용치 (%)',
    data: [
      { metric: '간선', KR: 3, US: 3, IEC: 4, JP: 3 },
      { metric: '분기회로', KR: 2, US: 2, IEC: 3, JP: 2 },
      { metric: '총 합계', KR: 5, US: 5, IEC: 7, JP: 5 },
      { metric: '모터 기동', KR: 15, US: 15, IEC: 10, JP: 15 },
    ] as CompareDataPoint[],
  },
  groundingResistance: {
    title: '접지저항 한계 (Ohm)',
    data: [
      { metric: '제1종', KR: 10, US: 25, IEC: 10, JP: 10 },
      { metric: '제2종', KR: 10, US: 25, IEC: 10, JP: 10 },
      { metric: '제3종', KR: 100, US: 25, IEC: 100, JP: 100 },
      { metric: '특별3종', KR: 10, US: 5, IEC: 10, JP: 10 },
    ] as CompareDataPoint[],
  },
  breakerRating: {
    title: '차단기 정격전류 선정 기준',
    data: [
      { metric: '조명', KR: 20, US: 20, IEC: 16, JP: 20 },
      { metric: '콘센트', KR: 20, US: 20, IEC: 16, JP: 20 },
      { metric: '에어컨', KR: 30, US: 30, IEC: 25, JP: 30 },
      { metric: '동력', KR: 50, US: 50, IEC: 40, JP: 50 },
    ] as CompareDataPoint[],
  },
} as const;
