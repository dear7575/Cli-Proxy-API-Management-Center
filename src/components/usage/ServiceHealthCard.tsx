import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collectUsageDetails,
  calculateServiceHealthData,
  type ServiceHealthData,
  type StatusBlockDetail,
} from '@/utils/usage';
import { IconCheck, IconX } from '@/components/ui/icons';
import type { UsagePayload } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

const DISPLAY_GROUP_SIZE = 1; // 保留 15 分钟粒度，不合并窗口
const DISPLAY_ROWS = 12;

const COLOR_STOPS = [
  { r: 239, g: 68, b: 68 },   // #ef4444
  { r: 250, g: 204, b: 21 },  // #facc15
  { r: 34, g: 197, b: 94 },   // #22c55e
] as const;

function rateToColor(rate: number): string {
  const t = Math.max(0, Math.min(1, rate));
  const segment = t < 0.5 ? 0 : 1;
  const localT = segment === 0 ? t * 2 : (t - 0.5) * 2;
  const from = COLOR_STOPS[segment];
  const to = COLOR_STOPS[segment + 1];
  const r = Math.round(from.r + (to.r - from.r) * localT);
  const g = Math.round(from.g + (to.g - from.g) * localT);
  const b = Math.round(from.b + (to.b - from.b) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

export interface ServiceHealthCardProps {
  usage: UsagePayload | null;
  loading: boolean;
}

export function ServiceHealthCard({ usage, loading }: ServiceHealthCardProps) {
  const { t } = useTranslation();
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const healthData: ServiceHealthData = useMemo(() => {
    const details = usage ? collectUsageDetails(usage) : [];
    return calculateServiceHealthData(details);
  }, [usage]);

  const displayBlockDetails = useMemo<StatusBlockDetail[]>(() => {
    const details = healthData.blockDetails;
    if (!Array.isArray(details) || details.length === 0) return [];

    if (DISPLAY_GROUP_SIZE <= 1) return details;

    const grouped: StatusBlockDetail[] = [];
    for (let idx = 0; idx < details.length; idx += DISPLAY_GROUP_SIZE) {
      const chunk = details.slice(idx, idx + DISPLAY_GROUP_SIZE);
      const success = chunk.reduce((sum, item) => sum + item.success, 0);
      const failure = chunk.reduce((sum, item) => sum + item.failure, 0);
      const total = success + failure;
      grouped.push({
        success,
        failure,
        rate: total > 0 ? success / total : -1,
        startTime: chunk[0].startTime,
        endTime: chunk[chunk.length - 1].endTime,
      });
    }
    return grouped;
  }, [healthData.blockDetails]);

  const displayRows = DISPLAY_ROWS;
  const displayCols = Math.max(1, Math.ceil(displayBlockDetails.length / displayRows));

  const hasData = healthData.totalSuccess + healthData.totalFailure > 0;
  const totalRequests = healthData.totalSuccess + healthData.totalFailure;

  useEffect(() => {
    if (activeTooltip === null) return;
    const handler = (e: PointerEvent) => {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [activeTooltip]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
  }, []);

  const handlePointerEnter = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'mouse') {
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      setActiveTooltip(idx);
    }
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current);
      }
      leaveTimerRef.current = window.setTimeout(() => {
        setActiveTooltip(null);
        leaveTimerRef.current = null;
      }, 90);
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      setActiveTooltip((prev) => (prev === idx ? null : idx));
    }
  }, []);

  const getTooltipPositionClass = (idx: number): string => {
    const col = Math.floor(idx / displayRows);
    if (col <= 1) return styles.healthTooltipLeft;
    if (col >= displayCols - 2) return styles.healthTooltipRight;
    return '';
  };

  const getTooltipVerticalClass = (idx: number): string => {
    const row = idx % displayRows;
    if (row <= 1) return styles.healthTooltipBelow;
    return '';
  };

  const renderTooltip = (detail: StatusBlockDetail, idx: number) => {
    const total = detail.success + detail.failure;
    const posClass = getTooltipPositionClass(idx);
    const vertClass = getTooltipVerticalClass(idx);
    const timeRange = `${formatDateTime(detail.startTime)} – ${formatDateTime(detail.endTime)}`;

    return (
      <div className={`${styles.healthTooltip} ${posClass} ${vertClass}`}>
        <span className={styles.healthTooltipTime}>{timeRange}</span>
        {total > 0 ? (
          <span className={styles.healthTooltipStats}>
            <span className={styles.healthTooltipSuccess}>{t('stats.success')} {detail.success}</span>
            <span className={styles.healthTooltipFailure}>{t('stats.failure')} {detail.failure}</span>
            <span className={styles.healthTooltipRate}>({(detail.rate * 100).toFixed(1)}%)</span>
          </span>
        ) : (
          <span className={styles.healthTooltipStats}>{t('status_bar.no_requests')}</span>
        )}
      </div>
    );
  };

  const rateClass = !hasData
    ? ''
    : healthData.successRate >= 90
      ? styles.healthRateHigh
      : healthData.successRate >= 50
        ? styles.healthRateMedium
        : styles.healthRateLow;

  return (
    <div className={styles.healthCard}>
      <div className={styles.healthHeader}>
        <h3 className={styles.healthTitle}>{t('service_health.title')}</h3>
        <div className={styles.healthMeta}>
          <span className={styles.healthWindow}>{t('service_health.window')}</span>
          <span className={`${styles.healthRate} ${rateClass}`}>
            {loading ? '--' : hasData ? `${healthData.successRate.toFixed(1)}%` : '--'}
          </span>
        </div>
      </div>
      <div className={styles.healthSummary}>
        <span className={`${styles.healthSummaryItem} ${styles.healthSummarySuccess}`}>
          <span className={styles.healthSummaryLabel}>
            <span className={`${styles.healthSummaryIcon} ${styles.healthSummaryIconSuccess}`} aria-hidden="true">
              <IconCheck size={12} />
            </span>
            {t('stats.success')}
          </span>
          <span className={styles.healthSummaryValue}>{healthData.totalSuccess.toLocaleString()}</span>
        </span>
        <span className={`${styles.healthSummaryItem} ${styles.healthSummaryFailure}`}>
          <span className={styles.healthSummaryLabel}>
            <span className={`${styles.healthSummaryIcon} ${styles.healthSummaryIconFailure}`} aria-hidden="true">
              <IconX size={12} />
            </span>
            {t('stats.failure')}
          </span>
          <span className={styles.healthSummaryValue}>{healthData.totalFailure.toLocaleString()}</span>
        </span>
        <span className={styles.healthSummaryItem}>
          <span className={styles.healthSummaryLabel}>{t('usage_stats.total_requests')}</span>
          <span className={styles.healthSummaryValue}>{totalRequests.toLocaleString()}</span>
        </span>
      </div>
      <div className={styles.healthGridPanel}>
        <div className={styles.healthGridScroller}>
          <div
            className={styles.healthGrid}
            ref={gridRef}
            style={{ '--health-rows': displayRows } as React.CSSProperties}
          >
          {displayBlockDetails.map((detail, idx) => {
            const isIdle = detail.rate === -1;
            const blockStyle = isIdle ? undefined : { backgroundColor: rateToColor(detail.rate) };
            const isActive = activeTooltip === idx;

            return (
              <div
                key={idx}
                className={`${styles.healthBlockWrapper} ${isActive ? styles.healthBlockActive : ''}`}
                onPointerEnter={(e) => handlePointerEnter(e, idx)}
                onPointerLeave={handlePointerLeave}
                onPointerDown={(e) => handlePointerDown(e, idx)}
              >
                <div
                  className={`${styles.healthBlock} ${isIdle ? styles.healthBlockIdle : ''}`}
                  style={blockStyle}
                />
                {isActive && renderTooltip(detail, idx)}
              </div>
            );
          })}
        </div>
        </div>
        <div className={styles.healthLegend}>
          <span className={styles.healthLegendLabel}>{t('service_health.oldest')}</span>
          <div className={styles.healthLegendColors}>
            <div className={`${styles.healthLegendBlock} ${styles.healthBlockIdle}`} />
            <div className={`${styles.healthLegendBlock} ${styles.healthLegendBlockLow}`} />
            <div className={`${styles.healthLegendBlock} ${styles.healthLegendBlockMid}`} />
            <div className={`${styles.healthLegendBlock} ${styles.healthLegendBlockHigh}`} />
          </div>
          <span className={styles.healthLegendLabel}>{t('service_health.newest')}</span>
        </div>
      </div>
    </div>
  );
}
