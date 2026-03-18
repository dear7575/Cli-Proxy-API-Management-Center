import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import iconCodex from '@/assets/icons/codex.svg';
import type { ProviderKeyConfig } from '@/types';
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
import {
  getExcludedModelDisplayNames,
  getHeaderDisplayNames,
  getModelDisplayNames,
  getStatsBySource,
  hasDisableAllModelsRule,
} from '../utils';

interface CodexSectionProps {
  configs: ProviderKeyConfig[];
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
  onBulkDelete: (indices: number[]) => void;
  onBulkToggle: (indices: number[], enabled: boolean) => void;
}

export function CodexSection({
  configs,
  keyStats,
  usageDetails,
  loading,
  disableControls,
  isSwitching,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  onBulkDelete,
  onBulkToggle,
}: CodexSectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;
  const toggleDisabled = disableControls || loading || isSwitching;

  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();

    configs.forEach((config) => {
      if (!config.apiKey) return;
      const candidates = buildCandidateUsageSourceIds({
        apiKey: config.apiKey,
        prefix: config.prefix,
      });
      if (!candidates.length) return;
      const candidateSet = new Set(candidates);
      const filteredDetails = usageDetails.filter((detail) => candidateSet.has(detail.source));
      cache.set(config.apiKey, calculateStatusBarData(filteredDetails));
    });

    return cache;
  }, [configs, usageDetails]);

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img src={iconCodex} alt="" className={styles.cardTitleIcon} />
            {t('ai_providers.codex_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.codex_add_button')}
          </Button>
        }
      >
        <ProviderList<ProviderKeyConfig>
          items={configs}
          loading={loading}
          stateKey="codex"
          keyField={(item) => item.apiKey}
          getSearchText={(item) =>
            [
              item.apiKey,
              item.prefix,
              item.baseUrl,
              item.proxyUrl,
              item.websockets ? 'websockets' : '',
              ...Object.entries(item.headers || {}).flatMap(([key, value]) => [key, value]),
              ...(item.models || []).flatMap((model) => [model.name, model.alias || '']),
              ...(item.excludedModels || []),
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
          emptyTitle={t('ai_providers.codex_empty_title')}
          emptyDescription={t('ai_providers.codex_empty_desc')}
          bulkActions={[
            {
              value: 'enable',
              label: t('ai_providers.list_bulk_enable'),
              onAction: (indices) => onBulkToggle(indices, true),
            },
            {
              value: 'disable',
              label: t('ai_providers.list_bulk_disable'),
              onAction: (indices) => onBulkToggle(indices, false),
            },
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
          getRowDisabled={(item) => hasDisableAllModelsRule(item.excludedModels)}
          columns={[
            {
              key: 'apiKey',
              title: t('common.api_key'),
              className: 'provider-table-cell-nowrap provider-table-cell-ellipsis',
              ellipsis: true,
              render: (item) => maskApiKey(item.apiKey),
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
              key: 'proxyUrl',
              title: t('common.proxy_url'),
              className: 'provider-table-cell-proxy-url provider-table-cell-ellipsis',
              headerClassName: 'provider-table-col-proxy-url',
              ellipsis: true,
              render: (item) => item.proxyUrl || '--',
            },
            {
              key: 'websockets',
              title: t('ai_providers.codex_websockets_label'),
              className: 'provider-table-cell-nowrap',
              render: (item) =>
                item.websockets === undefined ? '--' : item.websockets ? t('common.yes') : t('common.no'),
            },
            {
              key: 'modelsCount',
              title: t('common.model', { defaultValue: '模型' }),
              className: 'provider-table-cell-numeric',
              render: (item) => <CountTooltipCell items={getModelDisplayNames(item.models)} />,
            },
            {
              key: 'excludedModels',
              title: t('ai_providers.excluded_models_title', { defaultValue: '排除模型' }),
              className: 'provider-table-cell-numeric',
              render: (item) => (
                <CountTooltipCell items={getExcludedModelDisplayNames(item.excludedModels)} tone="warning" />
              ),
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
                const stats = getStatsBySource(item.apiKey, keyStats, item.prefix);
                return stats.success.toLocaleString();
              },
            },
            {
              key: 'failure',
              title: t('stats.failure'),
              className: 'provider-table-cell-numeric provider-table-cell-failure',
              render: (item) => {
                const stats = getStatsBySource(item.apiKey, keyStats, item.prefix);
                return stats.failure.toLocaleString();
              },
            },
            {
              key: 'enabledSwitch',
              title: t('common.status', { defaultValue: '状态' }),
              className: 'provider-table-cell-switch',
              render: (item, index) => {
                return (
                  <ToggleSwitch
                    checked={!hasDisableAllModelsRule(item.excludedModels)}
                    ariaLabel={t('ai_providers.config_toggle_label')}
                    disabled={toggleDisabled}
                    onChange={(value) => void onToggle(index, value)}
                  />
                );
              },
            },
            {
              key: 'statusBar',
              title: t('ai_providers.status_bar_title', { defaultValue: '状态条' }),
              className: 'provider-table-cell-status',
              render: (item) => {
                const statusData = statusBarCache.get(item.apiKey) || calculateStatusBarData([]);
                return <ProviderStatusBar statusData={statusData} />;
              },
            },
          ]}
        />
      </Card>
    </>
  );
}
