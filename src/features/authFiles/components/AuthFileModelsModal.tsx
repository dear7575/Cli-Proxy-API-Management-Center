import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import { isModelExcluded } from '@/features/authFiles/constants';
import styles from './AuthFileModelsModal.module.scss';

export type AuthFileModelsModalProps = {
  open: boolean;
  fileName: string;
  fileType: string;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  excluded: Record<string, string[]>;
  onClose: () => void;
  onCopyText: (text: string) => void;
};

export function AuthFileModelsModal(props: AuthFileModelsModalProps) {
  const { t } = useTranslation();
  const { open, fileName, fileType, loading, error, models, excluded, onClose, onCopyText } = props;
  const excludedCount = models.reduce(
    (count, model) => (isModelExcluded(model.id, fileType, excluded) ? count + 1 : count),
    0
  );
  const totalCountLabel = t('auth_files.model_count', {
    defaultValue: '{{count}} 个模型',
    count: models.length
  });
  const excludedCountLabel = t('auth_files.models_excluded_count', {
    defaultValue: '{{count}} 个已禁用',
    count: excludedCount
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      className={styles.modelsModal}
      width={680}
      title={
        <span className={styles.titleWrap}>
          <span className={styles.titleText}>
            {t('auth_files.models_title', { defaultValue: '支持的模型' })}
          </span>
          <span className={styles.fileNamePill} title={fileName}>
            {fileName}
          </span>
        </span>
      }
      footer={
        <Button variant="secondary" onClick={onClose} className={styles.closeBtn}>
          {t('common.close')}
        </Button>
      }
    >
      {loading ? (
        <div className={styles.stateHint}>
          {t('auth_files.models_loading', { defaultValue: '正在加载模型列表...' })}
        </div>
      ) : error === 'unsupported' ? (
        <EmptyState
          title={t('auth_files.models_unsupported', { defaultValue: '当前版本不支持此功能' })}
          description={t('auth_files.models_unsupported_desc', {
            defaultValue: '请更新 CLI Proxy API 到最新版本后重试'
          })}
        />
      ) : models.length === 0 ? (
        <EmptyState
          title={t('auth_files.models_empty', { defaultValue: '该凭证暂无可用模型' })}
          description={t('auth_files.models_empty_desc', {
            defaultValue: '该认证凭证可能尚未被服务器加载或没有绑定任何模型'
          })}
        />
      ) : (
        <div className={styles.content}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryPill}>{totalCountLabel}</span>
            {excludedCount > 0 && <span className={styles.summaryPillDanger}>{excludedCountLabel}</span>}
            <span className={styles.summaryHint}>
              {t('common.copy', { defaultValue: '点击复制' })}
            </span>
          </div>
          <div className={styles.modelsList}>
            {models.map((model) => {
              const excludedModel = isModelExcluded(model.id, fileType, excluded);
              return (
                <button
                  type="button"
                  key={model.id}
                  className={`${styles.modelRow} ${excludedModel ? styles.modelRowExcluded : ''}`}
                  onClick={() => {
                    onCopyText(model.id);
                  }}
                  title={
                    excludedModel
                      ? t('auth_files.models_excluded_hint', {
                          defaultValue: '此 OAuth 模型已被禁用'
                        })
                      : t('common.copy', { defaultValue: '点击复制' })
                  }
                >
                  <span className={styles.modelMain}>
                    <span className={styles.modelId} title={model.id}>
                      {model.id}
                    </span>
                    {model.display_name && model.display_name !== model.id && (
                      <span className={styles.modelDisplayName} title={model.display_name}>
                        {model.display_name}
                      </span>
                    )}
                  </span>
                  <span className={styles.modelMeta}>
                    {model.type && <span className={styles.modelType}>{model.type}</span>}
                    {excludedModel && (
                      <span className={styles.modelExcludedBadge}>
                        {t('auth_files.models_excluded_badge', { defaultValue: '已禁用' })}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

