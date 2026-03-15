import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

interface UsageTablePaginationProps {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
}

type PaginationItem = number | 'left-ellipsis' | 'right-ellipsis';

export function UsageTablePagination({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 30, 50, 100],
  disabled = false,
}: UsageTablePaginationProps) {
  const { t } = useTranslation();
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageSizeSelectOptions = useMemo(
    () =>
      pageSizeOptions.map((option) => ({
        value: String(option),
        label: t('ai_providers.page_size_option', { defaultValue: `${option} 条`, count: option }),
      })),
    [pageSizeOptions, t]
  );

  const paginationItems = useMemo<PaginationItem[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const items: PaginationItem[] = [1];
    let start = Math.max(2, safeCurrentPage - 1);
    let end = Math.min(totalPages - 1, safeCurrentPage + 1);

    if (safeCurrentPage <= 3) {
      start = 2;
      end = 4;
    } else if (safeCurrentPage >= totalPages - 2) {
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
  }, [safeCurrentPage, totalPages]);

  return (
    <div className="provider-list-pagination pagination">
      <div className="provider-list-pagination-controls">
        <span className="provider-list-pagination-meta">
          {t('ai_providers.list_total_only', {
            defaultValue: '共 {{count}} 条',
            count: totalItems,
          })}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
          disabled={disabled || safeCurrentPage <= 1}
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

            const isCurrent = item === safeCurrentPage;
            return (
              <Button
                key={item}
                variant="secondary"
                size="sm"
                className={`provider-list-page-button ${isCurrent ? 'provider-list-page-button-current' : ''}`.trim()}
                onClick={() => {
                  if (isCurrent) return;
                  onPageChange(item);
                }}
                disabled={disabled}
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
          onClick={() => onPageChange(Math.min(totalPages, safeCurrentPage + 1))}
          disabled={disabled || safeCurrentPage >= totalPages}
        >
          {t('auth_files.pagination_next', { defaultValue: '下一页' })}
        </Button>
        <div className="provider-list-page-size">
          <Select
            value={String(safePageSize)}
            options={pageSizeSelectOptions}
            onChange={(value) => onPageSizeChange(Number(value))}
            className="provider-list-page-size-select"
            disabled={disabled}
            ariaLabel={t('auth_files.page_size_label', { defaultValue: '单页数量' })}
            fullWidth={false}
          />
        </div>
      </div>
    </div>
  );
}
