/**
 * 使用统计图表统一配色
 */

export interface UsageChartColor {
  borderColor: string;
  backgroundColor: string;
}

export const USAGE_MODEL_CHART_COLORS: UsageChartColor[] = [
  { borderColor: '#2563EB', backgroundColor: 'rgba(37, 99, 235, 0.16)' },
  { borderColor: '#0EA5E9', backgroundColor: 'rgba(14, 165, 233, 0.16)' },
  { borderColor: '#14B8A6', backgroundColor: 'rgba(20, 184, 166, 0.16)' },
  { borderColor: '#22C55E', backgroundColor: 'rgba(34, 197, 94, 0.16)' },
  { borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.16)' },
  { borderColor: '#F97316', backgroundColor: 'rgba(249, 115, 22, 0.16)' },
  { borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.16)' },
  { borderColor: '#6366F1', backgroundColor: 'rgba(99, 102, 241, 0.16)' },
  { borderColor: '#EC4899', backgroundColor: 'rgba(236, 72, 153, 0.16)' },
];

export const USAGE_TOKEN_COLORS = {
  input: { border: '#2563EB', bg: 'rgba(37, 99, 235, 0.24)' },
  output: { border: '#22C55E', bg: 'rgba(34, 197, 94, 0.24)' },
  cached: { border: '#F59E0B', bg: 'rgba(245, 158, 11, 0.24)' },
  reasoning: { border: '#6366F1', bg: 'rgba(99, 102, 241, 0.24)' }
} as const;

export const USAGE_SPARKLINE_COLORS = {
  requests: { line: '#2563EB', area: 'rgba(37, 99, 235, 0.2)' },
  tokens: { line: '#6366F1', area: 'rgba(99, 102, 241, 0.2)' },
  rpm: { line: '#22C55E', area: 'rgba(34, 197, 94, 0.2)' },
  tpm: { line: '#14B8A6', area: 'rgba(20, 184, 166, 0.2)' },
  cost: { line: '#F59E0B', area: 'rgba(245, 158, 11, 0.2)' }
} as const;

export const USAGE_STAT_CARD_ACCENTS = {
  requests: {
    accent: '#2563EB',
    accentSoft: 'rgba(37, 99, 235, 0.18)',
    accentBorder: 'rgba(37, 99, 235, 0.34)'
  },
  tokens: {
    accent: '#6366F1',
    accentSoft: 'rgba(99, 102, 241, 0.18)',
    accentBorder: 'rgba(99, 102, 241, 0.34)'
  },
  rpm: {
    accent: '#22C55E',
    accentSoft: 'rgba(34, 197, 94, 0.18)',
    accentBorder: 'rgba(34, 197, 94, 0.32)'
  },
  tpm: {
    accent: '#14B8A6',
    accentSoft: 'rgba(20, 184, 166, 0.18)',
    accentBorder: 'rgba(20, 184, 166, 0.32)'
  },
  cost: {
    accent: '#F59E0B',
    accentSoft: 'rgba(245, 158, 11, 0.18)',
    accentBorder: 'rgba(245, 158, 11, 0.32)'
  }
} as const;

export const USAGE_COST_COLORS = {
  line: '#F59E0B',
  area: 'rgba(245, 158, 11, 0.16)'
} as const;
