import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ModelInfo } from '@/utils/models';
import styles from '@/pages/AiProvidersPage.module.scss';

interface ModelDiscoveryPanelProps {
  hintText: string;
  endpointLabel: string;
  endpointValue: string;
  refreshLabel: string;
  onRefresh: () => void;
  refreshLoading?: boolean;
  refreshDisabled?: boolean;
  searchLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchDisabled?: boolean;
  selectedText: string;
  selectAllLabel: string;
  clearSelectedLabel: string;
  onSelectAll: () => void;
  onClearSelected: () => void;
  selectAllDisabled?: boolean;
  clearSelectedDisabled?: boolean;
  error?: string;
  loading: boolean;
  loadingText: string;
  emptyText: string;
  searchEmptyText: string;
  models: ModelInfo[];
  filteredModels: ModelInfo[];
  selectedNames: Set<string>;
  onToggleModel: (name: string) => void;
}

export function ModelDiscoveryPanel({
  hintText,
  endpointLabel,
  endpointValue,
  refreshLabel,
  onRefresh,
  refreshLoading = false,
  refreshDisabled = false,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  searchDisabled = false,
  selectedText,
  selectAllLabel,
  clearSelectedLabel,
  onSelectAll,
  onClearSelected,
  selectAllDisabled = false,
  clearSelectedDisabled = false,
  error = '',
  loading,
  loadingText,
  emptyText,
  searchEmptyText,
  models,
  filteredModels,
  selectedNames,
  onToggleModel,
}: ModelDiscoveryPanelProps) {
  const stateText = loading ? loadingText : models.length === 0 ? emptyText : searchEmptyText;
  const showState = loading || models.length === 0 || filteredModels.length === 0;

  return (
    <div className={styles.openaiModelsContent}>
      <div className={styles.sectionHint}>{hintText}</div>
      <div className={styles.openaiModelsEndpointSection}>
        <label className={styles.openaiModelsEndpointLabel}>{endpointLabel}</label>
        <div className={styles.openaiModelsEndpointControls}>
          <input className={`input ${styles.openaiModelsEndpointInput}`} readOnly value={endpointValue} />
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            loading={refreshLoading}
            disabled={refreshDisabled}
          >
            {refreshLabel}
          </Button>
        </div>
      </div>
      <Input
        label={searchLabel}
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        disabled={searchDisabled}
      />
      <div className={styles.modelDiscoveryActions}>
        <span className={styles.modelDiscoverySelected}>{selectedText}</span>
        <div className={styles.modelDiscoveryActionButtons}>
          <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={selectAllDisabled}>
            {selectAllLabel}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelected} disabled={clearSelectedDisabled}>
            {clearSelectedLabel}
          </Button>
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      {showState ? (
        <div className={styles.modelDiscoveryState}>{stateText}</div>
      ) : (
        <div className={styles.modelDiscoveryList}>
          {filteredModels.map((model) => {
            const checked = selectedNames.has(model.name);
            return (
              <label
                key={model.name}
                className={`${styles.modelDiscoveryRow} ${checked ? styles.modelDiscoveryRowSelected : ''}`}
              >
                <input type="checkbox" checked={checked} onChange={() => onToggleModel(model.name)} />
                <div className={styles.modelDiscoveryMeta}>
                  <div className={styles.modelDiscoveryName}>
                    {model.name}
                    {model.alias && <span className={styles.modelDiscoveryAlias}>{model.alias}</span>}
                  </div>
                  {model.description && <div className={styles.modelDiscoveryDesc}>{model.description}</div>}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
