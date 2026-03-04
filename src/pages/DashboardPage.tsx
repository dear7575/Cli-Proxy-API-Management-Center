import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import {
  IconKey,
  IconBot,
  IconFileText,
  IconSatellite,
  IconShield
} from '@/components/ui/icons';
import { useAuthStore, useConfigStore, useModelsStore, useUsageStatsStore, USAGE_STATS_STALE_TIME_MS } from '@/stores';
import { apiKeysApi, providersApi, authFilesApi } from '@/services/api';
import {
  calculateRecentPerMinuteRates,
  formatCompactNumber,
  formatPerMinuteValue,
  getModelNamesFromUsage
} from '@/utils/usage';
import styles from './DashboardPage.module.scss';

interface QuickStat {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  path: string;
  loading?: boolean;
  sublabel?: string;
}

interface ProviderStats {
  gemini: number | null;
  codex: number | null;
  claude: number | null;
  openai: number | null;
}

interface UsageOverviewStat {
  label: string;
  value: string;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);
  const apiBase = useAuthStore((state) => state.apiBase);
  const config = useConfigStore((state) => state.config);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);
  const usageSnapshot = useUsageStatsStore((state) => state.usage);
  const usageLoading = useUsageStatsStore((state) => state.loading);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const [stats, setStats] = useState<{
    apiKeys: number | null;
    authFiles: number | null;
  }>({
    apiKeys: null,
    authFiles: null
  });

  const [providerStats, setProviderStats] = useState<ProviderStats>({
    gemini: null,
    codex: null,
    claude: null,
    openai: null
  });

  const [loading, setLoading] = useState(true);

  const apiKeysCache = useRef<string[]>([]);

  useEffect(() => {
    apiKeysCache.current = [];
  }, [apiBase, config?.apiKeys]);

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch {
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = useCallback(async () => {
    if (connectionStatus !== 'connected' || !apiBase) {
      return;
    }

    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      await fetchModelsFromStore(apiBase, primaryKey);
    } catch {
      // Ignore model fetch errors on dashboard
    }
  }, [connectionStatus, apiBase, resolveApiKeysForModels, fetchModelsFromStore]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [keysRes, filesRes, geminiRes, codexRes, claudeRes, openaiRes] = await Promise.allSettled([
          apiKeysApi.list(),
          authFilesApi.list(),
          providersApi.getGeminiKeys(),
          providersApi.getCodexConfigs(),
          providersApi.getClaudeConfigs(),
          providersApi.getOpenAIProviders()
        ]);

        setStats({
          apiKeys: keysRes.status === 'fulfilled' ? keysRes.value.length : null,
          authFiles: filesRes.status === 'fulfilled' ? filesRes.value.files.length : null
        });

        setProviderStats({
          gemini: geminiRes.status === 'fulfilled' ? geminiRes.value.length : null,
          codex: codexRes.status === 'fulfilled' ? codexRes.value.length : null,
          claude: claudeRes.status === 'fulfilled' ? claudeRes.value.length : null,
          openai: openaiRes.status === 'fulfilled' ? openaiRes.value.length : null
        });
      } finally {
        setLoading(false);
      }
    };

    if (connectionStatus === 'connected') {
      fetchStats();
      fetchModels();
      void loadUsageStats({ staleTimeMs: USAGE_STATS_STALE_TIME_MS }).catch(() => {});
    } else {
      setLoading(false);
    }
  }, [connectionStatus, fetchModels, loadUsageStats]);

  // Calculate total provider keys only when all provider stats are available.
  const providerStatsReady =
    providerStats.gemini !== null &&
    providerStats.codex !== null &&
    providerStats.claude !== null &&
    providerStats.openai !== null;
  const hasProviderStats =
    providerStats.gemini !== null ||
    providerStats.codex !== null ||
    providerStats.claude !== null ||
    providerStats.openai !== null;
  const totalProviderKeys = providerStatsReady
    ? (providerStats.gemini ?? 0) +
      (providerStats.codex ?? 0) +
      (providerStats.claude ?? 0) +
      (providerStats.openai ?? 0)
    : 0;

  const quickStats: QuickStat[] = [
    {
      label: t('dashboard.management_keys'),
      value: stats.apiKeys ?? '-',
      icon: <IconKey size={24} />,
      path: '/config',
      loading: loading && stats.apiKeys === null,
      sublabel: t('nav.config_management')
    },
    {
      label: t('nav.ai_providers'),
      value: loading ? '-' : providerStatsReady ? totalProviderKeys : '-',
      icon: <IconBot size={24} />,
      path: '/ai-providers',
      loading: loading,
      sublabel: hasProviderStats
        ? t('dashboard.provider_keys_detail', {
            gemini: providerStats.gemini ?? '-',
            codex: providerStats.codex ?? '-',
            claude: providerStats.claude ?? '-',
            openai: providerStats.openai ?? '-'
          })
        : undefined
    },
    {
      label: t('nav.auth_files'),
      value: stats.authFiles ?? '-',
      icon: <IconFileText size={24} />,
      path: '/auth-files',
      loading: loading && stats.authFiles === null,
      sublabel: t('dashboard.oauth_credentials')
    },
    {
      label: t('dashboard.available_models'),
      value: modelsLoading ? '-' : models.length,
      icon: <IconSatellite size={24} />,
      path: '/system',
      loading: modelsLoading,
      sublabel: t('dashboard.available_models_desc')
    }
  ];

  const routingStrategyRaw = config?.routingStrategy?.trim() || '';
  const routingStrategyDisplay = !routingStrategyRaw
    ? '-'
    : routingStrategyRaw === 'round-robin'
      ? t('basic_settings.routing_strategy_round_robin')
      : routingStrategyRaw === 'fill-first'
        ? t('basic_settings.routing_strategy_fill_first')
        : routingStrategyRaw;
  const routingStrategyBadgeClass = !routingStrategyRaw
    ? styles.configBadgeUnknown
    : routingStrategyRaw === 'round-robin'
      ? styles.configBadgeRoundRobin
      : routingStrategyRaw === 'fill-first'
        ? styles.configBadgeFillFirst
        : styles.configBadgeUnknown;

  const usageTotalRequests = useMemo(
    () => toNumber((usageSnapshot as Record<string, unknown> | null)?.total_requests),
    [usageSnapshot]
  );
  const usageTotalTokens = useMemo(
    () => toNumber((usageSnapshot as Record<string, unknown> | null)?.total_tokens),
    [usageSnapshot]
  );
  const usageRateStats = useMemo(
    () => calculateRecentPerMinuteRates(30, usageSnapshot),
    [usageSnapshot]
  );
  const usageModelsUsed = useMemo(
    () => getModelNamesFromUsage(usageSnapshot).length,
    [usageSnapshot]
  );
  const usageOverviewStats = useMemo<UsageOverviewStat[]>(
    () => [
      {
        label: t('dashboard.total_requests'),
        value: usageTotalRequests.toLocaleString()
      },
      {
        label: t('dashboard.total_tokens'),
        value: formatCompactNumber(usageTotalTokens)
      },
      {
        label: t('dashboard.rpm_30min'),
        value: formatPerMinuteValue(usageRateStats.rpm)
      },
      {
        label: t('dashboard.tpm_30min'),
        value: formatPerMinuteValue(usageRateStats.tpm)
      },
      {
        label: t('dashboard.models_used'),
        value: usageModelsUsed.toLocaleString()
      }
    ],
    [t, usageModelsUsed, usageRateStats.rpm, usageRateStats.tpm, usageTotalRequests, usageTotalTokens]
  );
  const hasUsageData =
    usageTotalRequests > 0 ||
    usageTotalTokens > 0 ||
    usageModelsUsed > 0 ||
    usageRateStats.requestCount > 0;
  const connectionLabel = t(
    connectionStatus === 'connected'
      ? 'common.connected'
      : connectionStatus === 'connecting'
        ? 'common.connecting'
        : 'common.disconnected'
  );
  const connectionValueClass =
    connectionStatus === 'connected'
      ? styles.connectionValueConnected
      : connectionStatus === 'connecting'
        ? styles.connectionValueConnecting
        : styles.connectionValueDisconnected;
  const connectionMetaParts = [
    apiBase || '-',
    serverVersion ? `v${serverVersion.trim().replace(/^[vV]+/, '')}` : ''
  ].filter(Boolean);
  const connectionMeta = connectionMetaParts.join(' · ');

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('dashboard.title')}</h1>
        <p className={styles.subtitle}>{t('dashboard.subtitle')}</p>
      </div>

      <Card title={t('dashboard.quick_actions')} className={styles.sectionCard}>
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.connectionStatCard}`}>
            <div className={`${styles.statIcon} ${styles.connectionStatIcon}`}>
              <IconShield size={24} />
            </div>
            <div className={styles.statContent}>
              <span className={`${styles.statValue} ${connectionValueClass}`}>{connectionLabel}</span>
              <span className={styles.statLabel}>{t('connection.status')}</span>
              <span className={`${styles.statSublabel} ${styles.connectionStatMeta}`} title={connectionMeta}>
                {connectionMeta}
              </span>
              {serverBuildDate && (
                <span className={styles.statSublabel}>
                  {new Date(serverBuildDate).toLocaleDateString(i18n.language)}
                </span>
              )}
            </div>
          </div>
          {quickStats.map((stat) => (
            <Link key={stat.path} to={stat.path} className={styles.statCard}>
              <div className={styles.statIcon}>{stat.icon}</div>
              <div className={styles.statContent}>
                <span className={styles.statValue}>{stat.loading ? '...' : stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
                {stat.sublabel && !stat.loading && (
                  <span className={styles.statSublabel}>{stat.sublabel}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <Card
        title={t('dashboard.usage_overview')}
        extra={
          <Link to="/usage" className={styles.viewMoreLink}>
            {t('dashboard.view_detailed_usage')} →
          </Link>
        }
        className={styles.sectionCard}
      >
        {usageLoading ? (
          <div className={styles.usageLoading}>{t('common.loading')}</div>
        ) : !usageSnapshot || !hasUsageData ? (
          <div className={styles.usageEmpty}>{t('dashboard.no_usage_data')}</div>
        ) : (
          <div className={styles.usageGrid}>
            {usageOverviewStats.map((item) => (
              <div key={item.label} className={styles.usageCard}>
                <span className={styles.usageValue}>{item.value}</span>
                <span className={styles.usageLabel}>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {config && (
        <Card
          title={t('dashboard.current_config')}
          extra={
            <Link to="/config" className={styles.viewMoreLink}>
              {t('dashboard.edit_settings')} →
            </Link>
          }
          className={styles.sectionCard}
        >
          <div className={styles.configGrid}>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.debug_enable')}</span>
              <span className={`${styles.configValue} ${config.debug ? styles.enabled : styles.disabled}`}>
                {config.debug ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.usage_statistics_enable')}</span>
              <span className={`${styles.configValue} ${config.usageStatisticsEnabled ? styles.enabled : styles.disabled}`}>
                {config.usageStatisticsEnabled ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.logging_to_file_enable')}</span>
              <span className={`${styles.configValue} ${config.loggingToFile ? styles.enabled : styles.disabled}`}>
                {config.loggingToFile ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.retry_count_label')}</span>
              <span className={styles.configValue}>{config.requestRetry ?? 0}</span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('basic_settings.ws_auth_enable')}</span>
              <span className={`${styles.configValue} ${config.wsAuth ? styles.enabled : styles.disabled}`}>
                {config.wsAuth ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configItem}>
              <span className={styles.configLabel}>{t('dashboard.routing_strategy')}</span>
              <span className={`${styles.configBadge} ${routingStrategyBadgeClass}`}>
                {routingStrategyDisplay}
              </span>
            </div>
            {config.proxyUrl && (
              <div className={`${styles.configItem} ${styles.configItemFull}`}>
                <span className={styles.configLabel}>{t('basic_settings.proxy_url_label')}</span>
                <span className={styles.configValueMono}>{config.proxyUrl}</span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
