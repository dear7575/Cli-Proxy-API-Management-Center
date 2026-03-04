import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconChevronDown, IconChevronUp, IconCopy, IconInfo, IconPencil, IconTrash2 } from '@/components/ui/icons';
import { ConfigSection } from '@/components/config/ConfigSection';
import { useNotificationStore } from '@/stores';
import styles from './VisualConfigEditor.module.scss';
import { copyToClipboard } from '@/utils/clipboard';
import type {
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadParamEntry,
  PayloadParamValueType,
  PayloadRule,
  VisualConfigValues,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import {
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from '@/hooks/useVisualConfig';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';

interface VisualConfigEditorProps {
  values: VisualConfigValues;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
}

type ToggleRowProps = {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
};

type PayloadBlockKey = 'defaultRules' | 'overrideRules' | 'filterRules';

type PayloadSummary = {
  ruleCount: number;
  modelCount: number;
  paramCount: number;
};

function summarizePayloadRules<T extends { models: unknown[]; params: unknown[] }>(rules: T[]): PayloadSummary {
  return rules.reduce(
    (summary, rule) => ({
      ruleCount: summary.ruleCount + 1,
      modelCount: summary.modelCount + rule.models.length,
      paramCount: summary.paramCount + rule.params.length,
    }),
    { ruleCount: 0, modelCount: 0, paramCount: 0 }
  );
}

function HintBadge({ text, focusable = true }: { text: ReactNode; focusable?: boolean }) {
  const textLabel = typeof text === 'string' ? text : '说明';

  return (
    <span className={styles.toggleHint}>
      <span
        className={styles.toggleHintTrigger}
        tabIndex={focusable ? 0 : undefined}
        aria-label={focusable ? textLabel : undefined}
      >
        <IconInfo size={12} />
      </span>
      <span className={styles.toggleHintTooltip} role="tooltip">
        {text}
      </span>
    </span>
  );
}

function LabelWithHint({ label, hint }: { label: string; hint: ReactNode }) {
  return (
    <span className={styles.inlineLabelWithHint}>
      <span>{label}</span>
      <HintBadge text={hint} />
    </span>
  );
}

function ToggleRow({ title, description, checked, disabled, onChange }: ToggleRowProps) {
  const descriptionTitle = typeof description === 'string' ? description : undefined;

  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleText}>
        <div className={styles.toggleTitleRow}>
          <div className={styles.toggleTitle}>{title}</div>
          {description && (
            <HintBadge text={descriptionTitle ?? description} />
          )}
        </div>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} ariaLabel={title} />
    </div>
  );
}

function SectionGrid({ children }: { children: ReactNode }) {
  return <div className={styles.sectionGrid}>{children}</div>;
}

function Divider() {
  return <div className={styles.divider} />;
}

