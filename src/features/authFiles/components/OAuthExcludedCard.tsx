import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconPencil, IconTrash2 } from '@/components/ui/icons';
import styles from '@/pages/AuthFilesPage.module.scss';

type UnsupportedError = 'unsupported' | null;

export type OAuthExcludedCardProps = {
  disableControls: boolean;
  excludedError: UnsupportedError;
  excluded: Record<string, string[]>;
  onAdd: () => void;
  onEdit: (provider: string) => void;
  onDelete: (provider: string) => void;
};

export function OAuthExcludedCard(props: OAuthExcludedCardProps) {
  const { t } = useTranslation();
  const { disableControls, excludedError, excluded, onAdd, onEdit, onDelete } = props;

  return (
    <Card
      title={t('oauth_excluded.title')}
      extra={
        <div className={styles.cardExtraButtons}>
          <Button size="sm" onClick={onAdd} disabled={disableControls || excludedError === 'unsupported'}>
            {t('oauth_excluded.add')}
          </Button>
        </div>
      }
    >
      {excludedError === 'unsupported' ? (
        <EmptyState
          title={t('oauth_excluded.upgrade_required_title')}
          description={t('oauth_excluded.upgrade_required_desc')}
        />
      ) : Object.keys(excluded).length === 0 ? (
        <EmptyState title={t('oauth_excluded.list_empty_all')} />
      ) : (
        <div className={`${styles.excludedList} ${styles.excludedListTwoCol}`}>
          {Object.entries(excluded).map(([provider, models]) => (
            <div key={provider} className={`${styles.excludedItem} ${styles.excludedItemGrid}`}>
              <div className={styles.excludedInfo}>
                <div className={styles.excludedProviderRow}>
                  <div className={styles.excludedProvider}>{provider}</div>
                </div>
                {models?.length ? (
                  <div className={styles.excludedModelChips}>
                    {models.map((model, index) => (
                      <span
                        key={`${provider}-${model}-${index}`}
                        className={styles.excludedModelChip}
                        title={model}
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.excludedModels}>{t('oauth_excluded.no_models')}</div>
                )}
              </div>
              <div className={styles.excludedActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  className={styles.iconButton}
                  onClick={() => onEdit(provider)}
                  title={t('common.edit')}
                  aria-label={t('common.edit')}
                >
                  <IconPencil className={styles.actionIcon} size={16} />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className={styles.iconButton}
                  onClick={() => onDelete(provider)}
                  title={t('oauth_excluded.delete')}
                  aria-label={t('oauth_excluded.delete')}
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

