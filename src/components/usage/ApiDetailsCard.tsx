import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { formatCompactNumber, formatUsd, type ApiStats } from '@/utils/usage';
import { UsageTablePagination } from './UsageTablePagination';
import styles from '@/pages/UsagePage.module.scss';

export interface ApiDetailsCardProps {
  apiStats: ApiStats[];
  loading: boolean;
  hasPrices: boolean;
}

type ApiSortKey = 'endpoint' | 'requests' | 'tokens' | 'cost';
type SortDir = 'asc' | 'desc';

export function ApiDetailsCard({ apiStats, loading, hasPrices }: ApiDetailsCardProps) {
  const { t } = useTranslation();
  const [expandedApis, setExpandedApis] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<ApiSortKey>('requests');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const toggleExpand = (endpoint: string) => {
    setExpandedApis((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(endpoint)) {
        newSet.delete(endpoint);
      } else {
        newSet.add(endpoint);
      }
      return newSet;
    });
  };

  const handleSort = (key: ApiSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'endpoint' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const list = [...apiStats];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'endpoint': return dir * a.endpoint.localeCompare(b.endpoint);
        case 'requests': return dir * (a.totalRequests - b.totalRequests);
        case 'tokens': return dir * (a.totalTokens - b.totalTokens);
        case 'cost': return dir * (a.totalCost - b.totalCost);
        default: return 0;
      }
    });
    return list;
  }, [apiStats, sortKey, sortDir]);

  const arrow = (key: ApiSortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const ariaSort = (key: ApiSortKey): 'none' | 'ascending' | 'descending' =>
    sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(pageStart, pageStart + pageSize);
  const shouldEnableTableScroll = pageItems.length > 10;

  useEffect(() => {
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, apiStats.length]);

  const handlePageSizeChange = (size: number) => {
    if (!Number.isFinite(size) || size < 1) return;
    setPageSize(Math.floor(size));
    setPage(1);
  };

  return (
    <Card title={t('usage_stats.api_details')}>
      {loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : sorted.length > 0 ? (
        <>
          <div
            className={`${styles.tableWrapper} ${styles.apiDetailsTableWrapper} ${shouldEnableTableScroll ? styles.apiDetailsTableWrapperScrollable : ''}`.trim()}
          >
              <table
                className={`${styles.table} ${styles.apiDetailsTable} ${
                  hasPrices ? styles.apiDetailsTableWithCost : styles.apiDetailsTableNoCost
                }`}
              >
                <colgroup>
                  <col className={styles.apiDetailsColEndpoint} />
                  <col className={styles.apiDetailsColRequests} />
                  <col className={styles.apiDetailsColTokens} />
                  <col className={styles.apiDetailsColRate} />
                  {hasPrices ? <col className={styles.apiDetailsColCost} /> : null}
                  <col className={styles.apiDetailsColModels} />
                  <col className={styles.apiDetailsColAction} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={styles.sortableHeader} aria-sort={ariaSort('endpoint')}>
                      <button
                        type="button"
                        className={styles.sortHeaderButton}
                        onClick={() => handleSort('endpoint')}
                      >
                        {t('usage_stats.api_endpoint')}{arrow('endpoint')}
                      </button>
                    </th>
                    <th className={styles.sortableHeader} aria-sort={ariaSort('requests')}>
                      <button
                        type="button"
                        className={styles.sortHeaderButton}
                        onClick={() => handleSort('requests')}
                      >
                        {t('usage_stats.requests_count')}{arrow('requests')}
                      </button>
                    </th>
                    <th className={styles.sortableHeader} aria-sort={ariaSort('tokens')}>
                      <button
                        type="button"
                        className={styles.sortHeaderButton}
                        onClick={() => handleSort('tokens')}
                      >
                        {t('usage_stats.tokens_count')}{arrow('tokens')}
                      </button>
                    </th>
                    <th>{t('usage_stats.success_rate')}</th>
                    {hasPrices && (
                      <th className={styles.sortableHeader} aria-sort={ariaSort('cost')}>
                        <button
                          type="button"
                          className={styles.sortHeaderButton}
                          onClick={() => handleSort('cost')}
                        >
                          {t('usage_stats.total_cost')}{arrow('cost')}
                        </button>
                      </th>
                    )}
                    <th>{t('usage_stats.models')}</th>
                    <th>{t('common.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((api, index) => {
                    const isExpanded = expandedApis.has(api.endpoint);
                    const panelId = `api-models-${pageStart + index}`;
                    const successRate = api.totalRequests > 0
                      ? (api.successCount / api.totalRequests) * 100
                      : 100;

                    return (
                      <Fragment key={api.endpoint}>
                        <tr>
                          <td className={`${styles.tableCellLeft} ${styles.modelCell}`} title={api.endpoint}>
                            <span className={styles.truncateText}>{api.endpoint}</span>
                          </td>
                          <td className={styles.tableCellMono}>
                            <span className={styles.requestCountCell}>
                              <span>{api.totalRequests.toLocaleString()}</span>
                              <span className={styles.requestBreakdown}>
                                (<span className={styles.statSuccess}>{api.successCount.toLocaleString()}</span>{' '}
                                <span className={styles.statFailure}>{api.failureCount.toLocaleString()}</span>)
                              </span>
                            </span>
                          </td>
                          <td className={styles.tableCellMono}>{formatCompactNumber(api.totalTokens)}</td>
                          <td className={styles.tableCellMono}>
                            <span
                              className={
                                successRate >= 95
                                  ? styles.statSuccess
                                  : successRate >= 80
                                    ? styles.statNeutral
                                    : styles.statFailure
                              }
                            >
                              {successRate.toFixed(1)}%
                            </span>
                          </td>
                          {hasPrices && (
                            <td className={styles.tableCellMono}>{api.totalCost > 0 ? formatUsd(api.totalCost) : '--'}</td>
                          )}
                          <td className={styles.tableCellMono}>
                            <span className={styles.apiModelCountBadge}>
                              {Object.keys(api.models).length}
                            </span>
                          </td>
                          <td className={styles.tableCellStatus}>
                            <button
                              type="button"
                              className={styles.apiExpandButton}
                              onClick={() => toggleExpand(api.endpoint)}
                              aria-expanded={isExpanded}
                              aria-controls={panelId}
                            >
                              {isExpanded ? '收起' : '展开'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className={styles.apiExpandedRow}>
                            <td colSpan={hasPrices ? 7 : 6}>
                              <div id={panelId} className={styles.apiModelsInline}>
                                {Object.entries(api.models).map(([model, stats]) => (
                                  <div key={model} className={styles.apiModelChip}>
                                    <span className={styles.apiModelChipName} title={model}>{model}</span>
                                    <span className={styles.apiModelChipMeta}>
                                      {stats.requests.toLocaleString()} / {formatCompactNumber(stats.tokens)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          <div className={styles.usageTablePagination}>
            <UsageTablePagination
              totalItems={sorted.length}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        </>
      ) : (
        <div className={styles.hint}>{t('usage_stats.no_data')}</div>
      )}
    </Card>
  );
}
