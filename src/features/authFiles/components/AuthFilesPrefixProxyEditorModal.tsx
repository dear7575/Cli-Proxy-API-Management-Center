import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
  PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import styles from './AuthFilesPrefixProxyEditorModal.module.scss';

export type AuthFilesPrefixProxyEditorModalProps = {
  disableControls: boolean;
  editor: PrefixProxyEditorState | null;
  updatedText: string;
  dirty: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
};

export function AuthFilesPrefixProxyEditorModal(props: AuthFilesPrefixProxyEditorModalProps) {
  const { t } = useTranslation();
  const { disableControls, editor, updatedText, dirty, onClose, onSave, onChange } = props;
  const titleText = editor?.fileName
    ? t('auth_files.auth_field_editor_title', { name: editor.fileName })
    : t('auth_files.prefix_proxy_button');

  return (
    <Modal
      open={Boolean(editor)}
      onClose={onClose}
      closeDisabled={editor?.saving === true}
      width={720}
      className={styles.editorModal}
      title={<span className={styles.titleText}>{titleText}</span>}
      footer={
        <div className={styles.footerActions}>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={editor?.saving === true}
            className={styles.footerBtn}
          >
            {t('common.cancel')}
          </Button>
          <Button
            className={styles.footerBtn}
            onClick={onSave}
            loading={editor?.saving === true}
            disabled={disableControls || editor?.saving === true || !dirty || !editor?.json}
          >
            {t('common.save')}
          </Button>
        </div>
      }
    >
      {editor && (
        <div className={styles.editorContent}>
          {editor.loading ? (
            <div className={styles.loadingState}>
              <LoadingSpinner size={14} />
              <span>{t('auth_files.prefix_proxy_loading')}</span>
            </div>
          ) : (
            <>
              {editor.error && <div className={styles.errorBox}>{editor.error}</div>}
              <div className={styles.sourceSection}>
                <label className={styles.sectionLabel}>
                  {t('auth_files.prefix_proxy_source_label')}
                </label>
                <textarea
                  className={styles.sourceTextarea}
                  rows={10}
                  readOnly
                  value={updatedText}
                />
              </div>
              <div className={styles.fieldsSection}>
                <Input
                  label={t('auth_files.prefix_label')}
                  value={editor.prefix}
                  disabled={disableControls || editor.saving || !editor.json}
                  onChange={(e) => onChange('prefix', e.target.value)}
                />
                <Input
                  label={t('auth_files.proxy_url_label')}
                  value={editor.proxyUrl}
                  placeholder={t('auth_files.proxy_url_placeholder')}
                  disabled={disableControls || editor.saving || !editor.json}
                  onChange={(e) => onChange('proxyUrl', e.target.value)}
                />
                <Input
                  label={t('auth_files.priority_label')}
                  value={editor.priority}
                  placeholder={t('auth_files.priority_placeholder')}
                  hint={t('auth_files.priority_hint')}
                  disabled={disableControls || editor.saving || !editor.json}
                  onChange={(e) => onChange('priority', e.target.value)}
                />
                <div className={styles.formGroup}>
                  <label>{t('auth_files.excluded_models_label')}</label>
                  <textarea
                    className={styles.fieldTextarea}
                    value={editor.excludedModelsText}
                    placeholder={t('auth_files.excluded_models_placeholder')}
                    rows={4}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('excludedModelsText', e.target.value)}
                  />
                  <div className={styles.fieldHint}>{t('auth_files.excluded_models_hint')}</div>
                </div>
                <Input
                  label={t('auth_files.disable_cooling_label')}
                  value={editor.disableCooling}
                  placeholder={t('auth_files.disable_cooling_placeholder')}
                  hint={t('auth_files.disable_cooling_hint')}
                  disabled={disableControls || editor.saving || !editor.json}
                  onChange={(e) => onChange('disableCooling', e.target.value)}
                />
                <Input
                  label={t('auth_files.note_label')}
                  value={editor.note}
                  placeholder={t('auth_files.note_placeholder')}
                  hint={t('auth_files.note_hint')}
                  disabled={disableControls || editor.saving || !editor.json}
                  onChange={(e) => onChange('note', e.target.value)}
                />
                {editor.isCodexFile && (
                  <div className={styles.formGroup}>
                    <label>{t('ai_providers.codex_websockets_label')}</label>
                    <div className={styles.toggleRow}>
                      <ToggleSwitch
                        checked={Boolean(editor.websocket)}
                        disabled={disableControls || editor.saving || !editor.json}
                        ariaLabel={t('ai_providers.codex_websockets_label')}
                        onChange={(value) => onChange('websocket', value)}
                      />
                    </div>
                    <div className={styles.fieldHint}>{t('ai_providers.codex_websockets_hint')}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
