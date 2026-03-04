import type { PropsWithChildren, ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import styles from './ConfigSection.module.scss';

interface ConfigSectionProps {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function ConfigSection({ title, description, className, children }: PropsWithChildren<ConfigSectionProps>) {
  const descriptionTitle = typeof description === 'string' ? description : undefined;
  const cardClassName = className ? `${styles.configSectionCard} ${className}` : styles.configSectionCard;

  return (
    <Card
      title={title}
      extra={description ? (
        <span className={styles.headerDescription} title={descriptionTitle}>
          {description}
        </span>
      ) : undefined}
      className={cardClassName}
    >
      {children}
    </Card>
  );
}

