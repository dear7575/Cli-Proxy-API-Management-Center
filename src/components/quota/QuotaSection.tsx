/**
 * Generic quota section component.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useQuotaStore, useThemeStore } from '@/stores';
import type { AuthFileItem, ResolvedTheme, ThemeColors } from '@/types';
import { TYPE_COLORS, formatKimiResetHint, formatQuotaResetTime } from '@/utils/quota';
import { formatFileSize } from '@/utils/format';
import { formatModified } from '@/features/authFiles/constants';
import { QuotaProgressBar, type QuotaStatusState } from './QuotaCard';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig } from './quotaConfigs';
import { IconEye, IconRefreshCw } from '@/components/ui/icons';
import styles from '@/pages/QuotaPage.module.scss';
import type {
  AntigravityQuotaGroup,
  AntigravityQuotaState,
  ClaudeQuotaState,
  ClaudeQuotaWindow,
  CodexQuotaState,
  CodexQuotaWindow,
  GeminiCliQuotaBucketState,
  GeminiCliQuotaState,
  KimiQuotaRow,
  KimiQuotaState
} from '@/types';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

type PaginationItem = number | 'left-ellipsis' | 'right-ellipsis';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];
const MAX_ITEMS_PER_PAGE = 50;

interface QuotaMetric {
  label: string;
  percent: number | null;
  resetLabel: string;
  amountLabel?: string | null;
  highThreshold?: number;
  mediumThreshold?: number;
}

interface QuotaSplitCells {
  plan: ReactNode;
  primary: ReactNode;
  secondary: ReactNode;
}

interface QuotaPaginationState<T> {
  pageSize: number;
  totalPages: number;
  currentPage: number;
  pageItems: T[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  goToPrev: () => void;
  goToNext: () => void;
  loading: boolean;
  setLoading: (loading: boolean, scope?: 'page' | 'all' | null) => void;
}

const useQuotaPagination = <T,>(items: T[], defaultPageSize = DEFAULT_PAGE_SIZE): QuotaPaginationState<T> => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [loading, setLoadingState] = useState(false);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize]
  );

  const currentPage = useMemo(() => Math.min(page, totalPages), [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const goToPrev = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const setLoading = useCallback((isLoading: boolean) => {
    setLoadingState(isLoading);
  }, []);

  return {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPage,
    setPageSize,
    goToPrev,
    goToNext,
    loading,
    setLoading
  };
};

interface QuotaSectionProps<TState extends QuotaStatusState, TData> {
  config: QuotaConfig<TState, TData>;
  files: AuthFileItem[];
  loading: boolean;
  disabled: boolean;
}

const resolveQuotaErrorMessage = (
  t: ReturnType<typeof useTranslation>['t'],
  status: number | undefined,
  fallback: string
): string => {
  if (status === 404) return t('common.quota_update_required');
  if (status === 403) return t('common.quota_check_credential');
  return fallback;
};

const toSortableTimestamp = (value?: string): number => {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

export function QuotaSection<TState extends QuotaStatusState, TData>({
  config,
  files,
  loading,
  disabled
}: QuotaSectionProps<TState, TData>) {
  const { t } = useTranslation();
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  const filteredFiles = useMemo(() => files.filter((file) => config.filterFn(file)), [
    files,
    config
  ]);
  const isCodexSection = config.type === 'codex';
  const isAntigravitySection = config.type === 'antigravity';
  const showSecondaryQuotaColumn = !isAntigravitySection;
  const [antigravityDetailFileName, setAntigravityDetailFileName] = useState<string | null>(null);

  const {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPage,
    setPageSize,
    goToPrev,
    goToNext,
    loading: sectionLoading,
    setLoading
  } = useQuotaPagination(filteredFiles, DEFAULT_PAGE_SIZE);

  const paginationItems = useMemo<PaginationItem[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const items: PaginationItem[] = [1];
    let start = Math.max(2, currentPage - 1);
    let end = Math.min(totalPages - 1, currentPage + 1);

    if (currentPage <= 3) {
      start = 2;
      end = 4;
    } else if (currentPage >= totalPages - 2) {
      start = totalPages - 3;
      end = totalPages - 1;
    }

    if (start > 2) {
      items.push('left-ellipsis');
    }

    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      items.push(pageNumber);
    }

    if (end < totalPages - 1) {
      items.push('right-ellipsis');
    }

    items.push(totalPages);
    return items;
  }, [currentPage, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [setPage, filteredFiles.length]);

  useEffect(() => {
    if (currentPage <= totalPages) return;
    setPage(totalPages);
  }, [currentPage, totalPages, setPage]);

  const { quota, loadQuota } = useQuotaLoader(config);

  const pendingQuotaRefreshRef = useRef(false);
  const prevFilesLoadingRef = useRef(loading);

  const handleRefresh = useCallback(() => {
    pendingQuotaRefreshRef.current = true;
    void triggerHeaderRefresh();
  }, []);

  useEffect(() => {
    const wasLoading = prevFilesLoadingRef.current;
    prevFilesLoadingRef.current = loading;

    if (!pendingQuotaRefreshRef.current) return;
    if (loading) return;
    if (!wasLoading) return;

    pendingQuotaRefreshRef.current = false;
    if (pageItems.length === 0) return;
    loadQuota(pageItems, 'page', setLoading);
  }, [loading, pageItems, loadQuota, setLoading]);

  useEffect(() => {
    if (loading) return;
    if (filteredFiles.length === 0) {
      setQuota({});
      return;
    }
    setQuota((prev) => {
      const nextState: Record<string, TState> = {};
      filteredFiles.forEach((file) => {
        const cached = prev[file.name];
        if (cached) {
          nextState[file.name] = cached;
        }
      });
      return nextState;
    });
  }, [filteredFiles, loading, setQuota]);

  const typeBadgeStyleByFile = useCallback(
    (file: AuthFileItem): ThemeColors => {
      const displayType = file.type || file.provider || config.type;
      const typeColorSet = TYPE_COLORS[displayType] || TYPE_COLORS.unknown;
      return resolvedTheme === 'dark' && typeColorSet.dark ? typeColorSet.dark : typeColorSet.light;
    },
    [config.type, resolvedTheme]
  );

  const getTypeLabel = useCallback(
    (type: string): string => {
      const key = `auth_files.filter_${type}`;
      const translated = t(key);
      if (translated !== key) return translated;
      if (type.toLowerCase() === 'iflow') return 'iFlow';
      return type.charAt(0).toUpperCase() + type.slice(1);
    },
    [t]
  );

  const renderQuotaMetric = useCallback((metric: QuotaMetric | null) => {
    if (!metric) {
      return <span className={styles.quotaCodexEmpty}>-</span>;
    }

    const normalizedPercent =
      metric.percent === null ? null : Math.max(0, Math.min(100, metric.percent));
    const percentLabel = normalizedPercent === null ? '--' : `${Math.round(normalizedPercent)}%`;

    return (
      <div className={styles.quotaCodexWindowCell}>
        <div className={styles.quotaCodexWindowMeta}>
          <span className={styles.quotaCodexPercent}>{percentLabel}</span>
          {metric.amountLabel ? (
            <span className={styles.quotaAmount}>{metric.amountLabel}</span>
          ) : null}
          <span className={styles.quotaCodexReset}>{metric.resetLabel || '-'}</span>
        </div>
        <QuotaProgressBar
          percent={normalizedPercent}
          highThreshold={metric.highThreshold ?? 60}
          mediumThreshold={metric.mediumThreshold ?? 20}
        />
      </div>
    );
  }, []);

  const resolveCodexPlanLabel = useCallback(
    (planType?: string | null): string => {
      const normalized = String(planType || '').trim().toLowerCase();
      if (!normalized) return '-';
      if (normalized === 'plus') return t('codex_quota.plan_plus');
      if (normalized === 'team') return t('codex_quota.plan_team');
      if (normalized === 'free') return t('codex_quota.plan_free');
      return planType || '-';
    },
    [t]
  );

  const toCodexMetric = useCallback((window: CodexQuotaWindow | null): QuotaMetric | null => {
    if (!window) return null;
    const used = window.usedPercent;
    const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
    const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));

    return {
      label: window.label,
      percent: remaining,
      resetLabel: window.resetLabel,
      highThreshold: 80,
      mediumThreshold: 50
    };
  }, []);

  const toClaudeMetric = useCallback((window: ClaudeQuotaWindow | null): QuotaMetric | null => {
    if (!window) return null;
    const used = window.usedPercent;
    const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
    const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));

    return {
      label: window.label,
      percent: remaining,
      resetLabel: window.resetLabel,
      highThreshold: 80,
      mediumThreshold: 50
    };
  }, []);

  const toAntigravityMetric = useCallback((group: AntigravityQuotaGroup | null): QuotaMetric | null => {
    if (!group) return null;
    const fraction = Math.max(0, Math.min(1, group.remainingFraction));
    return {
      label: group.label,
      percent: Math.round(fraction * 100),
      resetLabel: formatQuotaResetTime(group.resetTime),
      highThreshold: 60,
      mediumThreshold: 20
    };
  }, []);

  const toGeminiMetric = useCallback(
    (bucket: GeminiCliQuotaBucketState | null): QuotaMetric | null => {
      if (!bucket) return null;
      const fraction = bucket.remainingFraction;
      const clamped = fraction === null ? null : Math.max(0, Math.min(1, fraction));
      const percent = clamped === null ? null : Math.round(clamped * 100);
      return {
        label: bucket.label,
        percent,
        resetLabel: formatQuotaResetTime(bucket.resetTime),
        amountLabel:
          bucket.remainingAmount === null || bucket.remainingAmount === undefined
            ? null
            : t('gemini_cli_quota.remaining_amount', { count: bucket.remainingAmount }),
        highThreshold: 60,
        mediumThreshold: 20
      };
    },
    [t]
  );

  const toKimiMetric = useCallback(
    (row: KimiQuotaRow | null): QuotaMetric | null => {
      if (!row) return null;
      const remaining =
        row.limit > 0 ? Math.max(0, Math.min(100, Math.round(((row.limit - row.used) / row.limit) * 100))) : row.used > 0 ? 0 : null;
      const label = row.labelKey
        ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
        : row.label ?? '-';
      return {
        label,
        percent: remaining,
        resetLabel: formatKimiResetHint(t, row.resetHint) || '-',
        amountLabel: row.limit > 0 ? `${row.used} / ${row.limit}` : null,
        highThreshold: 60,
        mediumThreshold: 20
      };
    },
    [t]
  );

  const resolveAntigravityGroups = useCallback(
    (fileName: string): AntigravityQuotaGroup[] => {
      if (config.type !== 'antigravity') return [];
      const state = quota[fileName] as unknown as AntigravityQuotaState | undefined;
      if (state?.status !== 'success') return [];
      return Array.isArray(state.groups) ? state.groups : [];
    },
    [config.type, quota]
  );

  const resolveAntigravitySummary = useCallback(
    (groups: AntigravityQuotaGroup[]) => {
      if (groups.length === 0) {
        return {
          modelCount: 0,
          lowestRemainingGroup: null as AntigravityQuotaGroup | null,
          nearestResetLabel: '-'
        };
      }

      const sortedByRemaining = [...groups].sort((a, b) => {
        if (a.remainingFraction === b.remainingFraction) return a.label.localeCompare(b.label);
        return a.remainingFraction - b.remainingFraction;
      });

      const sortedByReset = [...groups].sort(
        (a, b) => toSortableTimestamp(a.resetTime) - toSortableTimestamp(b.resetTime)
      );
      const nearestReset = sortedByReset.find((group) => Number.isFinite(toSortableTimestamp(group.resetTime)));

      return {
        modelCount: groups.length,
        lowestRemainingGroup: sortedByRemaining[0] ?? null,
        nearestResetLabel: nearestReset ? formatQuotaResetTime(nearestReset.resetTime) : '-'
      };
    },
    []
  );

  const antigravityDetailData = useMemo(() => {
    if (config.type !== 'antigravity' || !antigravityDetailFileName) return null;

    const file = filteredFiles.find((item) => item.name === antigravityDetailFileName);
    if (!file) return null;

    const groups = resolveAntigravityGroups(file.name);
    const sortedGroups = [...groups].sort((a, b) => {
      if (a.remainingFraction === b.remainingFraction) {
        return a.label.localeCompare(b.label);
      }
      return a.remainingFraction - b.remainingFraction;
    });

    const summary = resolveAntigravitySummary(sortedGroups);
    const lowestRemainingPercent = summary.lowestRemainingGroup
      ? Math.round(Math.max(0, Math.min(1, summary.lowestRemainingGroup.remainingFraction)) * 100)
      : null;

    return {
      file,
      groups: sortedGroups,
      summary,
      lowestRemainingPercent
    };
  }, [
    antigravityDetailFileName,
    config.type,
    filteredFiles,
    resolveAntigravityGroups,
    resolveAntigravitySummary
  ]);

  useEffect(() => {
    if (config.type === 'antigravity') return;
    if (antigravityDetailFileName === null) return;
    setAntigravityDetailFileName(null);
  }, [antigravityDetailFileName, config.type]);

  const renderSplitCells = useCallback(
    (file: AuthFileItem): QuotaSplitCells => {
      const quotaState = quota[file.name] as unknown as
        | CodexQuotaState
        | ClaudeQuotaState
        | AntigravityQuotaState
        | GeminiCliQuotaState
        | KimiQuotaState
        | undefined;
      const status = quotaState?.status ?? 'idle';
      const idleHint = t(config.cardIdleMessageKey ?? `${config.i18nPrefix}.idle`);

      if (status === 'loading') {
        return {
          plan: <span className={styles.quotaCodexEmpty}>-</span>,
          primary: <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.loading`)}</div>,
          secondary: <span className={styles.quotaCodexEmpty}>-</span>
        };
      }

      if (status === 'idle') {
        return {
          plan: <span className={styles.quotaCodexEmpty}>-</span>,
          primary: <div className={styles.quotaMessage}>{idleHint}</div>,
          secondary: <span className={styles.quotaCodexEmpty}>-</span>
        };
      }

      if (status === 'error') {
        const errorMessage = resolveQuotaErrorMessage(
          t,
          quotaState?.errorStatus,
          quotaState?.error || t('common.unknown_error')
        );
        return {
          plan: <span className={styles.quotaCodexEmpty}>-</span>,
          primary: (
            <div className={styles.quotaError}>
              {t(`${config.i18nPrefix}.load_failed`, {
                message: errorMessage
              })}
            </div>
          ),
          secondary: <span className={styles.quotaCodexEmpty}>-</span>
        };
      }

      if (config.type === 'codex') {
        const codexState = quotaState as CodexQuotaState;
        const windows = Array.isArray(codexState?.windows) ? codexState.windows : [];
        const weekly =
          windows.find((window) => window.id === 'weekly') ??
          windows.find((window) => window.id.includes('weekly') && !window.id.includes('code-review')) ??
          null;
        const reviewWeekly =
          windows.find((window) => window.id === 'code-review-weekly') ??
          windows.find((window) => window.id.includes('code-review') && window.id.includes('weekly')) ??
          null;
        return {
          plan: <span className={styles.quotaPlanBadge}>{resolveCodexPlanLabel(codexState?.planType)}</span>,
          primary: renderQuotaMetric(toCodexMetric(weekly)),
          secondary: renderQuotaMetric(toCodexMetric(reviewWeekly))
        };
      }

      if (config.type === 'claude') {
        const claudeState = quotaState as ClaudeQuotaState;
        const windows = Array.isArray(claudeState?.windows) ? claudeState.windows : [];
        const primaryWindow =
          windows.find((window) => window.id === 'five-hour') ?? windows[0] ?? null;
        const secondaryWindow =
          windows.find((window) => window.id === 'seven-day') ??
          windows.find((window) => window.id.includes('seven-day')) ??
          windows[1] ??
          null;
        const extraUsage = claudeState?.extraUsage;
        const planLabel =
          extraUsage && extraUsage.is_enabled
            ? `$${(extraUsage.used_credits / 100).toFixed(2)} / $${(extraUsage.monthly_limit / 100).toFixed(2)}`
            : '-';
        return {
          plan: <span className={styles.quotaPlanBadge}>{planLabel}</span>,
          primary: renderQuotaMetric(toClaudeMetric(primaryWindow)),
          secondary: renderQuotaMetric(toClaudeMetric(secondaryWindow))
        };
      }

      if (config.type === 'antigravity') {
        const antState = quotaState as AntigravityQuotaState;
        const groups = Array.isArray(antState?.groups) ? antState.groups : [];
        const summary = resolveAntigravitySummary(groups);
        const modelCountLabel = t('quota_management.model_count', {
          count: summary.modelCount,
          defaultValue: `${summary.modelCount} 个模型`
        });
        return {
          plan: <span className={styles.quotaPlanBadge}>{modelCountLabel}</span>,
          primary: renderQuotaMetric(toAntigravityMetric(summary.lowestRemainingGroup)),
          secondary: <span className={styles.quotaCodexEmpty}>-</span>
        };
      }

      if (config.type === 'gemini-cli') {
        const geminiState = quotaState as GeminiCliQuotaState;
        const buckets = Array.isArray(geminiState?.buckets) ? geminiState.buckets : [];
        return {
          plan: <span className={styles.quotaCodexEmpty}>-</span>,
          primary: renderQuotaMetric(toGeminiMetric(buckets[0] ?? null)),
          secondary: renderQuotaMetric(toGeminiMetric(buckets[1] ?? null))
        };
      }

      if (config.type === 'kimi') {
        const kimiState = quotaState as KimiQuotaState;
        const rows = Array.isArray(kimiState?.rows) ? kimiState.rows : [];
        return {
          plan: <span className={styles.quotaCodexEmpty}>-</span>,
          primary: renderQuotaMetric(toKimiMetric(rows[0] ?? null)),
          secondary: renderQuotaMetric(toKimiMetric(rows[1] ?? null))
        };
      }

      return {
        plan: <span className={styles.quotaCodexEmpty}>-</span>,
        primary: <div className={styles.quotaMessage}>{idleHint}</div>,
        secondary: <span className={styles.quotaCodexEmpty}>-</span>
      };
    },
    [
      config.cardIdleMessageKey,
      config.i18nPrefix,
      config.type,
      quota,
      resolveCodexPlanLabel,
      renderQuotaMetric,
      resolveAntigravitySummary,
      t,
      toAntigravityMetric,
      toClaudeMetric,
      toCodexMetric,
      toGeminiMetric,
      toKimiMetric
    ]
  );

  const refreshSingleFileQuota = useCallback(
    (file: AuthFileItem) => {
      if (disabled || sectionLoading || loading) return;
      void loadQuota([file], 'page', setLoading);
    },
    [disabled, loadQuota, loading, sectionLoading, setLoading]
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t(`${config.i18nPrefix}.title`)}</span>
      {filteredFiles.length > 0 && <span className={styles.countBadge}>{filteredFiles.length}</span>}
    </div>
  );

  const isRefreshing = sectionLoading || loading;

  return (
    <Card
      title={titleNode}
      extra={
        <Button
          variant="secondary"
          size="sm"
          className={styles.sectionRefreshButton}
          onClick={handleRefresh}
          disabled={disabled || isRefreshing}
          loading={isRefreshing}
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
        >
          {!isRefreshing && <IconRefreshCw size={16} />}
          <span>{t('common.refresh')}</span>
        </Button>
      }
    >
      {filteredFiles.length === 0 ? (
        <EmptyState
          title={t(`${config.i18nPrefix}.empty_title`)}
          description={t(`${config.i18nPrefix}.empty_desc`)}
        />
      ) : (
        <>
          <div className={styles.quotaTableWrapper}>
            <table className={`${styles.quotaTable} ${isCodexSection ? styles.quotaTableCodex : ''}`}>
              <colgroup>
                <col className={styles.quotaColIndex} />
                <col className={styles.quotaColName} />
                <col className={styles.quotaColType} />
                <col className={styles.quotaColSize} />
                <col className={styles.quotaColModified} />
                <col className={styles.quotaColPlan} />
                <col className={styles.quotaColPrimary} />
                {showSecondaryQuotaColumn ? <col className={styles.quotaColSecondary} /> : null}
                <col className={styles.quotaColActions} />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('common.serial_number', { defaultValue: '序号' })}</th>
                  <th>{t('auth_files.file_name', { defaultValue: '文件名' })}</th>
                  <th>{t('auth_files.file_type', { defaultValue: '类型' })}</th>
                  <th>{t('auth_files.file_size', { defaultValue: '大小' })}</th>
                  <th>{t('auth_files.file_modified', { defaultValue: '修改时间' })}</th>
                  <th>
                    {isAntigravitySection
                      ? t('quota_management.detail_col_model_count', { defaultValue: '模型数' })
                      : t('quota_management.detail_col_plan', { defaultValue: '套餐' })}
                  </th>
                  <th>
                    {isCodexSection
                      ? t('quota_management.detail_col_weekly', { defaultValue: '周限额' })
                      : isAntigravitySection
                        ? t('quota_management.detail_col_lowest_remaining', { defaultValue: '最低剩余' })
                      : t('quota_management.detail_col_primary', { defaultValue: '主限额' })}
                  </th>
                  {showSecondaryQuotaColumn ? (
                    <th>
                      {isCodexSection
                        ? t('quota_management.detail_col_review_weekly', { defaultValue: '代码审查周限额' })
                        : t('quota_management.detail_col_secondary', { defaultValue: '次限额' })}
                    </th>
                  ) : null}
                  <th>{t('common.action', { defaultValue: '操作' })}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((file, index) => {
                  const rowIndex = (currentPage - 1) * pageSize + index + 1;
                  const displayType = file.type || file.provider || config.type;
                  const typeColor = typeBadgeStyleByFile(file);
                  const splitCells = renderSplitCells(file);
                  const antigravityGroups = resolveAntigravityGroups(file.name);
                  const canViewAntigravityDetails =
                    config.type === 'antigravity' && antigravityGroups.length > 0;
                  return (
                    <tr key={file.name} className={styles.quotaTableRow}>
                      <td className={styles.quotaCellIndex}>{rowIndex}</td>
                      <td className={styles.quotaCellName}>
                        <span className={styles.quotaCellNameText} title={file.name}>{file.name}</span>
                      </td>
                      <td className={styles.quotaCellType}>
                        <span
                          className={styles.typeBadge}
                          style={{
                            backgroundColor: typeColor.bg,
                            color: typeColor.text,
                            ...(typeColor.border ? { border: typeColor.border } : {})
                          }}
                        >
                          {getTypeLabel(displayType)}
                        </span>
                      </td>
                      <td className={styles.quotaCellSize}>{file.size ? formatFileSize(file.size) : '-'}</td>
                      <td className={styles.quotaCellModified}>{formatModified(file)}</td>
                      <td className={styles.quotaCellPlan}>{splitCells.plan}</td>
                      <td className={styles.quotaCellPrimary}>{splitCells.primary}</td>
                      {showSecondaryQuotaColumn ? (
                        <td className={styles.quotaCellSecondary}>{splitCells.secondary}</td>
                      ) : null}
                      <td className={styles.quotaCellActions}>
                        <div className={styles.quotaActionGroup}>
                          {canViewAntigravityDetails ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className={styles.quotaActionButton}
                              onClick={() => setAntigravityDetailFileName(file.name)}
                              disabled={disabled || isRefreshing}
                              title={t('quota_management.view_model_quota_detail', { defaultValue: '查看模型额度明细' })}
                              aria-label={t('quota_management.view_model_quota_detail', { defaultValue: '查看模型额度明细' })}
                            >
                              <IconEye size={14} />
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            size="sm"
                            className={styles.quotaActionButton}
                            onClick={() => refreshSingleFileQuota(file)}
                            disabled={disabled || isRefreshing}
                            title={t('quota_management.refresh_files_and_quota')}
                            aria-label={t('quota_management.refresh_files_and_quota')}
                          >
                            <IconRefreshCw size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredFiles.length > pageSize ? (
            <div className={`provider-list-pagination ${styles.pagination}`}>
              <span className="provider-list-pagination-meta">
                {t('auth_files.pagination_info', {
                  current: currentPage,
                  total: totalPages,
                  count: filteredFiles.length
                })}
              </span>
              <div className="provider-list-pagination-controls">
                <div className="provider-list-page-size">
                  <select
                    className="input provider-list-page-size-select"
                    value={pageSize}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next) || next <= 0 || next > MAX_ITEMS_PER_PAGE) return;
                      setPageSize(next);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <Button variant="secondary" size="sm" onClick={goToPrev} disabled={currentPage <= 1}>
                  {t('auth_files.pagination_prev')}
                </Button>
                <div className="provider-list-pagination-pages" aria-label={t('common.pagination', { defaultValue: '分页' })}>
                  {paginationItems.map((item) => {
                    if (typeof item !== 'number') {
                      return (
                        <span key={item} className="provider-list-pagination-ellipsis" aria-hidden="true">
                          ...
                        </span>
                      );
                    }

                    const isActive = item === currentPage;
                    return (
                      <Button
                        key={item}
                        size="sm"
                        variant={isActive ? 'primary' : 'secondary'}
                        className="provider-list-page-button"
                        onClick={() => setPage(item)}
                        disabled={isActive}
                      >
                        {item}
                      </Button>
                    );
                  })}
                </div>
                <Button variant="secondary" size="sm" onClick={goToNext} disabled={currentPage >= totalPages}>
                  {t('auth_files.pagination_next')}
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.paginationSingleLine}>
              <span className={styles.sectionStats}>
                {t('auth_files.pagination_info', {
                  current: 1,
                  total: 1,
                  count: filteredFiles.length
                })}
              </span>
            </div>
          )}
        </>
      )}
      <Modal
        open={Boolean(antigravityDetailData)}
        onClose={() => setAntigravityDetailFileName(null)}
        title={t('quota_management.model_quota_detail_title', { defaultValue: '模型额度明细' })}
        width="min(920px, 92vw)"
        className={styles.quotaDetailModal}
      >
        {antigravityDetailData ? (
          <div className={styles.quotaDetailContent}>
            <div className={styles.quotaDetailHeader}>
              <span className={styles.quotaDetailFileName} title={antigravityDetailData.file.name}>
                {antigravityDetailData.file.name}
              </span>
              <div className={styles.quotaDetailSummary}>
                <span className={styles.quotaSummaryItem}>
                  {t('quota_management.model_count', {
                    count: antigravityDetailData.summary.modelCount,
                    defaultValue: `${antigravityDetailData.summary.modelCount} 个模型`
                  })}
                </span>
                <span className={styles.quotaSummaryItem}>
                  {t('quota_management.lowest_remaining', {
                    defaultValue: '最低剩余'
                  })}
                  {': '}
                  {antigravityDetailData.lowestRemainingPercent === null
                    ? '-'
                    : `${antigravityDetailData.lowestRemainingPercent}%`}
                </span>
                <span className={styles.quotaSummaryItem}>
                  {t('quota_management.nearest_reset', { defaultValue: '最近重置' })}
                  {': '}
                  {antigravityDetailData.summary.nearestResetLabel}
                </span>
              </div>
            </div>

            <div className={styles.quotaDetailTableWrapper}>
              <table className={styles.quotaDetailTable}>
                <colgroup>
                  <col className={styles.quotaDetailColIndex} />
                  <col className={styles.quotaDetailColGroup} />
                  <col className={styles.quotaDetailColModel} />
                  <col className={styles.quotaDetailColRemain} />
                  <col className={styles.quotaDetailColReset} />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('common.serial_number', { defaultValue: '序号' })}</th>
                    <th>{t('quota_management.quota_group', { defaultValue: '配额组' })}</th>
                    <th>{t('quota_management.model_name', { defaultValue: '模型' })}</th>
                    <th>{t('quota_management.remaining_quota', { defaultValue: '剩余额度' })}</th>
                    <th>{t('quota_management.reset_time', { defaultValue: '重置时间' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {antigravityDetailData.groups.map((group, index) => {
                    const remainingPercent = Math.round(
                      Math.max(0, Math.min(1, group.remainingFraction)) * 100
                    );
                    const toneClass =
                      remainingPercent <= 20
                        ? styles.quotaRemainDanger
                        : remainingPercent <= 60
                          ? styles.quotaRemainWarning
                          : styles.quotaRemainHealthy;
                    return (
                      <tr key={`${group.id}-${group.label}`}>
                        <td>{index + 1}</td>
                        <td title={group.label}>{group.label}</td>
                        <td title={group.models.join(', ')}>
                          {group.models.length > 0 ? (
                            <div className={styles.quotaModelPills}>
                              {group.models.map((model) => (
                                <span key={`${group.id}-${model}`} className={styles.quotaModelPill} title={model}>
                                  {model}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className={styles.quotaCodexEmpty}>-</span>
                          )}
                        </td>
                        <td>
                          <div className={styles.quotaDetailRemainingCell}>
                            <span className={`${styles.quotaRemainBadge} ${toneClass}`}>
                              {remainingPercent}%
                            </span>
                            <QuotaProgressBar
                              percent={remainingPercent}
                              highThreshold={60}
                              mediumThreshold={20}
                            />
                          </div>
                        </td>
                        <td>{formatQuotaResetTime(group.resetTime)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}
