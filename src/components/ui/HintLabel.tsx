import type { ReactNode } from 'react';
import { IconInfo } from '@/components/ui/icons';
import styles from './HintLabel.module.scss';

interface HintLabelProps {
  label: ReactNode;
  hint: ReactNode;
  className?: string;
  tooltipPlacement?: 'right' | 'bottom';
}

export function HintLabel({ label, hint, className, tooltipPlacement = 'right' }: HintLabelProps) {
  const rootClassName = className ? `${styles.hintLabel} ${className}` : styles.hintLabel;
  const tooltipClassName =
    tooltipPlacement === 'bottom' ? `${styles.hintTooltip} ${styles.hintTooltipBottom}` : styles.hintTooltip;
  const ariaLabel = typeof hint === 'string' ? hint : '说明';

  return (
    <span className={rootClassName}>
      <span className={styles.hintLabelText}>{label}</span>
      <span className={styles.hintTrigger} tabIndex={0} aria-label={ariaLabel}>
        <IconInfo size={12} />
      </span>
      <span className={tooltipClassName} role="tooltip">
        {hint}
      </span>
    </span>
  );
}
