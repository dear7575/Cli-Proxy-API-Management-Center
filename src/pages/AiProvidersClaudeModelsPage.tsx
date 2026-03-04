import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { ClaudeEditOutletContext } from './AiProvidersClaudeEditLayout';
import layoutStyles from './AiProvidersEditLayout.module.scss';

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

export function AiProvidersClaudeModelsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    disableControls,
    loading: initialLoading,
    saving,
    form,
    mergeDiscoveredModels,
  } = useOutletContext<ClaudeEditOutletContext>();

  const [endpoint, setEndpoint] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const autoFetchSignatureRef = useRef<string>('');

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

  const fetchClaudeModelDiscovery = useCallback(async () => {
    setFetching(true);
    setError('');
    const headerObject = buildHeaderObject(form.headers);
    try {
      const list = await modelsApi.fetchClaudeModelsViaApiCall(
        form.baseUrl ?? '',
        form.apiKey.trim() || undefined,
        headerObject
      );
      setModels(list);
    } catch (err: unknown) {
      setModels([]);
      const message = getErrorMessage(err);
      const hasCustomXApiKey = Object.keys(headerObject).some(
        (key) => key.toLowerCase() === 'x-api-key'
      );
      const hasAuthorization = Object.keys(headerObject).some(
        (key) => key.toLowerCase() === 'authorization'
      );
      const shouldAttachDiag =
        message.toLowerCase().includes('x-api-key') || message.includes('401');
      const diag = shouldAttachDiag
        ? ` [diag: apiKeyField=${form.apiKey.trim() ? 'yes' : 'no'}, customXApiKey=${
            hasCustomXApiKey ? 'yes' : 'no'
          }, customAuthorization=${hasAuthorization ? 'yes' : 'no'}]`
        : '';
      setError(`${t('ai_providers.claude_models_fetch_error')}: ${message}${diag}`);
    } finally {
      setFetching(false);
    }
  }, [form.apiKey, form.baseUrl, form.headers, t]);

  useEffect(() => {
    if (initialLoading) return;

    const nextEndpoint = modelsApi.buildClaudeModelsEndpoint(form.baseUrl ?? '');
    setEndpoint(nextEndpoint);
    setModels([]);
    setSearch('');
    setSelected(new Set());
    setError('');

    const headerObject = buildHeaderObject(form.headers);
    const hasCustomXApiKey = Object.keys(headerObject).some(
      (key) => key.toLowerCase() === 'x-api-key'
    );
    const hasAuthorization = Object.keys(headerObject).some(
      (key) => key.toLowerCase() === 'authorization'
    );
    const hasApiKeyField = Boolean(form.apiKey.trim());
    const canAutoFetch = hasApiKeyField || hasCustomXApiKey || hasAuthorization;

    // Avoid firing a guaranteed 401 on initial render (common while the parent form is still
    // initializing), and avoid duplicate auto-fetches (e.g. React StrictMode in dev).
    if (!canAutoFetch) return;

    const headerSignature = Object.entries(headerObject)
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    const signature = `${nextEndpoint}||${form.apiKey.trim()}||${headerSignature}`;
    if (autoFetchSignatureRef.current === signature) return;
    autoFetchSignatureRef.current = signature;

    void fetchClaudeModelDiscovery();
  }, [fetchClaudeModelDiscovery, form.apiKey, form.baseUrl, form.headers, initialLoading]);

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
      title={t('ai_providers.claude_models_fetch_title')}
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
            {t('ai_providers.claude_models_fetch_apply')}
          </Button>
        </div>
      }
      isLoading={initialLoading}
      loadingLabel={t('common.loading')}
    >
      <Card className={layoutStyles.formCard}>
        <ModelDiscoveryPanel
          hintText={t('ai_providers.claude_models_fetch_hint')}
          endpointLabel={t('ai_providers.claude_models_fetch_url_label')}
          endpointValue={endpoint}
          refreshLabel={t('ai_providers.claude_models_fetch_refresh')}
          onRefresh={() => void fetchClaudeModelDiscovery()}
          refreshLoading={fetching}
          refreshDisabled={disableControls || saving}
          searchLabel={t('ai_providers.claude_models_search_label')}
          searchPlaceholder={t('ai_providers.claude_models_search_placeholder')}
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
          loadingText={t('ai_providers.claude_models_fetch_loading')}
          emptyText={t('ai_providers.claude_models_fetch_empty')}
          searchEmptyText={t('ai_providers.claude_models_search_empty')}
          models={models}
          filteredModels={filteredModels}
          selectedNames={selected}
          onToggleModel={toggleSelection}
        />
      </Card>
    </SecondaryScreenShell>
  );
}
