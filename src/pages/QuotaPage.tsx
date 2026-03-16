/**
 * Quota management page - coordinates the three quota sections.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore } from '@/stores';
import { authFilesApi, configFileApi } from '@/services/api';
import {
  QuotaSection,
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG
} from '@/components/quota';
import type { AuthFileItem } from '@/types';
import styles from './QuotaPage.module.scss';

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshAllHandlersRef = useRef(new Set<(files: AuthFileItem[]) => void | Promise<void>>());

  const disableControls = connectionStatus !== 'connected';

  const loadConfig = useCallback(async () => {
    try {
      await configFileApi.fetchConfigYaml();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError((prev) => prev || errorMessage);
    }
  }, [t]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    let nextFiles: AuthFileItem[] = [];
    try {
      const data = await authFilesApi.list();
      nextFiles = data?.files || [];
      setFiles(nextFiles);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
      nextFiles = [];
    } finally {
      setLoading(false);
    }
    return nextFiles;
  }, [t]);

  const registerRefreshAll = useCallback((handler: (files: AuthFileItem[]) => void | Promise<void>) => {
    refreshAllHandlersRef.current.add(handler);
    return () => {
      refreshAllHandlersRef.current.delete(handler);
    };
  }, []);

  const runRefreshAll = useCallback(async (latestFiles: AuthFileItem[]) => {
    const handlers = Array.from(refreshAllHandlersRef.current);
    if (handlers.length === 0) return;
    await Promise.allSettled(handlers.map((handler) => Promise.resolve(handler(latestFiles))));
  }, []);

  const handleHeaderRefresh = useCallback(async () => {
    await loadConfig();
    const latestFiles = await loadFiles();
    await runRefreshAll(latestFiles);
  }, [loadConfig, loadFiles, runRefreshAll]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    loadFiles();
    loadConfig();
  }, [loadFiles, loadConfig]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('quota_management.title')}</h1>
        <p className={styles.description}>{t('quota_management.description')}</p>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <QuotaSection
        config={CLAUDE_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        onFilesRefresh={loadFiles}
        registerRefreshAll={registerRefreshAll}
      />
      <QuotaSection
        config={ANTIGRAVITY_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        onFilesRefresh={loadFiles}
        registerRefreshAll={registerRefreshAll}
      />
      <QuotaSection
        config={CODEX_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        onFilesRefresh={loadFiles}
        registerRefreshAll={registerRefreshAll}
      />
      <QuotaSection
        config={GEMINI_CLI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        onFilesRefresh={loadFiles}
        registerRefreshAll={registerRefreshAll}
      />
      <QuotaSection
        config={KIMI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        onFilesRefresh={loadFiles}
        registerRefreshAll={registerRefreshAll}
      />
    </div>
  );
}
