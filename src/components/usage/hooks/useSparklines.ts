import { useCallback, useMemo } from 'react';
import { collectUsageDetails, extractTotalTokens } from '@/utils/usage';
import { USAGE_SPARKLINE_COLORS } from '@/utils/usage/palette';
import type { UsagePayload } from './useUsageData';

export interface SparklineData {
  labels: string[];
  datasets: [
    {
      data: number[];
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number;
      borderWidth: number;
    }
  ];
}

export interface SparklineBundle {
  data: SparklineData;
}

export interface UseSparklinesOptions {
  usage: UsagePayload | null;
  loading: boolean;
  nowMs: number;
}

export interface UseSparklinesReturn {
  requestsSparkline: SparklineBundle | null;
  tokensSparkline: SparklineBundle | null;
  rpmSparkline: SparklineBundle | null;
  tpmSparkline: SparklineBundle | null;
  costSparkline: SparklineBundle | null;
}

export function useSparklines({ usage, loading, nowMs }: UseSparklinesOptions): UseSparklinesReturn {
  const lastHourSeries = useMemo(() => {
    if (!usage) return { labels: [], requests: [], tokens: [] };
    if (!Number.isFinite(nowMs) || nowMs <= 0) {
      return { labels: [], requests: [], tokens: [] };
    }
    const details = collectUsageDetails(usage);
    if (!details.length) return { labels: [], requests: [], tokens: [] };

    const windowMinutes = 60;
    const now = nowMs;
    const windowStart = now - windowMinutes * 60 * 1000;
    const requestBuckets = new Array(windowMinutes).fill(0);
    const tokenBuckets = new Array(windowMinutes).fill(0);

    details.forEach((detail) => {
      const timestamp = detail.__timestampMs ?? 0;
      if (!Number.isFinite(timestamp) || timestamp < windowStart || timestamp > now) {
        return;
      }
      const minuteIndex = Math.min(
        windowMinutes - 1,
        Math.floor((timestamp - windowStart) / 60000)
      );
      requestBuckets[minuteIndex] += 1;
      tokenBuckets[minuteIndex] += extractTotalTokens(detail);
    });

    const labels = requestBuckets.map((_, idx) => {
      const date = new Date(windowStart + (idx + 1) * 60000);
      const h = date.getHours().toString().padStart(2, '0');
      const m = date.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    });

    return { labels, requests: requestBuckets, tokens: tokenBuckets };
  }, [nowMs, usage]);

  const buildSparkline = useCallback(
    (
      series: { labels: string[]; data: number[] },
      color: string,
      backgroundColor: string
    ): SparklineBundle | null => {
      if (loading || !series?.data?.length) {
        return null;
      }
      const sliceStart = Math.max(series.data.length - 60, 0);
      const labels = series.labels.slice(sliceStart);
      const points = series.data.slice(sliceStart);
      return {
        data: {
          labels,
          datasets: [
            {
              data: points,
              borderColor: color,
              backgroundColor,
              fill: true,
              tension: 0.45,
              pointRadius: 0,
              borderWidth: 2
            }
          ]
        }
      };
    },
    [loading]
  );

  const requestsSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.requests },
        USAGE_SPARKLINE_COLORS.requests.line,
        USAGE_SPARKLINE_COLORS.requests.area
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.requests]
  );

  const tokensSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.tokens },
        USAGE_SPARKLINE_COLORS.tokens.line,
        USAGE_SPARKLINE_COLORS.tokens.area
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.tokens]
  );

  const rpmSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.requests },
        USAGE_SPARKLINE_COLORS.rpm.line,
        USAGE_SPARKLINE_COLORS.rpm.area
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.requests]
  );

  const tpmSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.tokens },
        USAGE_SPARKLINE_COLORS.tpm.line,
        USAGE_SPARKLINE_COLORS.tpm.area
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.tokens]
  );

  const costSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.tokens },
        USAGE_SPARKLINE_COLORS.cost.line,
        USAGE_SPARKLINE_COLORS.cost.area
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.tokens]
  );

  return {
    requestsSparkline,
    tokensSparkline,
    rpmSparkline,
    tpmSparkline,
    costSparkline
  };
}
