import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { isRetryableRequestError, runTasksWithConcurrency } from '@/utils/batch';
import { formatFileSize } from '@/utils/format';
import { MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import { downloadBlob } from '@/utils/download';
import { createZipBlob } from '@/utils/zip';
import {
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
} from '@/features/authFiles/constants';

type DeleteAllOptions = {
  filter: string;
  problemOnly: boolean;
  onResetFilterToAll: () => void;
  onResetProblemOnly: () => void;
};

export type UseAuthFilesDataResult = {
  files: AuthFileItem[];
  selectedFiles: Set<string>;
  selectionCount: number;
  loading: boolean;
  error: string;
  uploading: boolean;
  batchDownloading: boolean;
  deleting: string | null;
  deletingAll: boolean;
  statusUpdating: Record<string, boolean>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  loadFiles: () => Promise<void>;
  handleUploadClick: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDelete: (name: string) => void;
  handleDeleteAll: (options: DeleteAllOptions) => void;
  handleDownload: (name: string) => Promise<void>;
  handleBatchDownload: (names: string[]) => Promise<void>;
  handleStatusToggle: (item: AuthFileItem, enabled: boolean) => Promise<void>;
  toggleSelect: (name: string) => void;
  selectAllVisible: (visibleFiles: AuthFileItem[]) => void;
  deselectAll: () => void;
  batchSetStatus: (names: string[], enabled: boolean) => Promise<void>;
  batchDelete: (names: string[]) => void;
};

export type UseAuthFilesDataOptions = {
  refreshKeyStats: () => Promise<void>;
};

const BULK_CONCURRENCY = 4;
const BULK_RETRY = 2;
const BULK_RETRY_DELAY_MS = 300;

const createBatchExportFilename = (): string => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(
    2,
    '0'
  )}${String(now.getSeconds()).padStart(2, '0')}`;
  return `auth-files-${date}-${time}.zip`;
};

export function useAuthFilesData(options: UseAuthFilesDataOptions): UseAuthFilesDataResult {
  const { refreshKeyStats } = options;
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionCount = selectedFiles.size;
  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback((visibleFiles: AuthFileItem[]) => {
    const nextSelected = visibleFiles
      .filter((file) => !isRuntimeOnlyAuthFile(file))
      .map((file) => file.name);
    setSelectedFiles(new Set(nextSelected));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  useEffect(() => {
    if (selectedFiles.size === 0) return;
    const existingNames = new Set(files.map((file) => file.name));
    setSelectedFiles((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((name) => {
        if (existingNames.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [files, selectedFiles.size]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list();
      setFiles(data?.files || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0) return;

      const filesToUpload = Array.from(fileList);
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];
      const oversizedFiles: string[] = [];

      filesToUpload.forEach((file) => {
        if (!file.name.endsWith('.json')) {
          invalidFiles.push(file.name);
          return;
        }
        if (file.size > MAX_AUTH_FILE_SIZE) {
          oversizedFiles.push(file.name);
          return;
        }
        validFiles.push(file);
      });

      if (invalidFiles.length > 0) {
        showNotification(t('auth_files.upload_error_json'), 'error');
      }
      if (oversizedFiles.length > 0) {
        showNotification(
          t('auth_files.upload_error_size', { maxSize: formatFileSize(MAX_AUTH_FILE_SIZE) }),
          'error'
        );
      }

      if (validFiles.length === 0) {
        event.target.value = '';
        return;
      }

      setUploading(true);
      let successCount = 0;
      const failed: { name: string; message: string }[] = [];

      for (const file of validFiles) {
        try {
          await authFilesApi.upload(file);
          successCount++;
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          failed.push({ name: file.name, message: errorMessage });
        }
      }

      if (successCount > 0) {
        const suffix = validFiles.length > 1 ? ` (${successCount}/${validFiles.length})` : '';
        showNotification(
          `${t('auth_files.upload_success')}${suffix}`,
          failed.length ? 'warning' : 'success'
        );
        await loadFiles();
        await refreshKeyStats();
      }

      if (failed.length > 0) {
        const details = failed.map((item) => `${item.name}: ${item.message}`).join('; ');
        showNotification(`${t('notification.upload_failed')}: ${details}`, 'error');
      }

      setUploading(false);
      event.target.value = '';
    },
    [loadFiles, refreshKeyStats, showNotification, t]
  );

  const handleDelete = useCallback(
    (name: string) => {
      showConfirmation({
        title: t('auth_files.delete_title', { defaultValue: 'Delete File' }),
        message: `${t('auth_files.delete_confirm')} "${name}" ?`,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeleting(name);
          try {
            await authFilesApi.deleteFile(name);
            showNotification(t('auth_files.delete_success'), 'success');
            setFiles((prev) => prev.filter((item) => item.name !== name));
            setSelectedFiles((prev) => {
              if (!prev.has(name)) return prev;
              const next = new Set(prev);
              next.delete(name);
              return next;
            });
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : '';
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeleting(null);
          }
        }
      });
    },
    [showConfirmation, showNotification, t]
  );

  const handleDeleteAll = useCallback(
    (deleteAllOptions: DeleteAllOptions) => {
      const { filter, problemOnly, onResetFilterToAll, onResetProblemOnly } = deleteAllOptions;
      const isFiltered = filter !== 'all';
      const isProblemOnly = problemOnly === true;
      const typeLabel = isFiltered ? getTypeLabel(t, filter) : t('auth_files.filter_all');
      const confirmMessage = isProblemOnly
        ? isFiltered
          ? t('auth_files.delete_problem_filtered_confirm', { type: typeLabel })
          : t('auth_files.delete_problem_confirm')
        : isFiltered
          ? t('auth_files.delete_filtered_confirm', { type: typeLabel })
          : t('auth_files.delete_all_confirm');

      showConfirmation({
        title: t('auth_files.delete_all_title', { defaultValue: 'Delete All Files' }),
        message: confirmMessage,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeletingAll(true);
          try {
            if (!isFiltered && !isProblemOnly) {
              await authFilesApi.deleteAll();
              showNotification(t('auth_files.delete_all_success'), 'success');
              setFiles((prev) => prev.filter((file) => isRuntimeOnlyAuthFile(file)));
              deselectAll();
            } else {
              const filesToDelete = files.filter((file) => {
                if (isRuntimeOnlyAuthFile(file)) return false;
                if (isFiltered && file.type !== filter) return false;
                if (isProblemOnly && !hasAuthFileStatusMessage(file)) return false;
                return true;
              });

              if (filesToDelete.length === 0) {
                const emptyMessage = isProblemOnly
                  ? isFiltered
                    ? t('auth_files.delete_problem_filtered_none', { type: typeLabel })
                    : t('auth_files.delete_problem_none')
                  : t('auth_files.delete_filtered_none', { type: typeLabel });
                showNotification(emptyMessage, 'info');
                setDeletingAll(false);
                return;
              }

              let success = 0;
              let failed = 0;
              const deletedNames: string[] = [];

              for (const file of filesToDelete) {
                try {
                  await authFilesApi.deleteFile(file.name);
                  success++;
                  deletedNames.push(file.name);
                } catch {
                  failed++;
                }
              }

              setFiles((prev) => prev.filter((f) => !deletedNames.includes(f.name)));
              setSelectedFiles((prev) => {
                if (prev.size === 0) return prev;
                const deletedSet = new Set(deletedNames);
                let changed = false;
                const next = new Set<string>();
                prev.forEach((name) => {
                  if (deletedSet.has(name)) {
                    changed = true;
                  } else {
                    next.add(name);
                  }
                });
                return changed ? next : prev;
              });

              if (failed === 0 && isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('auth_files.delete_problem_filtered_success', {
                        count: success,
                        type: typeLabel,
                      })
                    : t('auth_files.delete_problem_success', { count: success }),
                  'success'
                );
              } else if (failed === 0) {
                showNotification(
                  t('auth_files.delete_filtered_success', { count: success, type: typeLabel }),
                  'success'
                );
              } else if (isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('auth_files.delete_problem_filtered_partial', {
                        success,
                        failed,
                        type: typeLabel,
                      })
                    : t('auth_files.delete_problem_partial', { success, failed }),
                  'warning'
                );
              } else {
                showNotification(
                  t('auth_files.delete_filtered_partial', { success, failed, type: typeLabel }),
                  'warning'
                );
              }

              if (isFiltered) {
                onResetFilterToAll();
              }
              if (isProblemOnly) {
                onResetProblemOnly();
              }
            }
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : '';
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeletingAll(false);
          }
        }
      });
    },
    [deselectAll, files, showConfirmation, showNotification, t]
  );

  const handleDownload = useCallback(
    async (name: string) => {
      try {
        const blob = await authFilesApi.downloadBlob(name);
        downloadBlob({ filename: name, blob });
        showNotification(t('auth_files.download_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
      }
    },
    [showNotification, t]
  );

  const handleBatchDownload = useCallback(
    async (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      if (uniqueNames.length === 1) {
        await handleDownload(uniqueNames[0]);
        return;
      }

      setBatchDownloading(true);
      try {
        const results = await runTasksWithConcurrency(
          uniqueNames,
          async (name) => {
            const blob = await authFilesApi.downloadBlob(name);
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return { name, data: bytes };
          },
          {
            concurrency: BULK_CONCURRENCY,
            retry: BULK_RETRY,
            retryDelayMs: BULK_RETRY_DELAY_MS,
            shouldRetry: (error) => isRetryableRequestError(error)
          }
        );

        const exportedEntries: Array<{ name: string; data: Uint8Array }> = [];
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            exportedEntries.push(result.value);
          }
        });
        const successCount = exportedEntries.length;
        const failCount = uniqueNames.length - successCount;

        if (successCount > 0) {
          const archiveBlob = createZipBlob(exportedEntries);
          downloadBlob({
            filename: createBatchExportFilename(),
            blob: archiveBlob
          });
        }

        if (failCount === 0) {
          showNotification(
            t('auth_files.batch_export_success', {
              count: successCount,
              defaultValue: '已成功导出 {{count}} 个文件'
            }),
            'success'
          );
          return;
        }

        if (successCount > 0) {
          showNotification(
            t('auth_files.batch_export_partial', {
              success: successCount,
              failed: failCount,
              defaultValue: '批量导出完成，成功 {{success}} 个，失败 {{failed}} 个'
            }),
            'warning'
          );
          return;
        }

        const firstError = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );
        const errorMessage =
          firstError?.reason instanceof Error ? firstError.reason.message : '';
        const baseMessage = t('auth_files.batch_export_failed', {
          count: failCount,
          defaultValue: '批量导出失败，{{count}} 个文件均下载失败'
        });
        showNotification(errorMessage ? `${baseMessage}: ${errorMessage}` : baseMessage, 'error');
      } finally {
        setBatchDownloading(false);
      }
    },
    [handleDownload, showNotification, t]
  );

  const handleStatusToggle = useCallback(
    async (item: AuthFileItem, enabled: boolean) => {
      const name = item.name;
      const nextDisabled = !enabled;
      const previousDisabled = item.disabled === true;

      setStatusUpdating((prev) => ({ ...prev, [name]: true }));
      setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, disabled: nextDisabled } : f)));

      try {
        const res = await authFilesApi.setStatus(name, nextDisabled);
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: res.disabled } : f))
        );
        showNotification(
          enabled
            ? t('auth_files.status_enabled_success', { name })
            : t('auth_files.status_disabled_success', { name }),
          'success'
        );
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: previousDisabled } : f))
        );
        showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
      } finally {
        setStatusUpdating((prev) => {
          if (!prev[name]) return prev;
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [showNotification, t]
  );

  const batchSetStatus = useCallback(
    async (names: string[], enabled: boolean) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      const targetNames = new Set(uniqueNames);
      const nextDisabled = !enabled;

      setFiles((prev) =>
        prev.map((file) =>
          targetNames.has(file.name) ? { ...file, disabled: nextDisabled } : file
        )
      );

      const results = await runTasksWithConcurrency(
        uniqueNames,
        (name) => authFilesApi.setStatus(name, nextDisabled),
        {
          concurrency: BULK_CONCURRENCY,
          retry: BULK_RETRY,
          retryDelayMs: BULK_RETRY_DELAY_MS,
          shouldRetry: (error) => isRetryableRequestError(error)
        }
      );

      let successCount = 0;
      let failCount = 0;
      const failedNames = new Set<string>();
      const confirmedDisabled = new Map<string, boolean>();

      results.forEach((result, index) => {
        const name = uniqueNames[index];
        if (result.status === 'fulfilled') {
          successCount++;
          confirmedDisabled.set(name, result.value.disabled);
        } else {
          failCount++;
          failedNames.add(name);
        }
      });

      setFiles((prev) =>
        prev.map((file) => {
          if (failedNames.has(file.name)) {
            return { ...file, disabled: !nextDisabled };
          }
          if (confirmedDisabled.has(file.name)) {
            return { ...file, disabled: confirmedDisabled.get(file.name) };
          }
          return file;
        })
      );

      if (failCount === 0) {
        showNotification(t('auth_files.batch_status_success', { count: successCount }), 'success');
      } else {
        showNotification(
          t('auth_files.batch_status_partial', { success: successCount, failed: failCount }),
          'warning'
        );
      }

      deselectAll();
    },
    [deselectAll, showNotification, t]
  );

  const batchDelete = useCallback(
    (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      showConfirmation({
        title: t('auth_files.batch_delete_title'),
        message: t('auth_files.batch_delete_confirm', { count: uniqueNames.length }),
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          const results = await runTasksWithConcurrency(
            uniqueNames,
            (name) => authFilesApi.deleteFile(name),
            {
              concurrency: BULK_CONCURRENCY,
              retry: BULK_RETRY,
              retryDelayMs: BULK_RETRY_DELAY_MS,
              shouldRetry: (error) => isRetryableRequestError(error)
            }
          );

          const deleted: string[] = [];
          let failCount = 0;
          results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              deleted.push(uniqueNames[index]);
            } else {
              failCount++;
            }
          });

          if (deleted.length > 0) {
            const deletedSet = new Set(deleted);
            setFiles((prev) => prev.filter((file) => !deletedSet.has(file.name)));
          }

          setSelectedFiles((prev) => {
            if (prev.size === 0) return prev;
            const deletedSet = new Set(deleted);
            let changed = false;
            const next = new Set<string>();
            prev.forEach((name) => {
              if (deletedSet.has(name)) {
                changed = true;
              } else {
                next.add(name);
              }
            });
            return changed ? next : prev;
          });

          if (failCount === 0) {
            showNotification(`${t('auth_files.delete_all_success')} (${deleted.length})`, 'success');
          } else {
            showNotification(
              t('auth_files.delete_filtered_partial', {
                success: deleted.length,
                failed: failCount,
                type: t('auth_files.filter_all')
              }),
              'warning'
            );
          }
        }
      });
    },
    [showConfirmation, showNotification, t]
  );

  return {
    files,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    batchDownloading,
    deleting,
    deletingAll,
    statusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleBatchDownload,
    handleStatusToggle,
    toggleSelect,
    selectAllVisible,
    deselectAll,
    batchSetStatus,
    batchDelete
  };
}
