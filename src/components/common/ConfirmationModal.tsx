import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { IconInfo, IconSlidersHorizontal, IconTrash2 } from '@/components/ui/icons';
import { useNotificationStore } from '@/stores';
import styles from './ConfirmationModal.module.scss';

export function ConfirmationModal() {
  const { t } = useTranslation();
  const confirmation = useNotificationStore((state) => state.confirmation);
  const hideConfirmation = useNotificationStore((state) => state.hideConfirmation);
  const setConfirmationLoading = useNotificationStore((state) => state.setConfirmationLoading);

  const { isOpen, isLoading, options } = confirmation;

  if (!isOpen || !options) {
    return null;
  }

  const { title, message, onConfirm, onCancel, confirmText, cancelText, variant = 'primary' } = options;
  const tone = variant === 'danger' ? 'danger' : variant === 'secondary' ? 'secondary' : 'primary';
  const ToneIcon = tone === 'danger' ? IconTrash2 : tone === 'secondary' ? IconSlidersHorizontal : IconInfo;
  const modalClassName = `${styles.confirmationModal} ${styles[`tone-${tone}`]}`;

  const handleConfirm = async () => {
    try {
      setConfirmationLoading(true);
      await onConfirm();
      hideConfirmation();
    } catch (error) {
      console.error('Confirmation action failed:', error);
      // Optional: show error notification here if needed, 
      // but usually the calling component handles specific errors.
    } finally {
      setConfirmationLoading(false);
    }
  };

  const handleCancel = () => {
    if (isLoading) {
      return;
    }
    if (onCancel) {
      onCancel();
    }
    hideConfirmation();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleCancel}
      title={
        <span className={styles.titleRow}>
          <span className={styles.titleIcon}>
            <ToneIcon size={16} />
          </span>
          <span>{title || t('common.confirm')}</span>
        </span>
      }
      className={modalClassName}
      closeDisabled={isLoading}
    >
      <div className={styles.messagePanel}>
        <span className={styles.messageIcon}>
          <ToneIcon size={16} />
        </span>
        {typeof message === 'string' ? (
          <p className={styles.message}>{message}</p>
        ) : (
          <div className={styles.message}>{message}</div>
        )}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={handleCancel} disabled={isLoading}>
          {cancelText || t('common.cancel')}
        </Button>
        <Button 
          variant={variant} 
          onClick={handleConfirm} 
          loading={isLoading}
        >
          {confirmText || t('common.confirm')}
        </Button>
      </div>
    </Modal>
  );
}
