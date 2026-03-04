import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { IconPencil, IconTrash2 } from '@/components/ui/icons';
import type { ModelPrice } from '@/utils/usage';
import { UsageTablePagination } from './UsageTablePagination';
import styles from '@/pages/UsagePage.module.scss';

export interface PriceSettingsCardProps {
  modelNames: string[];
  modelPrices: Record<string, ModelPrice>;
  onPricesChange: (prices: Record<string, ModelPrice>) => void;
}

export function PriceSettingsCard({
  modelNames,
  modelPrices,
  onPricesChange
}: PriceSettingsCardProps) {
  const { t } = useTranslation();

  // Add form state
  const [selectedModel, setSelectedModel] = useState('');
  const [promptPrice, setPromptPrice] = useState('');
  const [completionPrice, setCompletionPrice] = useState('');
  const [cachePrice, setCachePrice] = useState('');

  // Edit modal state
  const [editModel, setEditModel] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editCompletion, setEditCompletion] = useState('');
  const [editCache, setEditCache] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);

  const handleSavePrice = () => {
    if (!selectedModel) return;
    const prompt = parseFloat(promptPrice) || 0;
    const completion = parseFloat(completionPrice) || 0;
    const cache = cachePrice.trim() === '' ? prompt : parseFloat(cachePrice) || 0;
    const newPrices = { ...modelPrices, [selectedModel]: { prompt, completion, cache } };
    onPricesChange(newPrices);
    setSelectedModel('');
    setPromptPrice('');
    setCompletionPrice('');
    setCachePrice('');
  };

  const handleDeletePrice = (model: string) => {
    const newPrices = { ...modelPrices };
    delete newPrices[model];
    onPricesChange(newPrices);
  };

  const handleOpenEdit = (model: string) => {
    const price = modelPrices[model];
    setEditModel(model);
    setEditPrompt(price?.prompt?.toString() || '');
    setEditCompletion(price?.completion?.toString() || '');
    setEditCache(price?.cache?.toString() || '');
  };

  const handleSaveEdit = () => {
    if (!editModel) return;
    const prompt = parseFloat(editPrompt) || 0;
    const completion = parseFloat(editCompletion) || 0;
    const cache = editCache.trim() === '' ? prompt : parseFloat(editCache) || 0;
    const newPrices = { ...modelPrices, [editModel]: { prompt, completion, cache } };
    onPricesChange(newPrices);
    setEditModel(null);
  };

  const handleModelSelect = (value: string) => {
    setSelectedModel(value);
    const price = modelPrices[value];
    if (price) {
      setPromptPrice(price.prompt.toString());
      setCompletionPrice(price.completion.toString());
      setCachePrice(price.cache.toString());
    } else {
      setPromptPrice('');
      setCompletionPrice('');
      setCachePrice('');
    }
  };

  const options = useMemo(
    () => [
      { value: '', label: t('usage_stats.model_price_select_placeholder') },
      ...modelNames.map((name) => ({ value: name, label: name }))
    ],
    [modelNames, t]
  );

  const priceRows = useMemo(
    () =>
      Object.entries(modelPrices)
        .map(([model, price]) => ({ model, price }))
        .sort((a, b) => a.model.localeCompare(b.model, undefined, { sensitivity: 'base', numeric: true })),
    [modelPrices]
  );
  const listTotalPages = Math.max(1, Math.ceil(priceRows.length / listPageSize));
  const safeListPage = Math.min(listPage, listTotalPages);
  const listStart = (safeListPage - 1) * listPageSize;
  const listItems = priceRows.slice(listStart, listStart + listPageSize);

  useEffect(() => {
    if (listPage <= listTotalPages) return;
    setListPage(listTotalPages);
  }, [listPage, listTotalPages]);

  useEffect(() => {
    setListPage(1);
  }, [priceRows.length]);

  const handleListPageSizeChange = (size: number) => {
    if (!Number.isFinite(size) || size < 1) return;
    setListPageSize(Math.floor(size));
    setListPage(1);
  };

  return (
    <Card title={t('usage_stats.model_price_settings')}>
      <div className={styles.pricingSection}>
        {/* Price Form */}
        <div className={styles.priceForm}>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_name')}</label>
              <Select
                value={selectedModel}
                options={options}
                onChange={handleModelSelect}
                placeholder={t('usage_stats.model_price_select_placeholder')}
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_prompt')} ($/1M)</label>
              <Input
                type="number"
                value={promptPrice}
                onChange={(e) => setPromptPrice(e.target.value)}
                placeholder="0.00"
                step="0.0001"
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_completion')} ($/1M)</label>
              <Input
                type="number"
                value={completionPrice}
                onChange={(e) => setCompletionPrice(e.target.value)}
                placeholder="0.00"
                step="0.0001"
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_cache')} ($/1M)</label>
              <Input
                type="number"
                value={cachePrice}
                onChange={(e) => setCachePrice(e.target.value)}
                placeholder="0.00"
                step="0.0001"
              />
            </div>
            <div className={styles.formActionField}>
              <span className={styles.formActionLabelPlaceholder} aria-hidden="true">
                {t('usage_stats.model_name')}
              </span>
              <Button
                variant="primary"
                onClick={handleSavePrice}
                disabled={!selectedModel}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>

        {/* Saved Prices List */}
        <div className={styles.pricesList}>
          <h4 className={styles.pricesTitle}>{t('usage_stats.saved_prices')}</h4>
          {priceRows.length > 0 ? (
            <>
              <div className={`${styles.tableWrapper} ${styles.priceTableWrapper}`}>
                <table className={`${styles.table} ${styles.priceTable}`}>
                  <colgroup>
                    <col className={styles.priceTableColModel} />
                    <col className={styles.priceTableColValue} />
                    <col className={styles.priceTableColValue} />
                    <col className={styles.priceTableColValue} />
                    <col className={styles.priceTableColActions} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t('usage_stats.model_price_model')}</th>
                      <th>{t('usage_stats.model_price_prompt')}</th>
                      <th>{t('usage_stats.model_price_completion')}</th>
                      <th>{t('usage_stats.model_price_cache')}</th>
                      <th>{t('common.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listItems.map(({ model, price }) => (
                      <tr key={model}>
                        <td className={`${styles.modelCell} ${styles.tableCellLeft}`} title={model}>
                          <span className={styles.truncateText}>{model}</span>
                        </td>
                        <td className={styles.tableCellMono}>${price.prompt.toFixed(4)}/1M</td>
                        <td className={styles.tableCellMono}>${price.completion.toFixed(4)}/1M</td>
                        <td className={styles.tableCellMono}>${price.cache.toFixed(4)}/1M</td>
                        <td className={styles.tableCellStatus}>
                          <div className={styles.priceActions}>
                            <Button
                              variant="secondary"
                              size="sm"
                              className={styles.priceActionIcon}
                              onClick={() => handleOpenEdit(model)}
                              title={t('common.edit')}
                              aria-label={t('common.edit')}
                            >
                              <IconPencil size={16} />
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className={styles.priceActionIcon}
                              onClick={() => handleDeletePrice(model)}
                              title={t('common.delete')}
                              aria-label={t('common.delete')}
                            >
                              <IconTrash2 size={16} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.usageTablePagination}>
                <UsageTablePagination
                  totalItems={priceRows.length}
                  currentPage={safeListPage}
                  pageSize={listPageSize}
                  onPageChange={setListPage}
                  onPageSizeChange={handleListPageSizeChange}
                />
              </div>
            </>
          ) : (
            <div className={styles.hint}>{t('usage_stats.model_price_empty')}</div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={editModel !== null}
        title={
          <div className={styles.priceEditModalTitle}>
            <span className={styles.priceEditModalTitleMain}>
              {t('common.edit')} {t('usage_stats.model_price_title')}
            </span>
            <span className={styles.priceEditModalTitlePill} title={editModel ?? ''}>
              {editModel ?? ''}
            </span>
          </div>
        }
        onClose={() => setEditModel(null)}
        footer={
          <div className={styles.priceEditModalFooterActions}>
            <Button variant="secondary" onClick={() => setEditModel(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSaveEdit}>
              {t('common.save')}
            </Button>
          </div>
        }
        className={styles.priceEditModal}
        width={420}
      >
        <div className={styles.editModalBody}>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_prompt')} ($/1M)</label>
            <Input
              type="number"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="0.00"
              step="0.0001"
            />
          </div>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_completion')} ($/1M)</label>
            <Input
              type="number"
              value={editCompletion}
              onChange={(e) => setEditCompletion(e.target.value)}
              placeholder="0.00"
              step="0.0001"
            />
          </div>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_cache')} ($/1M)</label>
            <Input
              type="number"
              value={editCache}
              onChange={(e) => setEditCache(e.target.value)}
              placeholder="0.00"
              step="0.0001"
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
}