function PayloadSectionBlock({
  title,
  description,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  summary: PayloadSummary;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className={styles.payloadSectionBlock}>
      <button
        type="button"
        className={styles.payloadSectionHeader}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className={styles.payloadSectionHeading}>
          <div className={styles.payloadSectionTitleRow}>
            <div className={styles.payloadSectionTitle}>{title}</div>
            <HintBadge text={description} focusable={false} />
          </div>
        </div>
        <div className={styles.payloadSectionMeta}>
          <span className={styles.payloadSectionStat}>
            <strong>{summary.ruleCount}</strong>
            <span>{t('config_management.visual.payload_rules.rule')}</span>
          </span>
          <span className={styles.payloadSectionStat}>
            <strong>{summary.modelCount}</strong>
            <span>{t('config_management.visual.payload_rules.models')}</span>
          </span>
          <span className={styles.payloadSectionStat}>
            <strong>{summary.paramCount}</strong>
            <span>{t('config_management.visual.payload_rules.params')}</span>
          </span>
          <span className={styles.payloadSectionChevron}>
            {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </span>
        </div>
      </button>
      {expanded && <div className={styles.payloadSectionBody}>{children}</div>}
    </div>
  );
}

function ApiKeysCardEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const apiKeys = useMemo(
    () =>
      value
        .split('\n')
        .map((key) => key.trim())
        .filter(Boolean),
    [value]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [formError, setFormError] = useState('');

  function generateSecureApiKey(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(17);
    crypto.getRandomValues(array);
    return 'sk-' + Array.from(array, (b) => charset[b % charset.length]).join('');
  }

  const openAddModal = () => {
    setEditingIndex(null);
    setInputValue('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (index: number) => {
    setEditingIndex(index);
    setInputValue(apiKeys[index] ?? '');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setEditingIndex(null);
    setFormError('');
  };

  const updateApiKeys = (nextKeys: string[]) => {
    onChange(nextKeys.join('\n'));
  };

  const handleDelete = (index: number) => {
    updateApiKeys(apiKeys.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }

    const nextKeys =
      editingIndex === null
        ? [...apiKeys, trimmed]
        : apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key));
    updateApiKeys(nextKeys);
    closeModal();
  };

  const handleCopy = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  return (
    <div className={`form-group ${styles.compactFormGroup}`}>
      <div className={styles.apiKeysHeader}>
        <div className={styles.apiKeysMeta}>
          <label className={styles.apiKeysLabel}>
            <span>{t('config_management.visual.api_keys.label')}</span>
            <HintBadge text={t('config_management.visual.api_keys.hint')} />
          </label>
          <span className={styles.apiKeysCount}>{apiKeys.length}</span>
        </div>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          {t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className={styles.apiKeysEmpty}>
          {t('config_management.visual.api_keys.empty')}
        </div>
      ) : (
        <div className={styles.apiKeysList}>
          {apiKeys.map((key, index) => (
            <div key={`${key}-${index}`} className={styles.apiKeyRow}>
              <div className={styles.apiKeyLine}>
                <span className={styles.apiKeyIndex}>#{index + 1}</span>
                <div className={styles.apiKeyValue} title={maskApiKey(String(key || ''))}>
                  {maskApiKey(String(key || ''))}
                </div>
                <div className={styles.apiKeyActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.iconActionButton}
                    onClick={() => handleCopy(key)}
                    disabled={disabled}
                    title={t('common.copy')}
                    aria-label={t('common.copy')}
                  >
                    <IconCopy size={16} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.iconActionButton}
                    onClick={() => openEditModal(index)}
                    disabled={disabled}
                    title={t('config_management.visual.common.edit')}
                    aria-label={t('config_management.visual.common.edit')}
                  >
                    <IconPencil size={16} />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className={styles.iconActionButton}
                    onClick={() => handleDelete(index)}
                    disabled={disabled}
                    title={t('config_management.visual.common.delete')}
                    aria-label={t('config_management.visual.common.delete')}
                  >
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        className={styles.apiKeyModal}
        title={editingIndex !== null ? t('config_management.visual.api_keys.edit_title') : t('config_management.visual.api_keys.add_title')}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={disabled}>
              {editingIndex !== null ? t('config_management.visual.common.update') : t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <Input
          label={t('config_management.visual.api_keys.input_label')}
          placeholder={t('config_management.visual.api_keys.input_placeholder')}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={disabled}
          error={formError || undefined}
          hint={t('config_management.visual.api_keys.input_hint')}
          className={styles.apiKeyInput}
          rightElement={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={disabled}
            >
              {t('config_management.visual.api_keys.generate')}
            </Button>
          }
        />
      </Modal>
    </div>
  );
}

function PayloadRulesEditor({
  value,
  disabled,
  protocolFirst = false,
  onChange,
}: {
  value: PayloadRule[];
  disabled?: boolean;
  protocolFirst?: boolean;
  onChange: (next: PayloadRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value.length ? value : [];
  const protocolOptions = useMemo(
    () =>
      VISUAL_CONFIG_PROTOCOL_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.defaultLabel }),
      })),
    [t]
  );
  const payloadValueTypeOptions = useMemo(
    () =>
      VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.defaultLabel }),
      })),
    [t]
  );

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  const addParam = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextParam: PayloadParamEntry = {
      id: makeClientId(),
      path: '',
      valueType: 'string',
      value: '',
    };
    updateRule(ruleIndex, { params: [...rule.params, nextParam] });
  };

  const removeParam = (ruleIndex: number, paramIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: rule.params.filter((_, i) => i !== paramIndex) });
  };

  const updateParam = (ruleIndex: number, paramIndex: number, patch: Partial<PayloadParamEntry>) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      params: rule.params.map((p, i) => (i === paramIndex ? { ...p, ...patch } : p)),
    });
  };

  const getValuePlaceholder = (valueType: PayloadParamValueType) => {
    switch (valueType) {
      case 'string':
        return t('config_management.visual.payload_rules.value_string');
      case 'number':
        return t('config_management.visual.payload_rules.value_number');
      case 'boolean':
        return t('config_management.visual.payload_rules.value_boolean');
      case 'json':
        return t('config_management.visual.payload_rules.value_json');
      default:
        return t('config_management.visual.payload_rules.value_default');
    }
  };

  return (
    <div className={styles.ruleEditor}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleHeader}>
            <div className={styles.ruleHeaderMain}>
              <div className={styles.ruleTitle}>
                {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              className={styles.iconActionButton}
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
              title={t('config_management.visual.common.delete')}
              aria-label={t('config_management.visual.common.delete')}
            >
              <IconTrash2 size={16} />
            </Button>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.payload_rules.models')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.models.length}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addModel(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_model')}
              </Button>
            </div>
            <div className={styles.ruleGroupBody}>
              {rule.models.length > 0 && (
                <div
                  className={[
                    styles.groupRowHeader,
                    protocolFirst ? styles.groupRowHeaderModelProtocolFirst : styles.groupRowHeaderModel,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {protocolFirst ? (
                    <>
                      <span>{t('config_management.visual.payload_rules.provider_type')}</span>
                      <span>{t('config_management.visual.payload_rules.model_name')}</span>
                    </>
                  ) : (
                    <>
                      <span>{t('config_management.visual.payload_rules.model_name')}</span>
                      <span>{t('config_management.visual.payload_rules.provider_type')}</span>
                    </>
                  )}
                  <span className={styles.groupRowHeaderAction} />
                </div>
              )}
              {(rule.models.length ? rule.models : []).map((model, modelIndex) => (
                <div
                  key={model.id}
                  className={[
                    styles.payloadRuleModelRow,
                    protocolFirst ? styles.payloadRuleModelRowProtocolFirst : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {protocolFirst ? (
                    <>
                      <Select
                        value={model.protocol ?? ''}
                        options={protocolOptions}
                        disabled={disabled}
                        ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                        onChange={(nextValue) =>
                          updateModel(ruleIndex, modelIndex, {
                            protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                          })
                        }
                      />
                      <input
                        className="input"
                        placeholder={t('config_management.visual.payload_rules.model_name')}
                        value={model.name}
                        onChange={(e) => updateModel(ruleIndex, modelIndex, { name: e.target.value })}
                        disabled={disabled}
                      />
                    </>
                  ) : (
                    <>
                      <input
                        className="input"
                        placeholder={t('config_management.visual.payload_rules.model_name')}
                        value={model.name}
                        onChange={(e) => updateModel(ruleIndex, modelIndex, { name: e.target.value })}
                        disabled={disabled}
                      />
                      <Select
                        value={model.protocol ?? ''}
                        options={protocolOptions}
                        disabled={disabled}
                        ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                        onChange={(nextValue) =>
                          updateModel(ruleIndex, modelIndex, {
                            protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                          })
                        }
                      />
                    </>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    className={styles.payloadRowActionButton}
                    onClick={() => removeModel(ruleIndex, modelIndex)}
                    disabled={disabled}
                    title={t('config_management.visual.common.delete')}
                    aria-label={t('config_management.visual.common.delete')}
                  >
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              ))}
              {rule.models.length === 0 && (
                <div className={styles.groupEmpty}>
                  {t('config_management.visual.payload_rules.no_rules')}
                </div>
              )}
            </div>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.payload_rules.params')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.params.length}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addParam(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_param')}
              </Button>
            </div>
            <div className={styles.ruleGroupBody}>
              {rule.params.length > 0 && (
                <div className={`${styles.groupRowHeader} ${styles.groupRowHeaderParam}`}>
                  <span>{t('config_management.visual.payload_rules.json_path')}</span>
                  <span>{t('config_management.visual.payload_rules.param_type')}</span>
                  <span>{t('config_management.visual.payload_rules.value_default')}</span>
                  <span className={styles.groupRowHeaderAction} />
                </div>
              )}
              {(rule.params.length ? rule.params : []).map((param, paramIndex) => (
                <div key={param.id} className={styles.payloadRuleParamRow}>
                  <input
                    className="input"
                    placeholder={t('config_management.visual.payload_rules.json_path')}
                    value={param.path}
                    onChange={(e) => updateParam(ruleIndex, paramIndex, { path: e.target.value })}
                    disabled={disabled}
                  />
                  <Select
                    value={param.valueType}
                    options={payloadValueTypeOptions}
                    disabled={disabled}
                    ariaLabel={t('config_management.visual.payload_rules.param_type')}
                    onChange={(nextValue) =>
                      updateParam(ruleIndex, paramIndex, {
                        valueType: nextValue as PayloadParamValueType,
                      })
                    }
                  />
                  <input
                    className="input"
                    placeholder={getValuePlaceholder(param.valueType)}
                    value={param.value}
                    onChange={(e) => updateParam(ruleIndex, paramIndex, { value: e.target.value })}
                    disabled={disabled}
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    className={styles.payloadRowActionButton}
                    onClick={() => removeParam(ruleIndex, paramIndex)}
                    disabled={disabled}
                    title={t('config_management.visual.common.delete')}
                    aria-label={t('config_management.visual.common.delete')}
                  >
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              ))}
              {rule.params.length === 0 && (
                <div className={styles.groupEmpty}>
                  {t('config_management.visual.payload_rules.no_rules')}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.ruleEmpty}>
          {t('config_management.visual.payload_rules.no_rules')}
        </div>
      )}

      <div className={styles.actionsEnd}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
}

function PayloadFilterRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: PayloadFilterRule[];
  disabled?: boolean;
  onChange: (next: PayloadFilterRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value.length ? value : [];
  const protocolOptions = useMemo(
    () =>
      VISUAL_CONFIG_PROTOCOL_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.defaultLabel }),
      })),
    [t]
  );

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadFilterRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  const addParam = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: [...rule.params, ''] });
  };

  const removeParam = (ruleIndex: number, paramIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: rule.params.filter((_, i) => i !== paramIndex) });
  };

  const updateParam = (ruleIndex: number, paramIndex: number, nextValue: string) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      params: rule.params.map((item, i) => (i === paramIndex ? nextValue : item)),
    });
  };

  return (
    <div className={styles.ruleEditor}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleHeader}>
            <div className={styles.ruleHeaderMain}>
              <div className={styles.ruleTitle}>
                {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              className={styles.iconActionButton}
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
              title={t('config_management.visual.common.delete')}
              aria-label={t('config_management.visual.common.delete')}
            >
              <IconTrash2 size={16} />
            </Button>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.payload_rules.models')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.models.length}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => addModel(ruleIndex)} disabled={disabled}>
                {t('config_management.visual.payload_rules.add_model')}
              </Button>
            </div>
            <div className={styles.ruleGroupBody}>
              {rule.models.length > 0 && (
                <div className={`${styles.groupRowHeader} ${styles.groupRowHeaderFilterModel}`}>
                  <span>{t('config_management.visual.payload_rules.model_name')}</span>
                  <span>{t('config_management.visual.payload_rules.provider_type')}</span>
                  <span className={styles.groupRowHeaderAction} />
                </div>
              )}
              {rule.models.map((model, modelIndex) => (
                <div key={model.id} className={styles.payloadFilterModelRow}>
                  <input
                    className="input"
                    placeholder={t('config_management.visual.payload_rules.model_name')}
                    value={model.name}
                    onChange={(e) => updateModel(ruleIndex, modelIndex, { name: e.target.value })}
                    disabled={disabled}
                  />
                  <Select
                    value={model.protocol ?? ''}
                    options={protocolOptions}
                    disabled={disabled}
                    ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                    onChange={(nextValue) =>
                      updateModel(ruleIndex, modelIndex, {
                        protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                      })
                    }
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    className={styles.payloadRowActionButton}
                    onClick={() => removeModel(ruleIndex, modelIndex)}
                    disabled={disabled}
                    title={t('config_management.visual.common.delete')}
                    aria-label={t('config_management.visual.common.delete')}
                  >
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              ))}
              {rule.models.length === 0 && (
                <div className={styles.groupEmpty}>
                  {t('config_management.visual.payload_rules.no_rules')}
                </div>
              )}
            </div>
          </div>

          <div className={styles.ruleGroup}>
            <div className={styles.ruleGroupHeader}>
              <div className={styles.ruleGroupTitle}>
                <span className={styles.ruleGroupLabel}>
                  {t('config_management.visual.payload_rules.remove_params')}
                </span>
                <span className={styles.ruleGroupCount}>{rule.params.length}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => addParam(ruleIndex)} disabled={disabled}>
                {t('config_management.visual.payload_rules.add_param')}
              </Button>
            </div>
            <div className={styles.ruleGroupBody}>
              {rule.params.length > 0 && (
                <div className={`${styles.groupRowHeader} ${styles.groupRowHeaderString}`}>
                  <span>{t('config_management.visual.payload_rules.json_path_filter')}</span>
                  <span className={styles.groupRowHeaderAction} />
                </div>
              )}
              {rule.params.map((item, paramIndex) => (
                <div key={`${rule.id}-${paramIndex}`} className={styles.stringRow}>
                  <input
                    placeholder={t('config_management.visual.payload_rules.json_path_filter')}
                    value={item}
                    onChange={(e) => updateParam(ruleIndex, paramIndex, e.target.value)}
                    disabled={disabled}
                    className={`${styles.stringInput} input`}
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    className={styles.iconActionButton}
                    onClick={() => removeParam(ruleIndex, paramIndex)}
                    disabled={disabled}
                    title={t('config_management.visual.common.delete')}
                    aria-label={t('config_management.visual.common.delete')}
                  >
                    <IconTrash2 size={16} />
                  </Button>
                </div>
              ))}
              {rule.params.length === 0 && (
                <div className={styles.groupEmpty}>
                  {t('config_management.visual.payload_rules.no_rules')}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.ruleEmpty}>
          {t('config_management.visual.payload_rules.no_rules')}
        </div>
      )}

      <div className={styles.actionsEnd}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
}

