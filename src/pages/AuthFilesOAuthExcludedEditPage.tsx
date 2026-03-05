import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { HintLabel } from '@/components/ui/HintLabel';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useAuthStore, useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem, OAuthModelAliasEntry } from '@/types';
import styles from './AuthFilesOAuthExcludedEditPage.module.scss';
import layoutStyles from './AiProvidersEditLayout.module.scss';

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };

type LocationState = { fromAuthFiles?: boolean } | null;

const OAUTH_PROVIDER_PRESETS = [
  'gemini-cli',
  'vertex',
  'aistudio',
  'antigravity',
  'claude',
  'codex',
  'qwen',
  'kimi',
  'iflow',
];

const OAUTH_PROVIDER_EXCLUDES = new Set(['all', 'unknown', 'empty']);

const normalizeProviderKey = (value: string) => value.trim().toLowerCase();

export function AuthFilesOAuthExcludedEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const [searchParams, setSearchParams] = useSearchParams();
  const providerFromParams = searchParams.get('provider') ?? '';

  const [provider, setProvider] = useState(providerFromParams);
  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [excludedUnsupported, setExcludedUnsupported] = useState(false);

  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [modelKeyword, setModelKeyword] = useState('');
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<'unsupported' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProvider(providerFromParams);
  }, [providerFromParams]);

  const providerOptions = useMemo(() => {
    const extraProviders = new Set<string>();
    Object.keys(excluded).forEach((value) => extraProviders.add(value));
    Object.keys(modelAlias).forEach((value) => extraProviders.add(value));
    files.forEach((file) => {
      if (typeof file.type === 'string') {
        extraProviders.add(file.type);
      }
      if (typeof file.provider === 'string') {
        extraProviders.add(file.provider);
      }
    });

    const normalizedExtras = Array.from(extraProviders)
      .map((value) => value.trim())
      .filter((value) => value && !OAUTH_PROVIDER_EXCLUDES.has(value.toLowerCase()));

    const baseSet = new Set(OAUTH_PROVIDER_PRESETS.map((value) => value.toLowerCase()));
    const extraList = normalizedExtras
      .filter((value) => !baseSet.has(value.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    const merged = [...OAUTH_PROVIDER_PRESETS, ...extraList];
    const currentProvider = provider.trim();
    if (currentProvider && !merged.some((value) => value.toLowerCase() === currentProvider.toLowerCase())) {
      merged.unshift(currentProvider);
    }
    return merged;
  }, [excluded, files, modelAlias, provider]);

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

  const resolvedProviderKey = useMemo(() => normalizeProviderKey(provider), [provider]);
  const isEditing = useMemo(() => {
    if (!resolvedProviderKey) return false;
    return Object.prototype.hasOwnProperty.call(excluded, resolvedProviderKey);
  }, [excluded, resolvedProviderKey]);

  const title = useMemo(() => {
    if (isEditing) {
      return t('oauth_excluded.edit_title', { provider: provider.trim() || resolvedProviderKey });
    }
    return t('oauth_excluded.add_title');
  }, [isEditing, provider, resolvedProviderKey, t]);

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAuthFiles) {
      navigate(-1);
      return;
    }
    navigate('/auth-files', { replace: true });
  }, [location.state, navigate]);

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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setInitialLoading(true);
      setExcludedUnsupported(false);
      try {
        const [filesResult, excludedResult, aliasResult] = await Promise.allSettled([
          authFilesApi.list(),
          authFilesApi.getOauthExcludedModels(),
          authFilesApi.getOauthModelAlias(),
        ]);

        if (cancelled) return;

        if (filesResult.status === 'fulfilled') {
          setFiles(filesResult.value?.files ?? []);
        }

        if (aliasResult.status === 'fulfilled') {
          setModelAlias(aliasResult.value ?? {});
        }

        if (excludedResult.status === 'fulfilled') {
          setExcluded(excludedResult.value ?? {});
          return;
        }

        const err = excludedResult.status === 'rejected' ? excludedResult.reason : null;
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;

        if (status === 404) {
          setExcludedUnsupported(true);
          return;
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    };

    load().catch(() => {
      if (!cancelled) {
        setInitialLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!resolvedProviderKey) {
      setSelectedModels(new Set());
      return;
    }
    const existing = excluded[resolvedProviderKey] ?? [];
    setSelectedModels(new Set(existing));
  }, [excluded, resolvedProviderKey]);

  useEffect(() => {
    if (!resolvedProviderKey || excludedUnsupported) {
      setModelsList([]);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);

    authFilesApi
      .getModelDefinitions(resolvedProviderKey)
      .then((models) => {
        if (cancelled) return;
        setModelsList(models);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;

        if (status === 404) {
          setModelsList([]);
          setModelsError('unsupported');
          return;
        }

        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
      })
      .finally(() => {
        if (cancelled) return;
        setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [excludedUnsupported, resolvedProviderKey, showNotification, t]);

  const updateProvider = useCallback(
    (value: string) => {
      setProvider(value);
      const next = new URLSearchParams(searchParams);
      const trimmed = value.trim();
      if (trimmed) {
        next.set('provider', trimmed);
      } else {
        next.delete('provider');
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const toggleModel = useCallback((modelId: string, checked: boolean) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      return next;
    });
  }, []);

  const filteredModels = useMemo(() => {
    const keyword = modelKeyword.trim().toLowerCase();
    if (!keyword) return modelsList;
    return modelsList.filter((model) => {
      const id = String(model.id ?? '').toLowerCase();
      const displayName = String(model.display_name ?? '').toLowerCase();
      return id.includes(keyword) || displayName.includes(keyword);
    });
  }, [modelKeyword, modelsList]);

  const selectedVisibleCount = useMemo(
    () => filteredModels.reduce((count, model) => (selectedModels.has(model.id) ? count + 1 : count), 0),
    [filteredModels, selectedModels]
  );

  const selectVisibleModels = useCallback(() => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      filteredModels.forEach((model) => next.add(model.id));
      return next;
    });
  }, [filteredModels]);

  const clearVisibleModels = useCallback(() => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      filteredModels.forEach((model) => next.delete(model.id));
      return next;
    });
  }, [filteredModels]);

  const handleSave = useCallback(async () => {
    const normalizedProvider = normalizeProviderKey(provider);
    if (!normalizedProvider) {
      showNotification(t('oauth_excluded.provider_required'), 'error');
      return;
    }

    const models = [...selectedModels];
    setSaving(true);
    try {
      if (models.length) {
        await authFilesApi.saveOauthExcludedModels(normalizedProvider, models);
      } else {
        await authFilesApi.deleteOauthExcludedEntry(normalizedProvider);
      }
      showNotification(t('oauth_excluded.save_success'), 'success');
      handleBack();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_excluded.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [handleBack, provider, selectedModels, showNotification, t]);

  const canSave = !disableControls && !saving && !excludedUnsupported;

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      title={title}
      onBack={handleBack}
      backLabel={t('common.back')}
      backAriaLabel={t('common.back')}
      contentClassName={styles.pageContent}
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
            onClick={() => void handleSave()}
            loading={saving}
            disabled={!canSave}
            className={layoutStyles.floatingSaveButton}
          >
            {t('common.save')}
          </Button>
        </div>
      }
      isLoading={initialLoading}
      loadingLabel={t('common.loading')}
    >
      {excludedUnsupported ? (
        <Card>
          <EmptyState
            title={t('oauth_excluded.upgrade_required_title')}
            description={t('oauth_excluded.upgrade_required_desc')}
          />
        </Card>
      ) : (
        <>
          <Card className={styles.settingsCard}>
            <div className={styles.settingsHeader}>
              <HintLabel
                className={styles.settingsHeaderTitle}
                label={t('oauth_excluded.title')}
                hint={t('oauth_excluded.description')}
              />
            </div>

            <div className={styles.settingsSection}>
              <div className={styles.providerChooserHeader}>
                <div className={styles.settingsLabel}>{t('oauth_excluded.provider_label')}</div>
                {provider.trim() ? (
                  <span className={styles.providerCurrentBadge}>
                    {t('oauth_excluded.provider_label')}: {getTypeLabel(provider.trim())}
                  </span>
                ) : null}
              </div>

              {providerOptions.length > 0 ? (
                <div className={styles.providerCardGrid}>
                  {providerOptions.map((option) => {
                    const isActive = normalizeProviderKey(provider) === option.toLowerCase();
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`${styles.providerCard} ${isActive ? styles.providerCardActive : ''}`}
                        onClick={() => updateProvider(option)}
                        disabled={disableControls || saving}
                      >
                        <span className={styles.providerCardTitle}>{getTypeLabel(option)}</span>
                        <span className={styles.providerCardMeta}>{option}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

            </div>
          </Card>

          <Card className={styles.settingsCard}>
            <div className={`${styles.settingsHeader} ${styles.modelsHeader}`}>
              <div className={styles.settingsHeaderTitle}>{t('oauth_excluded.models_label')}</div>
              <div className={styles.modelsHeaderMeta}>
                {resolvedProviderKey ? (
                  <span
                    className={`${styles.modelsStatusBadge} ${
                      modelsError === 'unsupported'
                        ? styles.modelsStatusBadgeWarning
                        : modelsLoading
                          ? styles.modelsStatusBadgeLoading
                          : styles.modelsStatusBadgeSuccess
                    }`}
                  >
                  {modelsLoading ? (
                    t('oauth_excluded.models_loading')
                  ) : modelsError === 'unsupported' ? (
                    t('oauth_excluded.models_unsupported')
                  ) : modelsList.length > 0 ? (
                    t('oauth_excluded.models_loaded', { count: modelsList.length })
                  ) : (
                    t('oauth_excluded.no_models_available')
                  )}
                  </span>
                ) : null}
                <span className={styles.modelsSelectedBadge}>
                  {t('oauth_excluded.models_selected_count', { count: selectedModels.size })}
                </span>
              </div>
            </div>

            {modelsLoading ? (
              <div className={styles.loadingModels}>
                <LoadingSpinner size={16} />
                <span>{t('common.loading')}</span>
              </div>
            ) : modelsList.length > 0 ? (
              <div className={styles.modelsPanel}>
                <div className={styles.modelsToolbar}>
                  <div className={styles.modelsSearch}>
                    <input
                      className={`input ${styles.modelsSearchInput}`}
                      placeholder={t('oauth_excluded.models_search_placeholder')}
                      value={modelKeyword}
                      onChange={(event) => setModelKeyword(event.target.value)}
                      disabled={disableControls || saving}
                    />
                  </div>
                  <div className={styles.modelsToolbarActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={selectVisibleModels}
                      disabled={disableControls || saving || filteredModels.length === 0}
                    >
                      {t('oauth_excluded.models_select_visible')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={clearVisibleModels}
                      disabled={disableControls || saving || selectedVisibleCount === 0}
                    >
                      {t('oauth_excluded.models_clear_visible')}
                    </Button>
                  </div>
                </div>

                {filteredModels.length > 0 ? (
                  <div className={styles.modelList}>
                    {filteredModels.map((model) => {
                      const checked = selectedModels.has(model.id);
                      return (
                        <label key={model.id} className={`${styles.modelItem} ${checked ? styles.modelItemChecked : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disableControls || saving}
                            onChange={(event) => toggleModel(model.id, event.target.checked)}
                          />
                          <span className={styles.modelText}>
                            <span className={styles.modelId}>{model.id}</span>
                            {model.display_name && model.display_name !== model.id && (
                              <span className={styles.modelDisplayName}>{model.display_name}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyModels}>{t('oauth_excluded.models_filtered_empty')}</div>
                )}
              </div>
            ) : resolvedProviderKey ? (
              <div className={styles.emptyModels}>
                {modelsError === 'unsupported'
                  ? t('oauth_excluded.models_unsupported')
                  : t('oauth_excluded.no_models_available')}
              </div>
            ) : (
              <div className={styles.emptyModels}>{t('oauth_excluded.provider_required')}</div>
            )}
          </Card>
        </>
      )}
    </SecondaryScreenShell>
  );
}
