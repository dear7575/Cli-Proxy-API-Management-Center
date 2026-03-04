import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { AuthFileItem } from '@/types';
import { formatFileSize } from '@/utils/format';
import { formatModified } from '@/features/authFiles/constants';
import styles from './AuthFileDetailModal.module.scss';

export type AuthFileDetailModalProps = {
  open: boolean;
  file: AuthFileItem | null;
  onClose: () => void;
  onCopyText: (text: string) => void;
};

export function AuthFileDetailModal({ open, file, onClose, onCopyText }: AuthFileDetailModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      className={styles.detailModal}
      width={760}
      title={
        <span className={styles.titleWrap}>
          <span className={styles.titleText}>
            {t('auth_files.title_section', { defaultValue: '认证文件详情' })}
          </span>
          {file?.name && (
            <span className={styles.fileNamePill} title={file.name}>
              {file.name}
            </span>
          )}
        </span>
      }
      footer={
        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={onClose} className={styles.footerBtn}>
            {t('common.close')}
          </Button>
          <Button
            className={styles.footerBtn}
            onClick={() => {
              if (!file) return;
              const text = JSON.stringify(file, null, 2);
              onCopyText(text);
            }}
          >
            {t('common.copy')}
          </Button>
        </div>
      }
    >
      {file && (
        <div className={styles.content}>
          <div className={styles.metaRow}>
            <span className={styles.metaPill}>
              {t('auth_files.file_type')}: {file.type || '-'}
            </span>
            <span className={styles.metaPill}>
              {t('auth_files.file_size')}: {file.size ? formatFileSize(file.size) : '-'}
            </span>
            <span className={styles.metaPill}>
              {t('auth_files.file_modified')}: {formatModified(file)}
            </span>
          </div>
          <div className={styles.jsonPanel}>
            <pre className={styles.jsonContent}>{JSON.stringify(file, null, 2)}</pre>
          </div>
        </div>
      )}
    </Modal>
  );
}

