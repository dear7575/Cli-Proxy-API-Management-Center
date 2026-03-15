import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconPencil, IconTrash2 } from '@/components/ui/icons';
import { Select } from '@/components/ui/Select';

interface ProviderSortOption<T> {
  value: string;
  label: string;
  direction?: 'asc' | 'desc';
  getValue?: (item: T, index: number) => string | number | boolean | null | undefined;
}

interface ProviderBulkAction {
  value: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean | ((indices: number[]) => boolean);
  onAction: (indices: number[]) => void | Promise<void>;
}

interface ProviderColumn<T> {
  key: string;
  title: ReactNode;
  className?: string;
  headerClassName?: string;
  ellipsis?: boolean;
  render: (item: T, index: number) => ReactNode;
}

interface ProviderListProps<T> {
  items: T[];
  loading: boolean;
  keyField: (item: T, index: number) => string;
  renderContent?: (item: T, index: number) => ReactNode;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  emptyTitle: string;
  emptyDescription: string;
  deleteLabel?: string;
  actionsDisabled?: boolean;
  getRowDisabled?: (item: T, index: number) => boolean;
  renderExtraActions?: (item: T, index: number) => ReactNode;
  getSearchText?: (item: T, index: number) => string;
  pageSize?: number;
  sortOptions?: Array<ProviderSortOption<T>>;
  bulkActions?: ProviderBulkAction[];
  stateKey?: string;
  columns?: Array<ProviderColumn<T>>;
}

