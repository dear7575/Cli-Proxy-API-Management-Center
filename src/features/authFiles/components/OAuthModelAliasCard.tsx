import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModelMappingDiagram, type ModelMappingDiagramRef } from '@/components/modelAlias';
import { IconChevronUp, IconPencil, IconTrash2 } from '@/components/ui/icons';
import type { OAuthModelAliasEntry } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import styles from '@/pages/AuthFilesPage.module.scss';

type UnsupportedError = 'unsupported' | null;
type ViewMode = 'diagram' | 'list';

export type OAuthModelAliasCardProps = {
  disableControls: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onAdd: () => void;
  onEditProvider: (provider?: string) => void;
  onDeleteProvider: (provider: string) => void;
  modelAliasError: UnsupportedError;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  allProviderModels: Record<string, AuthFileModelItem[]>;
  onUpdate: (provider: string, sourceModel: string, newAlias: string) => Promise<void>;
  onDeleteLink: (provider: string, sourceModel: string, alias: string) => void;
  onToggleFork: (provider: string, sourceModel: string, alias: string, fork: boolean) => Promise<void>;
  onRenameAlias: (oldAlias: string, newAlias: string) => Promise<void>;
  onDeleteAlias: (aliasName: string) => void;
};

export function OAuthModelAliasCard(props: OAuthModelAliasCardProps) {
  const { t } = useTranslation();
  const diagramRef = useRef<ModelMappingDiagramRef | null>(null);
  const {
    disableControls,
    viewMode,
    onViewModeChange,
    onAdd,
    onEditProvider,
    onDeleteProvider,
    modelAliasError,
    modelAlias,
    allProviderModels,
    onUpdate,
    onDeleteLink,
    onToggleFork,
    onRenameAlias,
    onDeleteAlias
  } = props;

  return (
    <Card
      title={t('oauth_model_alias.title')}
      extra={
        <div className={styles.cardExtraButtons}>
          <div className={styles.viewModeSwitch}>
            <Button
              variant="ghost"
              size="sm"
              className={`${styles.viewModeButton} ${viewMode === 'list' ? styles.viewModeButtonActive : ''}`}
              onClick={() => onViewModeChange('list')}
              disabled={disableControls || modelAliasError === 'unsupported'}
            >
              {t('oauth_model_alias.view_mode_list')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`${styles.viewModeButton} ${viewMode === 'diagram' ? styles.viewModeButtonActive : ''}`}
              onClick={() => onViewModeChange('diagram')}
              disabled={disableControls || modelAliasError === 'unsupported'}
            >
              {t('oauth_model_alias.view_mode_diagram')}
            </Button>
          </div>
          <Button
            size="sm"
            onClick={onAdd}
            disabled={disableControls || modelAliasError === 'unsupported'}
          >
            {t('oauth_model_alias.add')}
          </Button>
        </div>
      }
    >
      {modelAliasError === 'unsupported' ? (
        <EmptyState
          title={t('oauth_model_alias.upgrade_required_title')}
          description={t('oauth_model_alias.upgrade_required_desc')}
        />
      ) : viewMode === 'diagram' ? (
        Object.keys(modelAlias).length === 0 ? (
          <EmptyState title={t('oauth_model_alias.list_empty_all')} />
        ) : (
          <div className={styles.aliasChartSection}>
            <div className={styles.aliasChartHeader}>
              <h4 className={styles.aliasChartTitle}>{t('oauth_model_alias.chart_title')}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => diagramRef.current?.collapseAll()}
                disabled={disableControls || modelAliasError === 'unsupported'}
                title={t('oauth_model_alias.diagram_collapse')}
                aria-label={t('oauth_model_alias.diagram_collapse')}
              >
                <IconChevronUp size={16} />
              </Button>
            </div>
            <ModelMappingDiagram
              ref={diagramRef}
              modelAlias={modelAlias}
              allProviderModels={allProviderModels}
              onUpdate={onUpdate}
              onDeleteLink={onDeleteLink}
              onToggleFork={onToggleFork}
              onRenameAlias={onRenameAlias}
              onDeleteAlias={onDeleteAlias}
              onEditProvider={onEditProvider}
              onDeleteProvider={onDeleteProvider}
              className={styles.aliasChart}
            />
          </div>
        )
      ) : Object.keys(modelAlias).length === 0 ? (
        <EmptyState title={t('oauth_model_alias.list_empty_all')} />
      ) : (
        <div className={`${styles.excludedList} ${styles.excludedListTwoCol}`}>
          {Object.entries(modelAlias).map(([provider, mappings]) => (
            <div key={provider} className={`${styles.excludedItem} ${styles.excludedItemGrid}`}>
              <div className={styles.excludedInfo}>
                <div className={styles.excludedProviderRow}>
                  <div className={styles.excludedProvider}>
                    <span>{provider}</span>
                    <span className={styles.aliasCountInline}>
                      {t('oauth_model_alias.model_count', { count: mappings.length })}
                    </span>
                  </div>
                </div>
                {mappings?.length ? (
                  <div className={styles.aliasMappingChips}>
                    {mappings.map((mapping, index) => (
                      <span
                        key={`${provider}-${mapping.name}-${mapping.alias}-${index}`}
                        className={styles.aliasMappingChip}
                        title={`${mapping.name} -> ${mapping.alias}`}
                      >
                        <span className={styles.aliasSourcePill} title={mapping.name}>
                          {mapping.name}
                        </span>
                        <span className={styles.aliasArrow} aria-hidden="true">→</span>
                        <span className={styles.aliasTargetPill} title={mapping.alias}>
                          {mapping.alias}
                        </span>
                        {mapping.fork && (
                          <span className={styles.aliasForkBadge}>
                            {t('oauth_model_alias.alias_fork_label')}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.excludedModels}>{t('oauth_model_alias.no_models')}</div>
                )}
              </div>
              <div className={styles.excludedActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  className={styles.iconButton}
                  onClick={() => onEditProvider(provider)}
                  title={t('common.edit')}
                  aria-label={t('common.edit')}
                >
                  <IconPencil className={styles.actionIcon} size={16} />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className={styles.iconButton}
                  onClick={() => onDeleteProvider(provider)}
                  title={t('oauth_model_alias.delete')}
                  aria-label={t('oauth_model_alias.delete')}
                >
                  <IconTrash2 className={styles.actionIcon} size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

