import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconChevronDown, IconChevronUp, IconInfo } from '@/components/ui/icons';
import { ConfigSection } from '@/components/config/ConfigSection';
import styles from './VisualConfigEditor.module.scss';
import type {
  PayloadFilterRule,
  PayloadParamValidationErrorCode,
  PayloadRule,
  VisualConfigValidationErrorCode,
  VisualConfigValidationErrors,
  VisualConfigValues,
} from '@/types/visualConfig';
import {
  ApiKeysCardEditor,
  PayloadFilterRulesEditor,
  PayloadRulesEditor,
} from './VisualConfigEditorBlocks';

interface VisualConfigEditorProps {
  values: VisualConfigValues;
  validationErrors?: VisualConfigValidationErrors;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
}

function getValidationMessage(
  t: ReturnType<typeof useTranslation>['t'],
  errorCode?: VisualConfigValidationErrorCode | PayloadParamValidationErrorCode
) {
  if (!errorCode) return undefined;
  return t(`config_management.visual.validation.${errorCode}`);
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

export function VisualConfigEditor({
  values,
  validationErrors,
  disabled = false,
  onChange,
}: VisualConfigEditorProps) {
  const { t } = useTranslation();
  const routingStrategyLabelId = useId();
  const routingStrategyHintId = `${routingStrategyLabelId}-hint`;
  const keepaliveInputId = useId();
  const keepaliveHintId = `${keepaliveInputId}-hint`;
  const keepaliveErrorId = `${keepaliveInputId}-error`;
  const nonstreamKeepaliveInputId = useId();
  const nonstreamKeepaliveHintId = `${nonstreamKeepaliveInputId}-hint`;
  const nonstreamKeepaliveErrorId = `${nonstreamKeepaliveInputId}-error`;
  const isKeepaliveDisabled = values.streaming.keepaliveSeconds === '' || values.streaming.keepaliveSeconds === '0';
  const isNonstreamKeepaliveDisabled =
    values.streaming.nonstreamKeepaliveInterval === '' || values.streaming.nonstreamKeepaliveInterval === '0';
  const portError = getValidationMessage(t, validationErrors?.port);
  const logsMaxSizeError = getValidationMessage(t, validationErrors?.logsMaxTotalSizeMb);
  const requestRetryError = getValidationMessage(t, validationErrors?.requestRetry);
  const maxRetryIntervalError = getValidationMessage(t, validationErrors?.maxRetryInterval);
  const keepaliveError = getValidationMessage(t, validationErrors?.['streaming.keepaliveSeconds']);
  const bootstrapRetriesError = getValidationMessage(t, validationErrors?.['streaming.bootstrapRetries']);
  const nonstreamKeepaliveError = getValidationMessage(
    t,
    validationErrors?.['streaming.nonstreamKeepaliveInterval']
  );

  const handleApiKeysTextChange = useCallback((apiKeysText: string) => onChange({ apiKeysText }), [onChange]);
  const handlePayloadDefaultRulesChange = useCallback(
    (payloadDefaultRules: PayloadRule[]) => onChange({ payloadDefaultRules }),
    [onChange]
  );
  const handlePayloadOverrideRulesChange = useCallback(
    (payloadOverrideRules: PayloadRule[]) => onChange({ payloadOverrideRules }),
    [onChange]
  );
  const handlePayloadFilterRulesChange = useCallback(
    (payloadFilterRules: PayloadFilterRule[]) => onChange({ payloadFilterRules }),
    [onChange]
  );
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
              error={portError}
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
              label={t('config_management.visual.sections.auth.auth_dir')}
              placeholder="~/.cli-proxy-api"
              value={values.authDir}
              onChange={(e) => onChange({ authDir: e.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.auth.auth_dir_hint')}
            />
            <ApiKeysCardEditor
              value={values.apiKeysText}
              disabled={disabled}
              onChange={handleApiKeysTextChange}
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
                error={logsMaxSizeError}
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
                error={requestRetryError}
              />
              <Input
                label={t('config_management.visual.sections.network.max_retry_interval')}
                type="number"
                placeholder="30"
                value={values.maxRetryInterval}
                onChange={(e) => onChange({ maxRetryInterval: e.target.value })}
                disabled={disabled}
                error={maxRetryIntervalError}
              />
              <div className="form-group">
                <label id={routingStrategyLabelId} htmlFor={`${routingStrategyLabelId}-select`}>
                  {t('config_management.visual.sections.network.routing_strategy')}
                </label>
                <Select
                  value={values.routingStrategy}
                  options={[
                    { value: 'round-robin', label: t('config_management.visual.sections.network.strategy_round_robin') },
                    { value: 'fill-first', label: t('config_management.visual.sections.network.strategy_fill_first') },
                  ]}
                  id={`${routingStrategyLabelId}-select`}
                  disabled={disabled}
                  ariaLabelledBy={routingStrategyLabelId}
                  ariaDescribedBy={routingStrategyHintId}
                  onChange={(nextValue) =>
                    onChange({ routingStrategy: nextValue as VisualConfigValues['routingStrategy'] })
                  }
                />
                <div id={routingStrategyHintId} className="hint">
                  {t('config_management.visual.sections.network.routing_strategy_hint')}
                </div>
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
                <label htmlFor={keepaliveInputId}>
                  {t('config_management.visual.sections.streaming.keepalive_seconds')}
                </label>
                <div className={styles.relativeField}>
                  <input
                    id={keepaliveInputId}
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
                {keepaliveError && (
                  <div id={keepaliveErrorId} className="error-box">
                    {keepaliveError}
                  </div>
                )}
                <div id={keepaliveHintId} className="hint">
                  {t('config_management.visual.sections.streaming.keepalive_hint')}
                </div>
              </div>
              <Input
                label={t('config_management.visual.sections.streaming.bootstrap_retries')}
                type="number"
                placeholder="1"
                value={values.streaming.bootstrapRetries}
                onChange={(e) => onChange({ streaming: { ...values.streaming, bootstrapRetries: e.target.value } })}
                disabled={disabled}
                hint={t('config_management.visual.sections.streaming.bootstrap_hint')}
                error={bootstrapRetriesError}
              />
            </SectionGrid>

            <SectionGrid>
              <div className="form-group">
                <label htmlFor={nonstreamKeepaliveInputId}>
                  {t('config_management.visual.sections.streaming.nonstream_keepalive')}
                </label>
                <div className={styles.relativeField}>
                  <input
                    id={nonstreamKeepaliveInputId}
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
                {nonstreamKeepaliveError && (
                  <div id={nonstreamKeepaliveErrorId} className="error-box">
                    {nonstreamKeepaliveError}
                  </div>
                )}
                <div id={nonstreamKeepaliveHintId} className="hint">
                  {t('config_management.visual.sections.streaming.nonstream_keepalive_hint')}
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
              onChange={handlePayloadDefaultRulesChange}
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
              onChange={handlePayloadOverrideRulesChange}
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
              onChange={handlePayloadFilterRulesChange}
            />
          </PayloadSectionBlock>
        </div>
      </ConfigSection>
    </div>
  );
}
