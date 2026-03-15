import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { CountTooltipCell } from '@/components/providers/CountTooltipCell';
import {
  IconBot,
  IconCode,
  IconDownload,
  IconInfo,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import { copyToClipboard } from '@/utils/clipboard';
import { formatFileSize } from '@/utils/format';
import { calculateStatusBarData, normalizeAuthIndex } from '@/utils/usage';
import {
  clampCardPageSize,
  formatModified,
  getTypeColor,
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
  resolveAuthFileStats,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { AuthFileDetailModal } from '@/features/authFiles/components/AuthFileDetailModal';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStats } from '@/features/authFiles/hooks/useAuthFilesStats';
import { useAuthFilesStatusBarCache } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { readAuthFilesUiState, writeAuthFilesUiState } from '@/features/authFiles/uiState';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import styles from './AuthFilesPage.module.scss';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;

type PaginationItem = number | 'left-ellipsis' | 'right-ellipsis';
type StatsSortKey = 'success' | 'failure';
type StatsSortDirection = 'desc' | 'asc';

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'all' | string>('all');
  const [problemOnly, setProblemOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [statsSort, setStatsSort] = useState<{ key: StatsSortKey; direction: StatsSortDirection } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AuthFileItem | null>(null);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');

  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useAuthFilesStats();
  const {
    files,
    selectedFiles,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleStatusToggle,
    toggleSelect,
    batchSetStatus,
    batchDelete,
  } = useAuthFilesData({ refreshKeyStats });

  const statusBarCache = useAuthFilesStatusBarCache(files, usageDetails);

  const {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias,
  } = useAuthFilesOauth({ viewMode, files });

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useAuthFilesModels();

  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected',
    loadFiles,
    loadKeyStats: refreshKeyStats,
  });

  const disableControls = connectionStatus !== 'connected';

  useEffect(() => {
    const persisted = readAuthFilesUiState();
    if (!persisted) return;

    if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
      setFilter(persisted.filter);
    }
    if (typeof persisted.problemOnly === 'boolean') {
      setProblemOnly(persisted.problemOnly);
    }
    if (typeof persisted.search === 'string') {
      setSearch(persisted.search);
    }
    if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
      setPage(Math.max(1, Math.round(persisted.page)));
    }
    if (typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)) {
      setPageSize(clampCardPageSize(persisted.pageSize));
    }
  }, []);

  useEffect(() => {
    writeAuthFilesUiState({ filter, problemOnly, search, page, pageSize });
  }, [filter, problemOnly, search, page, pageSize]);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadFiles(), refreshKeyStats(), loadExcluded(), loadModelAlias()]);
  }, [loadFiles, refreshKeyStats, loadExcluded, loadModelAlias]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    loadFiles();
    void loadKeyStats().catch(() => {});
    loadExcluded();
    loadModelAlias();
  }, [isCurrentLayer, loadFiles, loadKeyStats, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

  const filesMatchingProblemFilter = useMemo(
    () => (problemOnly ? files.filter(hasAuthFileStatusMessage) : files),
    [files, problemOnly]
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
        .sort((left, right) => left.localeCompare(right)),
    ];
  }, [filesMatchingProblemFilter]);

  const typeFilterOptions = useMemo(
    () =>
      existingTypes.map((type) => ({
        value: type,
        label: getTypeLabel(t, type),
      })),
    [existingTypes, t]
  );
  const pageSizeSelectOptions = useMemo(
    () =>
      PAGE_SIZE_OPTIONS.map((size) => ({
        value: String(size),
        label: t('ai_providers.page_size_option', { defaultValue: `${size} 条`, count: size }),
      })),
    [t]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filteredItems = filesMatchingProblemFilter.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' ? !item.disabled : Boolean(item.disabled));
      const matchSearch =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.type || '').toString().toLowerCase().includes(term) ||
        (item.provider || '').toString().toLowerCase().includes(term);

      return matchType && matchStatus && matchSearch;
    });

    if (!statsSort) return filteredItems;

    return [...filteredItems].sort((left, right) => {
      const leftStats = resolveAuthFileStats(left, keyStats);
      const rightStats = resolveAuthFileStats(right, keyStats);
      const delta =
        statsSort.key === 'success'
          ? leftStats.success - rightStats.success
          : leftStats.failure - rightStats.failure;
      if (delta !== 0) {
        return statsSort.direction === 'asc' ? delta : -delta;
      }
      return left.name.localeCompare(right.name);
    });
  }, [filesMatchingProblemFilter, filter, keyStats, search, statsSort, statusFilter]);

  const toggleStatsSort = useCallback((key: StatsSortKey) => {
    setStatsSort((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'desc' };
      }
      return { key: prev.key, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
    });
  }, []);

  const getStatsSortLabel = useCallback(
    (key: StatsSortKey, label: string) => {
      if (!statsSort || statsSort.key !== key) return label;
      return `${label}${statsSort.direction === 'desc' ? ' ▼' : ' ▲'}`;
    },
    [statsSort]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(pageStart, pageStart + pageSize);

  const selectableFilteredNames = useMemo(
    () => filtered.filter((item) => !isRuntimeOnlyAuthFile(item)).map((item) => item.name),
    [filtered]
  );
  const selectablePageNames = useMemo(
    () => pageItems.filter((item) => !isRuntimeOnlyAuthFile(item)).map((item) => item.name),
    [pageItems]
  );

  const selectedNames = useMemo(() => Array.from(selectedFiles), [selectedFiles]);
  const hasSelection = selectedNames.length > 0;

  const isCurrentPageFullySelected =
    selectablePageNames.length > 0 && selectablePageNames.every((name) => selectedFiles.has(name));
  const isAllFilteredSelected =
    selectableFilteredNames.length > 0 && selectableFilteredNames.every((name) => selectedFiles.has(name));

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
  }, [filter, problemOnly, search, statusFilter, pageSize]);

  useEffect(() => {
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [page, totalPages]);

  const applySelection = useCallback(
    (names: string[], shouldSelect: boolean) => {
      names.forEach((name) => {
        const alreadySelected = selectedFiles.has(name);
        if (shouldSelect && !alreadySelected) {
          toggleSelect(name);
        }
        if (!shouldSelect && alreadySelected) {
          toggleSelect(name);
        }
      });
    },
    [selectedFiles, toggleSelect]
  );

  const toggleCurrentPageSelection = useCallback(() => {
    if (selectablePageNames.length === 0) return;
    applySelection(selectablePageNames, !isCurrentPageFullySelected);
  }, [applySelection, isCurrentPageFullySelected, selectablePageNames]);

  const toggleAllFilteredSelection = useCallback(() => {
    if (selectableFilteredNames.length === 0) return;
    applySelection(selectableFilteredNames, !isAllFilteredSelected);
  }, [applySelection, isAllFilteredSelected, selectableFilteredNames]);

  const handleResetFilters = () => {
    setSearch('');
    setFilter('all');
    setStatusFilter('all');
    setProblemOnly(false);
    setPageSize(DEFAULT_PAGE_SIZE);
    setPage(1);
  };

  const showDetails = (file: AuthFileItem) => {
    setSelectedFile(file);
    setDetailModalOpen(true);
  };

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const openExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('auth_files.title_section')}</span>
      {files.length > 0 && <span className={styles.countBadge}>{files.length}</span>}
    </div>
  );

  const deleteAllButtonLabel = problemOnly
    ? filter === 'all'
      ? t('auth_files.delete_problem_button')
      : t('auth_files.delete_problem_button_with_type', { type: getTypeLabel(t, filter) })
    : filter === 'all'
      ? t('auth_files.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, filter)}`;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('auth_files.title')}</h1>
        <p className={styles.description}>{t('auth_files.description')}</p>
      </div>

      <Card
        title={titleNode}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={handleHeaderRefresh} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              loading={uploading}
            >
              {t('auth_files.upload_button')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                handleDeleteAll({
                  filter,
                  problemOnly,
                  onResetFilterToAll: () => setFilter('all'),
                  onResetProblemOnly: () => setProblemOnly(false),
                })
              }
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {deleteAllButtonLabel}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              className={styles.hiddenInput}
              onChange={handleFileChange}
            />
          </div>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={`provider-list-toolbar ${styles.authTableToolbar}`}>
          <div className="provider-list-toolbar-left">
            <div className="provider-list-search">
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('auth_files.search_placeholder')}
              />
            </div>
            <div className={styles.authTableTypeFilter}>
              <Select
                value={filter}
                options={typeFilterOptions}
                onChange={(value) => setFilter(value)}
                className={styles.authTableTypeSelect}
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
                onClick={() => {
                  setProblemOnly((prev) => !prev);
                  setPage(1);
                }}
              >
                {t('auth_files.problem_filter_only')}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="provider-list-reset-btn"
            >
              {t('ai_providers.list_reset_filters', { defaultValue: '重置' })}
            </Button>
          </div>

          <div className="provider-list-toolbar-right">
            <div className="provider-list-selection-group">
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleCurrentPageSelection}
                disabled={selectablePageNames.length === 0}
              >
                {isCurrentPageFullySelected
                  ? t('ai_providers.list_deselect_page')
                  : t('ai_providers.list_select_page')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleAllFilteredSelection}
                disabled={selectableFilteredNames.length === 0}
              >
                {isAllFilteredSelected
                  ? t('ai_providers.list_deselect_all')
                  : t('ai_providers.list_select_all')}
              </Button>
            </div>
            <div className="provider-list-bulk-actions">
              <Button
                size="sm"
                onClick={() => void batchSetStatus(selectedNames, true)}
                disabled={disableControls || !hasSelection}
              >
                {t('auth_files.batch_enable')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void batchSetStatus(selectedNames, false)}
                disabled={disableControls || !hasSelection}
              >
                {t('auth_files.batch_disable')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => batchDelete(selectedNames)}
                disabled={disableControls || !hasSelection}
              >
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : pageItems.length === 0 ? (
          <EmptyState
            title={t('auth_files.search_empty_title')}
            description={t('auth_files.search_empty_desc')}
          />
        ) : (
          <div className={`provider-table-wrapper ${styles.authTableWrapper}`}>
            <table className={`provider-table ${styles.authTable}`}>
              <colgroup>
                <col className={styles.authTableColSelect} />
                <col className={styles.authTableColIndex} />
                <col />
                <col className={styles.authTableColType} />
                <col className={styles.authTableColSize} />
                <col className={styles.authTableColModified} />
                <col className={styles.authTableColSuccess} />
                <col className={styles.authTableColFailure} />
                <col className={styles.authTableColHealth} />
                <col className={styles.authTableColEnabled} />
                <col className={styles.authTableColActions} />
              </colgroup>
              <thead>
                <tr>
                  <th className="provider-table-col-select" aria-label={t('ai_providers.list_select_row')} />
                  <th className="provider-table-col-index">
                    {t('common.serial_number', { defaultValue: '序号' })}
                  </th>
                  <th className={styles.authTableColName}>
                    {t('auth_files.file_name', { defaultValue: '文件名' })}
                  </th>
                  <th className={styles.authTableColType}>{t('auth_files.file_type', { defaultValue: '类型' })}</th>
                  <th className={styles.authTableColSize}>{t('auth_files.file_size')}</th>
                  <th className={styles.authTableColModified}>{t('auth_files.file_modified')}</th>
                  <th aria-sort={statsSort?.key === 'success' ? (statsSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      className={styles.authTableSortButton}
                      onClick={() => toggleStatsSort('success')}
                    >
                      {getStatsSortLabel('success', t('stats.success'))}
                    </button>
                  </th>
                  <th aria-sort={statsSort?.key === 'failure' ? (statsSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      className={styles.authTableSortButton}
                      onClick={() => toggleStatsSort('failure')}
                    >
                      {getStatsSortLabel('failure', t('stats.failure'))}
                    </button>
                  </th>
                  <th className={styles.authTableColHealth}>{t('auth_files.health_status_label')}</th>
                  <th>{t('auth_files.status_toggle_label')}</th>
                  <th className="provider-table-col-actions">{t('common.action')}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((file, rowIndex) => {
                  const serialNumber = pageStart + rowIndex + 1;
                  const rowSelected = selectedFiles.has(file.name);
                  const rowDisabled = Boolean(file.disabled);
                  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
                  const showModelsButton = !isRuntimeOnly || (file.type || '').toLowerCase() === 'aistudio';
                  const typeLabel = getTypeLabel(t, file.type || 'unknown');
                  const typeColor = getTypeColor(file.type || 'unknown', resolvedTheme);
                  const stats = resolveAuthFileStats(file, keyStats);
                  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
                  const authIndexKey = normalizeAuthIndex(rawAuthIndex);
                  const statusData =
                    (authIndexKey && statusBarCache.get(authIndexKey)) || calculateStatusBarData([]);
                  const rawStatusMessage = String(file['status_message'] ?? file.statusMessage ?? '').trim();

                  return (
                    <tr
                      key={file.name}
                      className={`provider-table-row ${rowDisabled ? 'provider-table-row-disabled' : ''} ${
                        rowSelected ? 'provider-table-row-selected' : ''
                      }`}
                    >
                      <td className="provider-table-cell-select">
                        {!isRuntimeOnly ? (
                          <input
                            type="checkbox"
                            className="provider-list-row-checkbox"
                            checked={rowSelected}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              const alreadySelected = selectedFiles.has(file.name);
                              if (checked !== alreadySelected) {
                                toggleSelect(file.name);
                              }
                            }}
                            aria-label={t('ai_providers.list_select_row')}
                          />
                        ) : null}
                      </td>
                      <td className={`provider-table-cell-index ${styles.authTableCenterCell}`}>{serialNumber}</td>
                      <td
                        className={`provider-table-cell-ellipsis provider-table-cell-strong ${styles.authTableNameCell}`}
                      >
                        <CountTooltipCell
                          items={[file.name]}
                          triggerLabel={<span className={styles.authTableNameText}>{file.name}</span>}
                          triggerClassName={styles.authTableNameTrigger}
                          triggerAriaLabel={t('auth_files.file_name', { defaultValue: '文件名' })}
                        />
                      </td>
                      <td className={`provider-table-cell-nowrap ${styles.authTableCenterCell}`}>
                        <span className={styles.typeBadge} style={{ backgroundColor: typeColor.bg, color: typeColor.text }}>
                          {typeLabel}
                        </span>
                      </td>
                      <td
                        className={`provider-table-cell-numeric ${styles.authTableCenterCell} ${styles.authTableCellSize}`}
                      >
                        {file.size ? formatFileSize(file.size) : '-'}
                      </td>
                      <td
                        className={`provider-table-cell-nowrap ${styles.authTableCenterCell} ${styles.authTableCellModified}`}
                      >
                        {formatModified(file)}
                      </td>
                      <td
                        className={`provider-table-cell-numeric provider-table-cell-success ${styles.authTableCenterCell}`}
                      >
                        {stats.success}
                      </td>
                      <td
                        className={`provider-table-cell-numeric provider-table-cell-failure ${styles.authTableCenterCell}`}
                      >
                        {rawStatusMessage && stats.failure > 0 ? (
                          <CountTooltipCell
                            items={[rawStatusMessage]}
                            tone="warning"
                            triggerLabel={stats.failure}
                            triggerAriaLabel={t('auth_files.failure_logs', {
                              defaultValue: '查看失败日志',
                            })}
                          />
                        ) : (
                          stats.failure
                        )}
                      </td>
                      <td
                        className={`provider-table-cell-status ${styles.authTableCenterCell} ${styles.authTableCellHealth}`}
                      >
                        <div className={styles.authTableStatusCell}>
                          <ProviderStatusBar statusData={statusData} styles={styles} />
                        </div>
                      </td>
                      <td className={`provider-table-cell-switch ${styles.authTableCenterCell}`}>
                        {!isRuntimeOnly ? (
                          <ToggleSwitch
                            ariaLabel={t('auth_files.status_toggle_label')}
                            checked={!file.disabled}
                            disabled={disableControls || statusUpdating[file.name] === true}
                            onChange={(value) => void handleStatusToggle(file, value)}
                          />
                        ) : (
                          <span className={styles.virtualBadge}>{t('auth_files.type_virtual')}</span>
                        )}
                      </td>
                      <td className="provider-table-cell-actions">
                        <div className="provider-table-actions">
                          {showModelsButton ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => showModels(file)}
                              className={styles.iconButton}
                              title={t('auth_files.models_button')}
                              disabled={disableControls}
                            >
                              <IconBot className={styles.actionIcon} size={16} />
                            </Button>
                          ) : null}
                          {!isRuntimeOnly ? (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => showDetails(file)}
                                className={styles.iconButton}
                                title={t('common.info')}
                                disabled={disableControls}
                              >
                                <IconInfo className={styles.actionIcon} size={16} />
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void handleDownload(file.name)}
                                className={styles.iconButton}
                                title={t('auth_files.download_button')}
                                disabled={disableControls}
                              >
                                <IconDownload className={styles.actionIcon} size={16} />
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openPrefixProxyEditor(file)}
                                className={styles.iconButton}
                                title={t('auth_files.prefix_proxy_button')}
                                disabled={disableControls}
                              >
                                <IconCode className={styles.actionIcon} size={16} />
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDelete(file.name)}
                                className={styles.iconButton}
                                title={t('auth_files.delete_button')}
                                disabled={disableControls || deleting === file.name}
                              >
                                {deleting === file.name ? (
                                  <LoadingSpinner size={14} />
                                ) : (
                                  <IconTrash2 className={styles.actionIcon} size={16} />
                                )}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 ? (
          <div className="provider-list-pagination pagination">
            <div className="provider-list-pagination-controls">
              <span className="provider-list-pagination-meta">
                {filtered.length} {t('auth_files.files_count')}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                {t('auth_files.pagination_prev')}
              </Button>
              <div
                className="provider-list-pagination-pages"
                aria-label={t('common.pagination', { defaultValue: '分页' })}
              >
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
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                {t('auth_files.pagination_next')}
              </Button>
              <div className="provider-list-page-size">
                <Select
                  value={String(pageSize)}
                  options={pageSizeSelectOptions}
                  onChange={(value) => {
                    const next = Number(value);
                    if (!Number.isFinite(next) || next <= 0) return;
                    setPageSize(next);
                  }}
                  className="provider-list-page-size-select"
                  ariaLabel={t('auth_files.page_size_label', { defaultValue: '单页数量' })}
                  fullWidth={false}
                />
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      <OAuthExcludedCard
        disableControls={disableControls}
        excludedError={excludedError}
        excluded={excluded}
        onAdd={() => openExcludedEditor()}
        onEdit={openExcludedEditor}
        onDelete={deleteExcluded}
      />

      <OAuthModelAliasCard
        disableControls={disableControls}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAdd={() => openModelAliasEditor()}
        onEditProvider={openModelAliasEditor}
        onDeleteProvider={deleteModelAlias}
        modelAliasError={modelAliasError}
        modelAlias={modelAlias}
        allProviderModels={allProviderModels}
        onUpdate={handleMappingUpdate}
        onDeleteLink={handleDeleteLink}
        onToggleFork={handleToggleFork}
        onRenameAlias={handleRenameAlias}
        onDeleteAlias={handleDeleteAlias}
      />

      <AuthFileDetailModal
        open={detailModalOpen}
        file={selectedFile}
        onClose={() => setDetailModalOpen(false)}
        onCopyText={copyTextWithNotification}
      />

      <AuthFileModelsModal
        open={modelsModalOpen}
        fileName={modelsFileName}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />

      <AuthFilesPrefixProxyEditorModal
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />
    </div>
  );
}