export function ProviderList<T>({
  items,
  loading,
  keyField,
  renderContent,
  onEdit,
  onDelete,
  emptyTitle,
  emptyDescription,
  deleteLabel,
  actionsDisabled = false,
  getRowDisabled,
  renderExtraActions,
  getSearchText,
  pageSize = 10,
  sortOptions,
  bulkActions,
  stateKey,
  columns,
}: ProviderListProps<T>) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [page, setPage] = useState(1);
  const [pageSizeValue, setPageSizeValue] = useState(() => Math.max(1, pageSize));
  const [sortBy, setSortBy] = useState(() => sortOptions?.[0]?.value ?? 'default');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const hasRestoredState = useRef(false);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => {
        const disabled = getRowDisabled ? getRowDisabled(item, index) : false;
        if (statusFilter === 'enabled' && disabled) return false;
        if (statusFilter === 'disabled' && !disabled) return false;

        if (!normalizedSearch) return true;

        const searchSource = (getSearchText ? getSearchText(item, index) : keyField(item, index))
          .toString()
          .toLowerCase();
        return searchSource.includes(normalizedSearch);
      });
  }, [getRowDisabled, getSearchText, items, keyField, normalizedSearch, statusFilter]);

  const sortedItems = useMemo(() => {
    if (!sortOptions?.length) return filteredItems;

    const activeSort = sortOptions.find((option) => option.value === sortBy) ?? sortOptions[0];
    if (!activeSort || activeSort.value === 'default' || !activeSort.getValue) return filteredItems;
    const getSortValue = activeSort.getValue;

    const directionFactor = activeSort.direction === 'desc' ? -1 : 1;

    return [...filteredItems].sort((left, right) => {
      const leftRawValue = getSortValue(left.item, left.index);
      const rightRawValue = getSortValue(right.item, right.index);
      const leftValue = typeof leftRawValue === 'boolean' ? Number(leftRawValue) : leftRawValue;
      const rightValue = typeof rightRawValue === 'boolean' ? Number(rightRawValue) : rightRawValue;

      if (leftValue == null && rightValue == null) return left.index - right.index;
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        const delta = leftValue - rightValue;
        if (delta !== 0) return delta * directionFactor;
        return left.index - right.index;
      }

      const delta = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (delta !== 0) return delta * directionFactor;
      return left.index - right.index;
    });
  }, [filteredItems, sortBy, sortOptions]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSizeValue));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSizeValue;
  const pageItems = sortedItems.slice(pageStart, pageStart + pageSizeValue);
  const pageItemKeys = pageItems.map(({ item, index }) => keyField(item, index));
  const filteredItemKeys = filteredItems.map(({ item, index }) => keyField(item, index));
  const isCurrentPageFullySelected =
    pageItemKeys.length > 0 && pageItemKeys.every((rowKey) => selectedKeys.has(rowKey));
  const isAllFilteredSelected =
    filteredItemKeys.length > 0 && filteredItemKeys.every((rowKey) => selectedKeys.has(rowKey));
  const selectedIndices = filteredItems
    .filter(({ item, index }) => selectedKeys.has(keyField(item, index)))
    .map(({ index }) => index);
  const hasSelection = selectedIndices.length > 0;
  const bulkBusy = Boolean(runningAction);
  const defaultSortValue = sortOptions?.[0]?.value ?? 'default';
  const hasActiveFilters =
    normalizedSearch.length > 0 || statusFilter !== 'all' || (sortOptions?.length ? sortBy !== defaultSortValue : false);
  const pageSizeOptions = [10, 30, 50, 100];
  const pageSizeSelectOptions = useMemo(
    () =>
      pageSizeOptions.map((option) => ({
        value: String(option),
        label: t('ai_providers.page_size_option', { defaultValue: `${option} 条`, count: option })
      })),
    [pageSizeOptions, t]
  );
  const paginationItems = useMemo<Array<number | 'left-ellipsis' | 'right-ellipsis'>>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const items: Array<number | 'left-ellipsis' | 'right-ellipsis'> = [1];
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
    setSelectedKeys(new Set());
  }, [normalizedSearch, statusFilter, sortBy, pageSizeValue, items.length]);

  useEffect(() => {
    if (!sortOptions?.length) return;
    if (sortOptions.some((option) => option.value === sortBy)) return;
    setSortBy(sortOptions[0].value);
  }, [sortBy, sortOptions]);

  useEffect(() => {
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const validKeys = new Set(items.map((item, index) => keyField(item, index)));
    setSelectedKeys((prev) => {
      if (!prev.size) return prev;
      const next = new Set<string>();
      prev.forEach((value) => {
        if (validKeys.has(value)) next.add(value);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [items, keyField]);

  useEffect(() => {
    if (!stateKey || hasRestoredState.current || typeof window === 'undefined') return;
    hasRestoredState.current = true;
    const storageKey = `provider-list-state:${stateKey}`;

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        searchTerm?: unknown;
        statusFilter?: unknown;
        sortBy?: unknown;
        pageSize?: unknown;
      };

      if (typeof parsed.searchTerm === 'string') {
        setSearchTerm(parsed.searchTerm);
      }
      if (parsed.statusFilter === 'all' || parsed.statusFilter === 'enabled' || parsed.statusFilter === 'disabled') {
        setStatusFilter(parsed.statusFilter);
      }
      if (typeof parsed.sortBy === 'string' && (!sortOptions?.length || sortOptions.some((option) => option.value === parsed.sortBy))) {
        setSortBy(parsed.sortBy);
      }
      const parsedPageSize = Number(parsed.pageSize);
      if (Number.isFinite(parsedPageSize) && parsedPageSize >= 1) {
        setPageSizeValue(Math.floor(parsedPageSize));
      }
    } catch {
      // 忽略持久化状态解析失败
    }
  }, [stateKey, sortOptions]);

  useEffect(() => {
    if (!stateKey || !hasRestoredState.current || typeof window === 'undefined') return;
    const storageKey = `provider-list-state:${stateKey}`;
    const payload = {
      searchTerm,
      statusFilter,
      sortBy,
      pageSize: pageSizeValue,
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // 忽略持久化状态写入失败
    }
  }, [pageSizeValue, searchTerm, sortBy, stateKey, statusFilter]);

  const toggleSelection = (rowKey: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(rowKey);
      } else {
        next.delete(rowKey);
      }
      return next;
    });
  };

  const selectCurrentPage = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const shouldClear = pageItemKeys.length > 0 && pageItemKeys.every((rowKey) => next.has(rowKey));
      pageItemKeys.forEach((rowKey) => {
        if (shouldClear) {
          next.delete(rowKey);
        } else {
          next.add(rowKey);
        }
      });
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const shouldClear =
        filteredItemKeys.length > 0 && filteredItemKeys.every((rowKey) => next.has(rowKey));
      filteredItemKeys.forEach((rowKey) => {
        if (shouldClear) {
          next.delete(rowKey);
        } else {
          next.add(rowKey);
        }
      });
      return next;
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSortBy(defaultSortValue);
    setPageSizeValue(Math.max(1, pageSize));
    setPage(1);
    setSelectedKeys(new Set());
  };

  const runBulkAction = async (action: ProviderBulkAction) => {
    if (!hasSelection || bulkBusy) return;
    setRunningAction(action.value);
    try {
      await action.onAction(selectedIndices);
    } finally {
      setRunningAction(null);
    }
  };

  const handlePageSizeChange = (value: number) => {
    if (!Number.isFinite(value) || value < 1) return;
    setPageSizeValue(Math.floor(value));
    setPage(1);
    setSelectedKeys(new Set());
  };

  const toolbar = (
    <div className="provider-list-toolbar">
      <div className="provider-list-toolbar-left">
        <div className="provider-list-search">
          <input
            className="input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t('ai_providers.list_search_placeholder')}
          />
        </div>
        <div className="provider-list-status-group">
          <Button
            size="sm"
            variant={statusFilter === 'all' ? 'primary' : 'secondary'}
            onClick={() => setStatusFilter('all')}
            disabled={actionsDisabled}
          >
            {t('ai_providers.list_filter_all')}
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'enabled' ? 'primary' : 'secondary'}
            onClick={() => setStatusFilter('enabled')}
            disabled={actionsDisabled}
          >
            {t('ai_providers.list_filter_enabled')}
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'disabled' ? 'primary' : 'secondary'}
            onClick={() => setStatusFilter('disabled')}
            disabled={actionsDisabled}
          >
            {t('ai_providers.list_filter_disabled')}
          </Button>
        </div>
        {sortOptions && sortOptions.length > 1 ? (
          <label className="provider-list-sort">
            <span className="provider-list-sort-label">{t('ai_providers.list_sort_label')}</span>
            <select
              className="input provider-list-sort-select"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              disabled={actionsDisabled}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="provider-list-reset-btn"
          onClick={resetFilters}
          disabled={actionsDisabled || bulkBusy || !hasActiveFilters}
        >
          {t('ai_providers.list_reset_filters')}
        </Button>
      </div>
      <div className="provider-list-toolbar-right">
        <div className="provider-list-selection-group">
        <Button
          size="sm"
          variant="secondary"
          onClick={selectCurrentPage}
          disabled={actionsDisabled || bulkBusy || !pageItems.length}
        >
          {isCurrentPageFullySelected
            ? t('ai_providers.list_deselect_page', { defaultValue: '取消当前页' })
            : t('ai_providers.list_select_page')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={selectAllFiltered}
          disabled={actionsDisabled || bulkBusy || !filteredItems.length}
        >
          {isAllFilteredSelected
            ? t('ai_providers.list_deselect_all', { defaultValue: '取消全部' })
            : t('ai_providers.list_select_all')}
        </Button>
      </div>
        {bulkActions?.length ? (
          <div className="provider-list-bulk-actions">
            {bulkActions.map((action) => {
              const disabledByAction =
                typeof action.disabled === 'function' ? action.disabled(selectedIndices) : action.disabled;
              return (
                <Button
                  key={action.value}
                  size="sm"
                  variant={action.variant ?? 'secondary'}
                  onClick={() => void runBulkAction(action)}
                  disabled={actionsDisabled || bulkBusy || !hasSelection || Boolean(disabledByAction)}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );

  const resolvedColumns = useMemo<Array<ProviderColumn<T>>>(() => {
    if (columns?.length) return columns;
    if (!renderContent) return [];
    return [
      {
        key: 'config',
        title: t('ai_providers.list_col_config'),
        className: 'provider-table-cell-config',
        render: renderContent,
      },
    ];
  }, [columns, renderContent, t]);

  if (loading && items.length === 0) {
    return <div className="hint">{t('common.loading')}</div>;
  }

  if (!items.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  if (!filteredItems.length) {
    return (
      <div className="provider-list">
        {toolbar}
        <EmptyState
          title={t('ai_providers.list_no_match_title')}
          description={t('ai_providers.list_no_match_desc')}
          action={
            <Button size="sm" variant="secondary" onClick={resetFilters} disabled={actionsDisabled || bulkBusy}>
              {t('ai_providers.list_reset_filters')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="provider-list">
      {toolbar}
      <div className="provider-table-wrapper">
        <table className="provider-table">
          <thead>
            <tr>
              <th className="provider-table-col-select" aria-label={t('ai_providers.list_select_row')} />
              <th className="provider-table-col-index">
                {t('common.serial_number', { defaultValue: '序号' })}
              </th>
              {resolvedColumns.map((column) => (
                <th key={column.key} className={column.headerClassName}>
                  {column.title}
                </th>
              ))}
              <th className="provider-table-col-actions">{t('common.action')}</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(({ item, index }, pageIndex) => {
              const rowDisabled = getRowDisabled ? getRowDisabled(item, index) : false;
              const rowKey = keyField(item, index);
              const selected = selectedKeys.has(rowKey);
              const serialNumber = pageStart + pageIndex + 1;

              return (
                <tr
                  key={rowKey}
                  className={`provider-table-row ${rowDisabled ? 'provider-table-row-disabled' : ''} ${
                    selected ? 'provider-table-row-selected' : ''
                  }`}
                  aria-disabled={rowDisabled}
                >
                  <td className="provider-table-cell-select">
                    <input
                      type="checkbox"
                      className="provider-list-row-checkbox"
                      checked={selected}
                      onChange={(event) => toggleSelection(rowKey, event.target.checked)}
                      disabled={actionsDisabled || bulkBusy}
                      aria-label={t('ai_providers.list_select_row')}
                    />
                  </td>
                  <td className="provider-table-cell-index">{serialNumber}</td>
                  {resolvedColumns.map((column) => (
                    <td key={column.key} className={column.className}>
                      {(() => {
                        const content = column.render(item, index);
                        const isPrimitive =
                          typeof content === 'string' || typeof content === 'number' || typeof content === 'boolean';
                        if (column.ellipsis && isPrimitive) {
                          const text = String(content);
                          return (
                            <span className="provider-table-cell-ellipsis-text" title={text}>
                              {text}
                            </span>
                          );
                        }
                        return content;
                      })()}
                    </td>
                  ))}
                  <td className="provider-table-cell-actions">
                    <div className="provider-table-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="provider-table-action-icon"
                        onClick={() => onEdit(index)}
                        disabled={actionsDisabled}
                        title={t('common.edit')}
                        aria-label={t('common.edit')}
                      >
                        <IconPencil size={16} />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="provider-table-action-icon"
                        onClick={() => onDelete(index)}
                        disabled={actionsDisabled}
                        title={deleteLabel || t('common.delete')}
                        aria-label={deleteLabel || t('common.delete')}
                      >
                        <IconTrash2 size={16} />
                      </Button>
                      {renderExtraActions ? renderExtraActions(item, index) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="provider-list-pagination pagination">
        <div className="provider-list-pagination-controls">
          <span className="provider-list-pagination-meta">
            {t('ai_providers.list_total_only', {
              defaultValue: '共 {{count}} 条',
              count: filteredItems.length,
            })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            {t('auth_files.pagination_prev', { defaultValue: '上一页' })}
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

              const isCurrent = item === currentPage;
              return (
                <Button
                  key={item}
                  variant="secondary"
                  size="sm"
                  className={`provider-list-page-button ${isCurrent ? 'provider-list-page-button-current' : ''}`.trim()}
                  onClick={() => {
                    if (isCurrent) return;
                    setPage(item);
                  }}
                  aria-current={isCurrent ? 'page' : undefined}
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
            {t('auth_files.pagination_next', { defaultValue: '下一页' })}
          </Button>
          <div className="provider-list-page-size">
            <Select
              value={String(pageSizeValue)}
              options={pageSizeSelectOptions}
              onChange={(value) => handlePageSizeChange(Number(value))}
              className="provider-list-page-size-select"
              disabled={actionsDisabled || bulkBusy}
              ariaLabel={t('auth_files.page_size_label', { defaultValue: '单页数量' })}
              fullWidth={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
