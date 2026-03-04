import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import type { OpenAIProviderConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import {
  buildCandidateUsageSourceIds,
  calculateStatusBarData,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';
import styles from '@/pages/AiProvidersPage.module.scss';
import { CountTooltipCell } from '../CountTooltipCell';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { getHeaderDisplayNames, getModelDisplayNames, getOpenAIProviderStats } from '../utils';

interface OpenAISectionProps {
  configs: OpenAIProviderConfig[];
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  resolvedTheme: string;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onBulkDelete: (indices: number[]) => void;
}

export function OpenAISection({
  configs,
  keyStats,
  usageDetails,
  loading,
  disableControls,
  isSwitching,
  resolvedTheme,
  onAdd,
  onEdit,
  onDelete,
  onBulkDelete,
}: OpenAISectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;

  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();

    configs.forEach((provider) => {
      const sourceIds = new Set<string>();
      buildCandidateUsageSourceIds({ prefix: provider.prefix }).forEach((id) => sourceIds.add(id));
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({ apiKey: entry.apiKey }).forEach((id) => sourceIds.add(id));
      });

      const filteredDetails = sourceIds.size
        ? usageDetails.filter((detail) => sourceIds.has(detail.source))
        : [];
      cache.set(provider.name, calculateStatusBarData(filteredDetails));
    });

    return cache;
  }, [configs, usageDetails]);

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img
              src={resolvedTheme === 'dark' ? iconOpenaiDark : iconOpenaiLight}
              alt=""
              className={styles.cardTitleIcon}
            />
            {t('ai_providers.openai_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.openai_add_button')}
          </Button>
        }
      >
        <ProviderList<OpenAIProviderConfig>
          items={configs}
          loading={loading}
          stateKey="openai"
          keyField={(_, index) => `openai-provider-${index}`}
          getSearchText={(item) =>
            [
              item.name,
              item.baseUrl,
              item.prefix,
              item.testModel,
              ...Object.entries(item.headers || {}).flatMap(([key, value]) => [key, value]),
              ...(item.models || []).flatMap((model) => [model.name, model.alias || '']),
              ...(item.apiKeyEntries || []).flatMap((entry) => [entry.apiKey, entry.proxyUrl || '']),
            ]
              .filter(Boolean)
              .join(' ')
          }
          sortOptions={[
            {
              value: 'priority_desc',
              label: t('ai_providers.list_sort_priority_desc'),
              direction: 'desc',
              getValue: (entry) => entry.priority,
            },
          ]}
          emptyTitle={t('ai_providers.openai_empty_title')}
          emptyDescription={t('ai_providers.openai_empty_desc')}
          bulkActions={[
            {
              value: 'delete',
              label: t('ai_providers.list_bulk_delete'),
              variant: 'danger',
              onAction: onBulkDelete,
            },
          ]}
          onEdit={onEdit}
          onDelete={onDelete}
          actionsDisabled={actionsDisabled}
          columns={[
            {
              key: 'name',
              title: t('common.name', { defaultValue: '名称' }),
              className: 'provider-table-cell-ellipsis provider-table-cell-strong',
              ellipsis: true,
              render: (item) => item.name || '--',
            },
            {
              key: 'priority',
              title: t('common.priority'),
              className: 'provider-table-cell-numeric',
              render: (item) => (item.priority ?? '--'),
            },
            {
              key: 'prefix',
              title: t('common.prefix'),
              className: 'provider-table-cell-nowrap provider-table-cell-ellipsis',
              ellipsis: true,
              render: (item) => item.prefix || '--',
            },
            {
              key: 'baseUrl',
              title: t('common.base_url'),
              className: 'provider-table-cell-base-url provider-table-cell-ellipsis',
              headerClassName: 'provider-table-col-base-url',
              ellipsis: true,
              render: (item) => item.baseUrl || '--',
            },
            {
              key: 'apiKeys',
              title: t('common.api_key'),
              className: 'provider-table-cell-ellipsis',
              ellipsis: true,
              render: (item) => {
                const apiKeyEntries = item.apiKeyEntries || [];
                if (!apiKeyEntries.length) return '--';
                const firstKey = maskApiKey(apiKeyEntries[0].apiKey);
                return `${apiKeyEntries.length} (${firstKey}${apiKeyEntries.length > 1 ? ` +${apiKeyEntries.length - 1}` : ''})`;
              },
            },
            {
              key: 'models',
              title: t('common.model', { defaultValue: '模型' }),
              className: 'provider-table-cell-numeric',
              render: (item) => <CountTooltipCell items={getModelDisplayNames(item.models)} />,
            },
            {
              key: 'testModel',
              title: 'Test Model',
              className: 'provider-table-cell-nowrap provider-table-cell-ellipsis',
              ellipsis: true,
              render: (item) => item.testModel || '--',
            },
            {
              key: 'headers',
              title: 'Headers',
              className: 'provider-table-cell-numeric',
              render: (item) => <CountTooltipCell items={getHeaderDisplayNames(item.headers)} />,
            },
            {
              key: 'success',
              title: t('stats.success'),
              className: 'provider-table-cell-numeric provider-table-cell-success',
              render: (item) => {
                const stats = getOpenAIProviderStats(item.apiKeyEntries, keyStats, item.prefix);
                return stats.success.toLocaleString();
              },
            },
            {
              key: 'failure',
              title: t('stats.failure'),
              className: 'provider-table-cell-numeric provider-table-cell-failure',
              render: (item) => {
                const stats = getOpenAIProviderStats(item.apiKeyEntries, keyStats, item.prefix);
                return stats.failure.toLocaleString();
              },
            },
            {
              key: 'statusBar',
              title: t('common.status', { defaultValue: '状态' }),
              className: 'provider-table-cell-status',
              render: (item) => {
                const statusData = statusBarCache.get(item.name) || calculateStatusBarData([]);
                return <ProviderStatusBar statusData={statusData} />;
              },
            },
          ]}
        />
      </Card>
    </>
  );
}
