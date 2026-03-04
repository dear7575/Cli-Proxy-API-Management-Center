import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { ModelDiscoveryPanel } from '@/components/providers/ModelDiscoveryPanel';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { modelsApi } from '@/services/api';
import type { ModelInfo } from '@/utils/models';
import { buildHeaderObject } from '@/utils/headers';
import { buildOpenAIModelsEndpoint } from '@/components/providers/utils';
import type { OpenAIEditOutletContext } from './AiProvidersOpenAIEditLayout';
import layoutStyles from './AiProvidersEditLayout.module.scss';

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

export function AiProvidersOpenAIModelsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    disableControls,
    loading: initialLoading,
    saving,
    form,
    mergeDiscoveredModels,
  } = useOutletContext<OpenAIEditOutletContext>();

  const [endpoint, setEndpoint] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredModels = useMemo(() => {
    const filter = search.trim().toLowerCase();
    if (!filter) return models;
    return models.filter((model) => {
      const name = (model.name || '').toLowerCase();
      const alias = (model.alias || '').toLowerCase();
      const desc = (model.description || '').toLowerCase();
      return name.includes(filter) || alias.includes(filter) || desc.includes(filter);
    });
  }, [models, search]);

  const fetchOpenaiModelDiscovery = useCallback(
    async ({ allowFallback = true }: { allowFallback?: boolean } = {}) => {
      const trimmedBaseUrl = form.baseUrl.trim();
      if (!trimmedBaseUrl) return;

      setFetching(true);
      setError('');
      try {
        const headerObject = buildHeaderObject(form.headers);
        const firstKey = form.apiKeyEntries.find((entry) => entry.apiKey?.trim())?.apiKey?.trim();
        const hasAuthHeader = Boolean(headerObject.Authorization || headerObject['authorization']);
        const list = await modelsApi.fetchModelsViaApiCall(
          trimmedBaseUrl,
          hasAuthHeader ? undefined : firstKey,
          headerObject
        );
        setModels(list);
      } catch (err: unknown) {
        if (allowFallback) {
          try {
            const list = await modelsApi.fetchModelsViaApiCall(trimmedBaseUrl);
            setModels(list);
            return;
          } catch (fallbackErr: unknown) {
            const message = getErrorMessage(fallbackErr) || getErrorMessage(err);
            setModels([]);
            setError(`${t('ai_providers.openai_models_fetch_error')}: ${message}`);
          }
        } else {
          setModels([]);
          setError(`${t('ai_providers.openai_models_fetch_error')}: ${getErrorMessage(err)}`);
        }
      } finally {
        setFetching(false);
      }
    },
    [form.apiKeyEntries, form.baseUrl, form.headers, t]
  );

  useEffect(() => {
    if (initialLoading) return;
    setEndpoint(buildOpenAIModelsEndpoint(form.baseUrl));
    setModels([]);
    setSearch('');
    setSelected(new Set());
    setError('');
    void fetchOpenaiModelDiscovery();
  }, [fetchOpenaiModelDiscovery, form.baseUrl, initialLoading]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const toggleSelection = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleApply = () => {
    const selectedModels = models.filter((model) => selected.has(model.name));
    if (selectedModels.length) {
      mergeDiscoveredModels(selectedModels);
    }
    handleBack();
  };

  const canApply = !disableControls && !saving && !fetching;
  const selectedCount = selected.size;

  const handleSelectAllFiltered = () => {
    if (!filteredModels.length) return;
    setSelected((prev) => {
      const next = new Set(prev);
      filteredModels.forEach((model) => {
        if (model.name) {
          next.add(model.name);
        }
      });
      return next;
    });
  };

  const handleClearSelected = () => {
    if (!selectedCount) return;
    setSelected(new Set());
  };

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      contentClassName={layoutStyles.content}
      title={t('ai_providers.openai_models_fetch_title')}
      onBack={handleBack}
      backLabel={t('common.back')}
      backAriaLabel={t('common.back')}
      hideTopBarBackButton
      hideTopBarRightAction
      floatingAction={
        <div className={layoutStyles.floatingActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBack}
            className={layoutStyles.floatingBackButton}
          >
            {t('common.back')}
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={!canApply}
            className={layoutStyles.floatingSaveButton}
          >
            {t('ai_providers.openai_models_fetch_apply')}
          </Button>
        </div>
      }
      isLoading={initialLoading}
      loadingLabel={t('common.loading')}
    >
      <Card className={layoutStyles.formCard}>
        <ModelDiscoveryPanel
          hintText={t('ai_providers.openai_models_fetch_hint')}
          endpointLabel={t('ai_providers.openai_models_fetch_url_label')}
          endpointValue={endpoint}
          refreshLabel={t('ai_providers.openai_models_fetch_refresh')}
          onRefresh={() => void fetchOpenaiModelDiscovery({ allowFallback: true })}
          refreshLoading={fetching}
          refreshDisabled={disableControls || saving}
          searchLabel={t('ai_providers.openai_models_search_label')}
          searchPlaceholder={t('ai_providers.openai_models_search_placeholder')}
          searchValue={search}
          onSearchChange={setSearch}
          searchDisabled={fetching}
          selectedText={t('auth_files.batch_selected', { count: selectedCount })}
          selectAllLabel={t('auth_files.batch_select_all')}
          clearSelectedLabel={t('auth_files.batch_deselect')}
          onSelectAll={handleSelectAllFiltered}
          onClearSelected={handleClearSelected}
          selectAllDisabled={fetching || filteredModels.length === 0}
          clearSelectedDisabled={fetching || selectedCount === 0}
          error={error}
          loading={fetching}
          loadingText={t('ai_providers.openai_models_fetch_loading')}
          emptyText={t('ai_providers.openai_models_fetch_empty')}
          searchEmptyText={t('ai_providers.openai_models_search_empty')}
          models={models}
          filteredModels={filteredModels}
          selectedNames={selected}
          onToggleModel={toggleSelection}
        />
      </Card>
    </SecondaryScreenShell>
  );
}