export function VisualConfigEditor({ values, disabled = false, onChange }: VisualConfigEditorProps) {
  const { t } = useTranslation();
  const isKeepaliveDisabled = values.streaming.keepaliveSeconds === '' || values.streaming.keepaliveSeconds === '0';
  const isNonstreamKeepaliveDisabled =
    values.streaming.nonstreamKeepaliveInterval === '' || values.streaming.nonstreamKeepaliveInterval === '0';
  const [expandedPayloadSections, setExpandedPayloadSections] = useState<Record<PayloadBlockKey, boolean>>({
    defaultRules: true,
    overrideRules: false,
    filterRules: false,
  });
  const payloadDefaultSummary = useMemo(
    () => summarizePayloadRules(values.payloadDefaultRules),
    [values.payloadDefaultRules]
  );
  const payloadOverrideSummary = useMemo(
    () => summarizePayloadRules(values.payloadOverrideRules),
    [values.payloadOverrideRules]
  );
  const payloadFilterSummary = useMemo(
    () => summarizePayloadRules(values.payloadFilterRules),
    [values.payloadFilterRules]
  );

  const togglePayloadSection = (section: PayloadBlockKey) => {
    setExpandedPayloadSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div className={styles.editorRoot}>
      <ConfigSection title={t('config_management.visual.sections.server.title')} description={t('config_management.visual.sections.server.description')}>
          <SectionGrid>
            <Input
              label={t('config_management.visual.sections.server.host')}
              placeholder="0.0.0.0"
              value={values.host}
              onChange={(e) => onChange({ host: e.target.value })}
              disabled={disabled}
            />
            <Input
              label={t('config_management.visual.sections.server.port')}
              type="number"
              placeholder="8317"
              value={values.port}
              onChange={(e) => onChange({ port: e.target.value })}
              disabled={disabled}
            />
          </SectionGrid>
      </ConfigSection>

      <ConfigSection title={t('config_management.visual.sections.tls.title')} description={t('config_management.visual.sections.tls.description')}>
          <div className={styles.sectionStack}>
            <ToggleRow
              title={t('config_management.visual.sections.tls.enable')}
              description={t('config_management.visual.sections.tls.enable_desc')}
              checked={values.tlsEnable}
              disabled={disabled}
              onChange={(tlsEnable) => onChange({ tlsEnable })}
            />
            {values.tlsEnable && (
              <>
                <Divider />
                <SectionGrid>
                  <Input
                    label={t('config_management.visual.sections.tls.cert')}
                    placeholder="/path/to/cert.pem"
                    value={values.tlsCert}
                    onChange={(e) => onChange({ tlsCert: e.target.value })}
                    disabled={disabled}
                  />
                  <Input
                    label={t('config_management.visual.sections.tls.key')}
                    placeholder="/path/to/key.pem"
                    value={values.tlsKey}
                    onChange={(e) => onChange({ tlsKey: e.target.value })}
                    disabled={disabled}
                  />
                </SectionGrid>
                </>
              )}
          </div>
      </ConfigSection>

      <ConfigSection title={t('config_management.visual.sections.remote.title')} description={t('config_management.visual.sections.remote.description')}>
          <div className={styles.sectionStack}>
            <div className={styles.toggleGrid}>
              <ToggleRow
                title={t('config_management.visual.sections.remote.allow_remote')}
                description={t('config_management.visual.sections.remote.allow_remote_desc')}
                checked={values.rmAllowRemote}
                disabled={disabled}
                onChange={(rmAllowRemote) => onChange({ rmAllowRemote })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.remote.disable_panel')}
                description={t('config_management.visual.sections.remote.disable_panel_desc')}
                checked={values.rmDisableControlPanel}
                disabled={disabled}
                onChange={(rmDisableControlPanel) => onChange({ rmDisableControlPanel })}
              />
            </div>
            <SectionGrid>
              <Input
                label={t('config_management.visual.sections.remote.secret_key')}
                type="password"
                placeholder={t('config_management.visual.sections.remote.secret_key_placeholder')}
                value={values.rmSecretKey}
                onChange={(e) => onChange({ rmSecretKey: e.target.value })}
                disabled={disabled}
              />
              <Input
                label={t('config_management.visual.sections.remote.panel_repo')}
                placeholder="https://github.com/router-for-me/Cli-Proxy-API-Management-Center"
                value={values.rmPanelRepo}
                onChange={(e) => onChange({ rmPanelRepo: e.target.value })}
                disabled={disabled}
              />
            </SectionGrid>
          </div>
      </ConfigSection>

      <ConfigSection title={t('config_management.visual.sections.auth.title')} description={t('config_management.visual.sections.auth.description')}>
          <div className={styles.sectionStack}>
            <Input
              label={
                <LabelWithHint
                  label={t('config_management.visual.sections.auth.auth_dir')}
                  hint={t('config_management.visual.sections.auth.auth_dir_hint')}
                />
              }
              placeholder="~/.cli-proxy-api"
              value={values.authDir}
              onChange={(e) => onChange({ authDir: e.target.value })}
              disabled={disabled}
            />
            <ApiKeysCardEditor
              value={values.apiKeysText}
              disabled={disabled}
              onChange={(apiKeysText) => onChange({ apiKeysText })}
            />
          </div>
      </ConfigSection>

      <ConfigSection title={t('config_management.visual.sections.system.title')} description={t('config_management.visual.sections.system.description')}>
          <div className={styles.sectionStack}>
            <div className={styles.toggleGrid}>
              <ToggleRow
                title={t('config_management.visual.sections.system.debug')}
                description={t('config_management.visual.sections.system.debug_desc')}
                checked={values.debug}
                disabled={disabled}
                onChange={(debug) => onChange({ debug })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.system.commercial_mode')}
                description={t('config_management.visual.sections.system.commercial_mode_desc')}
                checked={values.commercialMode}
                disabled={disabled}
                onChange={(commercialMode) => onChange({ commercialMode })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.system.logging_to_file')}
                description={t('config_management.visual.sections.system.logging_to_file_desc')}
                checked={values.loggingToFile}
                disabled={disabled}
                onChange={(loggingToFile) => onChange({ loggingToFile })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.system.usage_statistics')}
                description={t('config_management.visual.sections.system.usage_statistics_desc')}
                checked={values.usageStatisticsEnabled}
                disabled={disabled}
                onChange={(usageStatisticsEnabled) => onChange({ usageStatisticsEnabled })}
              />
            </div>

            <div className={styles.inputsGrid}>
              <Input
                label={t('config_management.visual.sections.system.logs_max_size')}
                type="number"
                placeholder="0"
                value={values.logsMaxTotalSizeMb}
                onChange={(e) => onChange({ logsMaxTotalSizeMb: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>
      </ConfigSection>

      <ConfigSection title={t('config_management.visual.sections.network.title')} description={t('config_management.visual.sections.network.description')}>
          <div className={styles.sectionStack}>
            <div className={styles.toggleGrid}>
              <ToggleRow
                title={t('config_management.visual.sections.network.force_model_prefix')}
                description={t('config_management.visual.sections.network.force_model_prefix_desc')}
                checked={values.forceModelPrefix}
                disabled={disabled}
                onChange={(forceModelPrefix) => onChange({ forceModelPrefix })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.network.ws_auth')}
                description={t('config_management.visual.sections.network.ws_auth_desc')}
                checked={values.wsAuth}
                disabled={disabled}
                onChange={(wsAuth) => onChange({ wsAuth })}
              />
            </div>

            <div className={styles.inputsGrid}>
              <Input
                label={t('config_management.visual.sections.network.proxy_url')}
                placeholder="socks5://user:pass@127.0.0.1:1080/"
                value={values.proxyUrl}
                onChange={(e) => onChange({ proxyUrl: e.target.value })}
                disabled={disabled}
              />
              <Input
                label={t('config_management.visual.sections.network.request_retry')}
                type="number"
                placeholder="3"
                value={values.requestRetry}
                onChange={(e) => onChange({ requestRetry: e.target.value })}
                disabled={disabled}
              />
              <Input
                label={t('config_management.visual.sections.network.max_retry_interval')}
                type="number"
                placeholder="30"
                value={values.maxRetryInterval}
                onChange={(e) => onChange({ maxRetryInterval: e.target.value })}
                disabled={disabled}
              />
              <div className="form-group">
                <label>
                  <LabelWithHint
                    label={t('config_management.visual.sections.network.routing_strategy')}
                    hint={t('config_management.visual.sections.network.routing_strategy_hint')}
                  />
                </label>
                <Select
                  value={values.routingStrategy}
                  options={[
                    { value: 'round-robin', label: t('config_management.visual.sections.network.strategy_round_robin') },
                    { value: 'fill-first', label: t('config_management.visual.sections.network.strategy_fill_first') },
                  ]}
                  disabled={disabled}
                  ariaLabel={t('config_management.visual.sections.network.routing_strategy')}
                  onChange={(nextValue) =>
                    onChange({ routingStrategy: nextValue as VisualConfigValues['routingStrategy'] })
                  }
                />
              </div>
            </div>
          </div>
      </ConfigSection>

      <ConfigSection title={t('config_management.visual.sections.quota.title')} description={t('config_management.visual.sections.quota.description')}>
          <div className={styles.sectionStack}>
            <div className={styles.toggleGrid}>
              <ToggleRow
                title={t('config_management.visual.sections.quota.switch_project')}
                description={t('config_management.visual.sections.quota.switch_project_desc')}
                checked={values.quotaSwitchProject}
                disabled={disabled}
                onChange={(quotaSwitchProject) => onChange({ quotaSwitchProject })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.quota.switch_preview_model')}
                description={t('config_management.visual.sections.quota.switch_preview_model_desc')}
                checked={values.quotaSwitchPreviewModel}
                disabled={disabled}
                onChange={(quotaSwitchPreviewModel) => onChange({ quotaSwitchPreviewModel })}
              />
            </div>
          </div>
      </ConfigSection>

      <ConfigSection title={t('config_management.visual.sections.streaming.title')} description={t('config_management.visual.sections.streaming.description')}>
          <div className={styles.sectionStack}>
            <SectionGrid>
              <div className="form-group">
                <label>
                  <LabelWithHint
                    label={t('config_management.visual.sections.streaming.keepalive_seconds')}
                    hint={t('config_management.visual.sections.streaming.keepalive_hint')}
                  />
                </label>
                <div className={styles.relativeField}>
                  <input
                    className="input"
                    type="number"
                    placeholder="0"
                    value={values.streaming.keepaliveSeconds}
                    onChange={(e) =>
                      onChange({ streaming: { ...values.streaming, keepaliveSeconds: e.target.value } })
                    }
                    disabled={disabled}
                  />
                  {isKeepaliveDisabled && (
                    <span className={styles.inputStatusBadge}>
                      {t('config_management.visual.sections.streaming.disabled')}
                    </span>
                  )}
                </div>
              </div>
              <Input
                label={
                  <LabelWithHint
                    label={t('config_management.visual.sections.streaming.bootstrap_retries')}
                    hint={t('config_management.visual.sections.streaming.bootstrap_hint')}
                  />
                }
                type="number"
                placeholder="1"
                value={values.streaming.bootstrapRetries}
                onChange={(e) => onChange({ streaming: { ...values.streaming, bootstrapRetries: e.target.value } })}
                disabled={disabled}
              />
            </SectionGrid>

            <SectionGrid>
              <div className="form-group">
                <label>
                  <LabelWithHint
                    label={t('config_management.visual.sections.streaming.nonstream_keepalive')}
                    hint={t('config_management.visual.sections.streaming.nonstream_keepalive_hint')}
                  />
                </label>
                <div className={styles.relativeField}>
                  <input
                    className="input"
                    type="number"
                    placeholder="0"
                    value={values.streaming.nonstreamKeepaliveInterval}
                    onChange={(e) =>
                      onChange({
                        streaming: { ...values.streaming, nonstreamKeepaliveInterval: e.target.value },
                      })
                    }
                    disabled={disabled}
                  />
                  {isNonstreamKeepaliveDisabled && (
                    <span className={styles.inputStatusBadge}>
                      {t('config_management.visual.sections.streaming.disabled')}
                    </span>
                  )}
                </div>
              </div>
            </SectionGrid>
          </div>
      </ConfigSection>

      <ConfigSection title={t('config_management.visual.sections.payload.title')} description={t('config_management.visual.sections.payload.description')}>
        <div className={styles.sectionStack}>
          <PayloadSectionBlock
            title={t('config_management.visual.sections.payload.default_rules')}
            description={t('config_management.visual.sections.payload.default_rules_desc')}
            summary={payloadDefaultSummary}
            expanded={expandedPayloadSections.defaultRules}
            onToggle={() => togglePayloadSection('defaultRules')}
          >
            <PayloadRulesEditor
              value={values.payloadDefaultRules}
              disabled={disabled}
              onChange={(payloadDefaultRules) => onChange({ payloadDefaultRules })}
            />
          </PayloadSectionBlock>

          <PayloadSectionBlock
            title={t('config_management.visual.sections.payload.override_rules')}
            description={t('config_management.visual.sections.payload.override_rules_desc')}
            summary={payloadOverrideSummary}
            expanded={expandedPayloadSections.overrideRules}
            onToggle={() => togglePayloadSection('overrideRules')}
          >
            <PayloadRulesEditor
              value={values.payloadOverrideRules}
              disabled={disabled}
              protocolFirst
              onChange={(payloadOverrideRules) => onChange({ payloadOverrideRules })}
            />
          </PayloadSectionBlock>

          <PayloadSectionBlock
            title={t('config_management.visual.sections.payload.filter_rules')}
            description={t('config_management.visual.sections.payload.filter_rules_desc')}
            summary={payloadFilterSummary}
            expanded={expandedPayloadSections.filterRules}
            onToggle={() => togglePayloadSection('filterRules')}
          >
            <PayloadFilterRulesEditor
              value={values.payloadFilterRules}
              disabled={disabled}
              onChange={(payloadFilterRules) => onChange({ payloadFilterRules })}
            />
          </PayloadSectionBlock>
        </div>
      </ConfigSection>
    </div>
  );
}
