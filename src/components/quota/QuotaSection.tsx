/**
 * Generic quota section component.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type { AuthFileItem, ResolvedTheme, ThemeColors } from '@/types';
import { isRetryableRequestError, runTasksWithConcurrency } from '@/utils/batch';
import { TYPE_COLORS, formatKimiResetHint, formatQuotaResetTime } from '@/utils/quota';
import { formatFileSize } from '@/utils/format';
import {
  formatModified,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile
} from '@/features/authFiles/constants';
import { CountTooltipCell } from '@/components/providers/CountTooltipCell';
import { QuotaProgressBar, type QuotaStatusState } from './QuotaCard';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig } from './quotaConfigs';
import { IconRefreshCw } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api';
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
const PAGE_SIZE_OPTIONS = [10, 30, 50, 100];
const MAX_ITEMS_PER_PAGE = 100;
const REFRESH_CHUNK_SIZE = 10;
const BULK_CONCURRENCY = 4;
const BULK_RETRY = 2;
const BULK_RETRY_DELAY_MS = 300;

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
  onFilesRefresh?: () => void | Promise<void>;
  registerRefreshAll?: (handler: (files: AuthFileItem[]) => void | Promise<void>) => () => void;
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
  disabled,
  onFilesRefresh,
  registerRefreshAll
}: QuotaSectionProps<TState, TData>) {
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;
  const { quota, loadQuota, cancelLoad } = useQuotaLoader(config);

  const filteredFiles = useMemo(() => files.filter((file) => config.filterFn(file)), [
    files,
    config
  ]);
  const [filter, setFilter] = useState<'all' | string>('all');
  const [problemOnly, setProblemOnly] = useState(false);
  const [auth401Only, setAuth401Only] = useState(false);
  const [auth502Only, setAuth502Only] = useState(false);
  const [timeoutOnly, setTimeoutOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [statusOverrides, setStatusOverrides] = useState<Record<string, boolean>>({});
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [bulkRefreshProgress, setBulkRefreshProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const filesMatchingProblemFilter = useMemo(
    () => (problemOnly ? filteredFiles.filter(hasAuthFileStatusMessage) : filteredFiles),
    [filteredFiles, problemOnly]
  );
  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    filesMatchingProblemFilter.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return [
      'all',
      ...Array.from(types)
        .filter((type) => type !== 'all')
        .sort((left, right) => left.localeCompare(right))
    ];
  }, [filesMatchingProblemFilter]);

  useEffect(() => {
    if (filter === 'all') return;
    if (existingTypes.includes(filter)) return;
    setFilter('all');
  }, [existingTypes, filter]);

  const filteredFilesByControls = useMemo(() => {
    const term = search.trim().toLowerCase();
    return filesMatchingProblemFilter.filter((item) => {
      const effectiveDisabled = statusOverrides[item.name] ?? item.disabled;
      const matchType = filter === 'all' || item.type === filter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' ? !effectiveDisabled : Boolean(effectiveDisabled));
      const quotaState = quota[item.name] as QuotaStatusState | undefined;
      const errorText = typeof quotaState?.error === 'string' ? quotaState.error : '';
      const has401 =
        quotaState?.status === 'error' &&
        (quotaState.errorStatus === 401 || errorText.toLowerCase().includes('401'));
      const has502 =
        quotaState?.status === 'error' &&
        (quotaState.errorStatus === 502 || errorText.toLowerCase().includes('502'));
      const hasTimeout =
        quotaState?.status === 'error' &&
        (quotaState.errorStatus === 408 ||
          quotaState.errorStatus === 504 ||
          quotaState.errorStatus === 524 ||
          errorText.toLowerCase().includes('timeout'));
      const errorFiltersActive = auth401Only || auth502Only || timeoutOnly;
      const matchAuthError =
        !errorFiltersActive ||
        (auth401Only && has401) ||
        (auth502Only && has502) ||
        (timeoutOnly && hasTimeout);
      const matchSearch =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.type || '').toString().toLowerCase().includes(term) ||
        (item.provider || '').toString().toLowerCase().includes(term);
      return matchType && matchStatus && matchAuthError && matchSearch;
    });
  }, [
    filesMatchingProblemFilter,
    filter,
    search,
    statusFilter,
    auth401Only,
    auth502Only,
    timeoutOnly,
    quota,
    statusOverrides
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
  } = useQuotaPagination(filteredFilesByControls, DEFAULT_PAGE_SIZE);

  const pageSizeSelectOptions = useMemo(
    () =>
      PAGE_SIZE_OPTIONS.map((size) => ({
        value: String(size),
        label: t('ai_providers.page_size_option', { defaultValue: `${size} 条`, count: size })
      })),
    [t]
  );

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
  }, [setPage, filteredFilesByControls.length]);

  useEffect(() => {
    setPage(1);
    setSelectedNames(new Set());
  }, [filter, problemOnly, auth401Only, auth502Only, timeoutOnly, search, statusFilter, setPage]);

  useEffect(() => {
    if (currentPage <= totalPages) return;
    setPage(totalPages);
  }, [currentPage, totalPages, setPage]);

  useEffect(() => {
    if (selectedNames.size === 0) return;
    const validNames = new Set(filteredFilesByControls.map((item) => item.name));
    setSelectedNames((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((name) => {
        if (validNames.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [filteredFilesByControls, selectedNames.size]);

  const bulkRefreshTokenRef = useRef(0);
  const bulkRefreshSnapshotRef = useRef<Record<string, TState | null> | null>(null);

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

  const typeFilterOptions = useMemo(
    () =>
      existingTypes.map((type) => ({
        value: type,
        label: getTypeLabel(type)
      })),
    [existingTypes, getTypeLabel]
  );

  const selectableFilteredNames = useMemo(
    () => filteredFilesByControls.filter((item) => !isRuntimeOnlyAuthFile(item)).map((item) => item.name),
    [filteredFilesByControls]
  );
  const selectablePageNames = useMemo(
    () => pageItems.filter((item) => !isRuntimeOnlyAuthFile(item)).map((item) => item.name),
    [pageItems]
  );
  const hasSelection = selectedNames.size > 0;
  const selectedTargets = useMemo(() => {
    if (selectedNames.size === 0) return [];
    const nameIndex = new Map(filteredFilesByControls.map((item) => [item.name, item]));
    return Array.from(selectedNames)
      .map((name) => nameIndex.get(name))
      .filter((item): item is AuthFileItem => Boolean(item));
  }, [filteredFilesByControls, selectedNames]);
  const isCurrentPageFullySelected =
    selectablePageNames.length > 0 && selectablePageNames.every((name) => selectedNames.has(name));
  const isAllFilteredSelected =
    selectableFilteredNames.length > 0 && selectableFilteredNames.every((name) => selectedNames.has(name));

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

    const file = filteredFilesByControls.find((item) => item.name === antigravityDetailFileName);
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
    filteredFilesByControls,
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
        const canViewDetails = groups.length > 0;
        const planNode = canViewDetails ? (
          <button
            type="button"
            className={`${styles.quotaPlanBadge} ${styles.quotaPlanButton}`}
            onClick={() => setAntigravityDetailFileName(file.name)}
            title={t('quota_management.view_model_quota_detail', { defaultValue: '查看模型额度明细' })}
            aria-label={t('quota_management.view_model_quota_detail', { defaultValue: '查看模型额度明细' })}
          >
            {modelCountLabel}
          </button>
        ) : (
          <span className={styles.quotaPlanBadge}>{modelCountLabel}</span>
        );
        return {
          plan: planNode,
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
      setAntigravityDetailFileName,
      t,
      toAntigravityMetric,
      toClaudeMetric,
      toCodexMetric,
      toGeminiMetric,
      toKimiMetric
    ]
  );

  const applySelection = useCallback((names: string[], shouldSelect: boolean) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      names.forEach((name) => {
        if (shouldSelect) {
          next.add(name);
        } else {
          next.delete(name);
        }
      });
      return next;
    });
  }, []);

  const toggleSelect = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const toggleCurrentPageSelection = useCallback(() => {
    if (selectablePageNames.length === 0) return;
    applySelection(selectablePageNames, !isCurrentPageFullySelected);
  }, [applySelection, isCurrentPageFullySelected, selectablePageNames]);

  const toggleAllFilteredSelection = useCallback(() => {
    if (selectableFilteredNames.length === 0) return;
    applySelection(selectableFilteredNames, !isAllFilteredSelected);
  }, [applySelection, isAllFilteredSelected, selectableFilteredNames]);

  const runBulkRefresh = useCallback(
    async (targets: AuthFileItem[]) => {
      if (disabled || bulkRefreshing) return;
      const uniqueTargets = Array.from(new Map(targets.map((item) => [item.name, item])).values());
      if (uniqueTargets.length === 0) return;

      const refreshToken = bulkRefreshTokenRef.current + 1;
      bulkRefreshTokenRef.current = refreshToken;
      setBulkRefreshing(true);
      setBulkRefreshProgress({ done: 0, total: uniqueTargets.length });

      const snapshot: Record<string, TState | null> = {};
      uniqueTargets.forEach((file) => {
        snapshot[file.name] = quota[file.name] ?? null;
      });
      bulkRefreshSnapshotRef.current = snapshot;

      try {
        for (let index = 0; index < uniqueTargets.length; index += REFRESH_CHUNK_SIZE) {
          if (bulkRefreshTokenRef.current !== refreshToken) return;
          const chunk = uniqueTargets.slice(index, index + REFRESH_CHUNK_SIZE);
          await loadQuota(chunk, 'all', setLoading);
          if (bulkRefreshTokenRef.current !== refreshToken) return;
          if (bulkRefreshSnapshotRef.current) {
            chunk.forEach((file) => {
              delete bulkRefreshSnapshotRef.current?.[file.name];
            });
            if (Object.keys(bulkRefreshSnapshotRef.current).length === 0) {
              bulkRefreshSnapshotRef.current = null;
            }
          }
          setBulkRefreshProgress({
            done: Math.min(index + chunk.length, uniqueTargets.length),
            total: uniqueTargets.length
          });
        }
      } finally {
        if (bulkRefreshTokenRef.current === refreshToken) {
          setBulkRefreshing(false);
          setBulkRefreshProgress(null);
          bulkRefreshSnapshotRef.current = null;
        }
      }
    },
    [disabled, bulkRefreshing, loadQuota, quota, setLoading]
  );

  const stopBulkRefresh = useCallback(() => {
    if (!bulkRefreshing) return;
    bulkRefreshTokenRef.current += 1;
    cancelLoad();
    setLoading(false);
    setBulkRefreshing(false);
    setBulkRefreshProgress(null);
    const snapshot = bulkRefreshSnapshotRef.current;
    if (snapshot) {
      setQuota((prev) => {
        const next = { ...prev };
        Object.entries(snapshot).forEach(([name, state]) => {
          if (state === null) {
            delete next[name];
          } else {
            next[name] = state;
          }
        });
        return next;
      });
    }
    bulkRefreshSnapshotRef.current = null;
  }, [bulkRefreshing, cancelLoad, setLoading, setQuota]);

  useEffect(() => {
    if (!registerRefreshAll) return;
    return registerRefreshAll(async (allFiles) => {
      const targets = allFiles.filter((file) => config.filterFn(file));
      await runBulkRefresh(targets);
    });
  }, [config.filterFn, registerRefreshAll, runBulkRefresh]);


  const batchSetStatus = useCallback(
    async (names: string[], enabled: boolean) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;
      if (disabled) return;

      const nextDisabled = !enabled;
      setBatchUpdating(true);
      setStatusOverrides((prev) => {
        const next = { ...prev };
        uniqueNames.forEach((name) => {
          next[name] = nextDisabled;
        });
        return next;
      });
      try {
        const results = await runTasksWithConcurrency(
          uniqueNames,
          (name) => authFilesApi.setStatus(name, nextDisabled),
          {
            concurrency: BULK_CONCURRENCY,
            retry: BULK_RETRY,
            retryDelayMs: BULK_RETRY_DELAY_MS,
            shouldRetry: (error) => isRetryableRequestError(error)
          }
        );

        let successCount = 0;
        let failCount = 0;
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            successCount += 1;
          } else {
            failCount += 1;
          }
        });

        if (failCount === 0) {
          showNotification(t('auth_files.batch_status_success', { count: successCount }), 'success');
        } else {
          showNotification(
            t('auth_files.batch_status_partial', { success: successCount, failed: failCount }),
            failCount === uniqueNames.length ? 'error' : 'warning'
          );
        }

        await onFilesRefresh?.();
      } finally {
        setBatchUpdating(false);
        setStatusOverrides((prev) => {
          const next = { ...prev };
          uniqueNames.forEach((name) => {
            delete next[name];
          });
          return next;
        });
      }
    },
    [disabled, onFilesRefresh, showNotification, t]
  );

  const batchDelete = useCallback(
    (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;
      if (disabled) return;

      showConfirmation({
        title: t('auth_files.batch_delete_title'),
        message: t('auth_files.batch_delete_confirm', { count: uniqueNames.length }),
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setBatchDeleting(true);
          try {
            const results = await runTasksWithConcurrency(
              uniqueNames,
              (name) => authFilesApi.deleteFile(name),
              {
                concurrency: BULK_CONCURRENCY,
                retry: BULK_RETRY,
                retryDelayMs: BULK_RETRY_DELAY_MS,
                shouldRetry: (error) => isRetryableRequestError(error)
              }
            );
            const successCount = results.filter((result) => result.status === 'fulfilled').length;
            const failCount = uniqueNames.length - successCount;

            if (failCount === 0) {
              showNotification(t('auth_files.delete_success'), 'success');
            } else {
              showNotification(
                t('auth_files.batch_status_partial', { success: successCount, failed: failCount }),
                failCount === uniqueNames.length ? 'error' : 'warning'
              );
            }

            await onFilesRefresh?.();
            setSelectedNames(new Set());
          } finally {
            setBatchDeleting(false);
          }
        }
      });
    },
    [disabled, onFilesRefresh, showConfirmation, showNotification, t]
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t(`${config.i18nPrefix}.title`)}</span>
      {filteredFilesByControls.length > 0 && (
        <span className={styles.countBadge}>{filteredFilesByControls.length}</span>
      )}
    </div>
  );

  const isRefreshing = sectionLoading || loading || bulkRefreshing;
  const bulkBusy = batchDeleting || batchUpdating || bulkRefreshing;
  const disableBulkControls = disabled || isRefreshing || bulkBusy;
  const disableSelection = disabled || isRefreshing || bulkBusy;
  const refreshLabel = bulkRefreshProgress
    ? `${t('common.refresh')} (${bulkRefreshProgress.done}/${bulkRefreshProgress.total})`
    : t('common.refresh');
  const handleRefresh = useCallback(() => {
    if (disabled || isRefreshing) return;
    if (selectedTargets.length > 0) {
      void runBulkRefresh(selectedTargets);
      return;
    }
    if (pageItems.length === 0) return;
    void loadQuota(pageItems, 'page', setLoading);
  }, [disabled, isRefreshing, loadQuota, pageItems, runBulkRefresh, selectedTargets, setLoading]);

  return (
    <Card
      title={titleNode}
      extra={
        <div className={styles.sectionRefreshActions}>
          {bulkRefreshing ? (
            <Button variant="danger" size="sm" onClick={stopBulkRefresh}>
              {t('quota_management.stop_refresh', { defaultValue: '停止刷新' })}
            </Button>
          ) : null}
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
            <span>{refreshLabel}</span>
          </Button>
        </div>
      }
    >
      <div className={`provider-list-toolbar ${styles.quotaTableToolbar}`}>
        <div className="provider-list-toolbar-left">
          <div className="provider-list-search">
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('auth_files.search_placeholder')}
            />
          </div>
          <div className={styles.quotaTypeFilter}>
            <Select
              value={filter}
              options={typeFilterOptions}
              onChange={(value) => setFilter(value)}
              className={styles.quotaTypeSelect}
              ariaLabel={t('auth_files.file_type', { defaultValue: '类型' })}
              fullWidth={false}
            />
          </div>
          <div className="provider-list-status-group">
            <Button
              size="sm"
              variant={statusFilter === 'all' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('all')}
            >
              {t('ai_providers.list_filter_all', { defaultValue: '全部' })}
            </Button>
            <Button
              size="sm"
              variant={statusFilter === 'enabled' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('enabled')}
            >
              {t('ai_providers.list_filter_enabled', { defaultValue: '启用' })}
            </Button>
            <Button
              size="sm"
              variant={statusFilter === 'disabled' ? 'primary' : 'secondary'}
              onClick={() => setStatusFilter('disabled')}
            >
              {t('ai_providers.list_filter_disabled', { defaultValue: '停用' })}
            </Button>
          </div>
          <div className="provider-list-status-group">
            <Button
              size="sm"
              variant={problemOnly ? 'primary' : 'secondary'}
              onClick={() => setProblemOnly((prev) => !prev)}
            >
              {t('auth_files.problem_filter_only')}
            </Button>
            <Button
              size="sm"
              variant={auth401Only ? 'primary' : 'secondary'}
              onClick={() => setAuth401Only((prev) => !prev)}
            >
              {t('quota_management.filter_error_401', { defaultValue: '401' })}
            </Button>
            <Button
              size="sm"
              variant={auth502Only ? 'primary' : 'secondary'}
              onClick={() => setAuth502Only((prev) => !prev)}
            >
              {t('quota_management.filter_error_502', { defaultValue: '502' })}
            </Button>
            <Button
              size="sm"
              variant={timeoutOnly ? 'primary' : 'secondary'}
              onClick={() => setTimeoutOnly((prev) => !prev)}
            >
              {t('quota_management.filter_error_timeout', { defaultValue: '超时' })}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setFilter('all');
              setStatusFilter('all');
              setProblemOnly(false);
              setAuth401Only(false);
              setAuth502Only(false);
              setTimeoutOnly(false);
              setSelectedNames(new Set());
            }}
            className="provider-list-reset-btn"
          >
            {t('ai_providers.list_reset_filters', { defaultValue: '重置' })}
          </Button>
        </div>
        <div className="provider-list-toolbar-right">
          {hasSelection ? (
            <span className="provider-list-selected-count">
              {t('auth_files.batch_selected', { count: selectedNames.size })}
            </span>
          ) : null}
          <div className="provider-list-selection-group">
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleCurrentPageSelection}
              disabled={disableSelection || selectablePageNames.length === 0}
            >
              {isCurrentPageFullySelected
                ? t('ai_providers.list_deselect_page')
                : t('ai_providers.list_select_page')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleAllFilteredSelection}
              disabled={disableSelection || selectableFilteredNames.length === 0}
            >
              {isAllFilteredSelected
                ? t('ai_providers.list_deselect_all', { defaultValue: '取消全部' })
                : t('ai_providers.list_select_all')}
            </Button>
          </div>
          <div className="provider-list-bulk-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void batchSetStatus(Array.from(selectedNames), true)}
              disabled={disableBulkControls || !hasSelection}
            >
              {t('auth_files.batch_enable')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void batchSetStatus(Array.from(selectedNames), false)}
              disabled={disableBulkControls || !hasSelection}
            >
              {t('auth_files.batch_disable')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => batchDelete(Array.from(selectedNames))}
              disabled={disableBulkControls || !hasSelection}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </div>

      {filteredFiles.length === 0 ? (
        <EmptyState
          title={t(`${config.i18nPrefix}.empty_title`)}
          description={t(`${config.i18nPrefix}.empty_desc`)}
        />
      ) : filteredFilesByControls.length === 0 ? (
        <EmptyState
          title={t('auth_files.search_empty_title')}
          description={t('auth_files.search_empty_desc')}
        />
      ) : (
        <>
          <div className={styles.quotaTableWrapper}>
            <table className={`${styles.quotaTable} ${isCodexSection ? styles.quotaTableCodex : ''}`}>
              <colgroup>
                <col className={styles.quotaColSelect} />
                <col className={styles.quotaColIndex} />
                <col className={styles.quotaColName} />
                <col className={styles.quotaColType} />
                <col className={styles.quotaColSize} />
                <col className={styles.quotaColModified} />
              <col className={styles.quotaColPlan} />
              <col className={styles.quotaColPrimary} />
              {showSecondaryQuotaColumn ? <col className={styles.quotaColSecondary} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th className="provider-table-col-select" aria-label={t('ai_providers.list_select_row')} />
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
              </tr>
            </thead>
              <tbody>
                {pageItems.map((file, index) => {
                  const rowIndex = (currentPage - 1) * pageSize + index + 1;
                  const displayType = file.type || file.provider || config.type;
                  const typeColor = typeBadgeStyleByFile(file);
                  const splitCells = renderSplitCells(file);
                  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
                  const rowSelected = selectedNames.has(file.name);
                  const rowDisabled = statusOverrides[file.name] ?? file.disabled === true;
                  return (
                    <tr
                      key={file.name}
                      className={`provider-table-row ${styles.quotaTableRow} ${
                        rowDisabled ? 'provider-table-row-disabled' : ''
                      } ${rowSelected ? 'provider-table-row-selected' : ''}`.trim()}
                    >
                      <td className="provider-table-cell-select">
                        {!isRuntimeOnly ? (
                          <input
                            type="checkbox"
                            className="provider-list-row-checkbox"
                            checked={rowSelected}
                            disabled={disableSelection}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              const alreadySelected = selectedNames.has(file.name);
                              if (checked !== alreadySelected) {
                                toggleSelect(file.name);
                              }
                            }}
                            aria-label={t('ai_providers.list_select_row')}
                          />
                        ) : null}
                      </td>
                      <td className={styles.quotaCellIndex}>{rowIndex}</td>
                      <td className={styles.quotaCellName}>
                        <CountTooltipCell
                          items={[file.name]}
                          triggerLabel={<span className={styles.quotaCellNameText}>{file.name}</span>}
                          triggerClassName={styles.quotaCellNameTrigger}
                          triggerAriaLabel={t('auth_files.file_name', { defaultValue: '文件名' })}
                        />
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredFilesByControls.length > pageSize ? (
            <div className={`provider-list-pagination ${styles.pagination}`}>
              <div className="provider-list-pagination-controls">
                <span className="provider-list-pagination-meta">
                  {t('auth_files.pagination_info', {
                    current: currentPage,
                    total: totalPages,
                    count: filteredFilesByControls.length
                  })}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={goToPrev}
                  disabled={disabled || currentPage <= 1}
                >
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
                        variant="secondary"
                        className={`provider-list-page-button ${isActive ? 'provider-list-page-button-current' : ''}`.trim()}
                        onClick={() => {
                          if (isActive) return;
                          setPage(item);
                        }}
                        disabled={disabled}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {item}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={goToNext}
                  disabled={disabled || currentPage >= totalPages}
                >
                  {t('auth_files.pagination_next')}
                </Button>
                <div className="provider-list-page-size">
                  <Select
                    value={String(pageSize)}
                    options={pageSizeSelectOptions}
                    onChange={(value) => {
                      const next = Number(value);
                      if (!Number.isFinite(next) || next <= 0 || next > MAX_ITEMS_PER_PAGE) return;
                      setPageSize(next);
                    }}
                    className="provider-list-page-size-select"
                    ariaLabel={t('auth_files.page_size_label', { defaultValue: '单页数量' })}
                    disabled={disabled}
                    fullWidth={false}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.paginationSingleLine}>
              <span className={styles.sectionStats}>
                {t('auth_files.pagination_info', {
                  current: 1,
                  total: 1,
                  count: filteredFilesByControls.length
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
