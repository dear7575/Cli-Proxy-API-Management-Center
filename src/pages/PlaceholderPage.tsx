import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <Card title={t(titleKey)}>
      <p className="hint">{t('common.loading')}</p>
    </Card>
  );
}
