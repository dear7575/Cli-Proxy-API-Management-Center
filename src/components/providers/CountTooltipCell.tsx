import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ModelDisplayItem } from './utils';

interface CountTooltipCellProps {
  items: Array<string | ModelDisplayItem>;
  emptyValue?: number | string;
  tone?: 'default' | 'warning';
  triggerLabel?: ReactNode;
  triggerAriaLabel?: string;
  triggerClassName?: string;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
}

export function CountTooltipCell({
  items,
  emptyValue = 0,
  tone = 'default',
  triggerLabel,
  triggerAriaLabel,
  triggerClassName,
}: CountTooltipCellProps) {
  const maxVisibleItems = 12;
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({
    top: 0,
    left: 0,
    arrowLeft: 0,
    placement: 'top',
  });

  const normalizedItems = useMemo<Array<ModelDisplayItem>>(
    () =>
      items
        .map((item) => {
          if (typeof item === 'string') {
            const text = item.trim();
            return text ? ({ primary: text } satisfies ModelDisplayItem) : null;
          }

          const primary = String(item?.primary ?? '').trim();
          const secondary = String(item?.secondary ?? '').trim();
          if (!primary) return null;
          return secondary
            ? ({ primary, secondary } satisfies ModelDisplayItem)
            : ({ primary } satisfies ModelDisplayItem);
        })
        .filter((item): item is ModelDisplayItem => Boolean(item)),
    [items]
  );
  const visibleItems = normalizedItems.slice(0, maxVisibleItems);
  const hiddenItemCount = Math.max(0, normalizedItems.length - visibleItems.length);
  const resolvedTriggerLabel = triggerLabel ?? normalizedItems.length;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const spacing = 8;
    const viewportPadding = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let placement: TooltipPosition['placement'] = 'top';
    let top = triggerRect.top - tooltipRect.height - spacing;
    if (top < viewportPadding) {
      placement = 'bottom';
      top = triggerRect.bottom + spacing;
    }

    if (top + tooltipRect.height > viewportHeight - viewportPadding) {
      top = Math.max(viewportPadding, viewportHeight - tooltipRect.height - viewportPadding);
    }

    const centerLeft = triggerRect.left + triggerRect.width / 2;
    let left = centerLeft - tooltipRect.width / 2;
    left = Math.max(viewportPadding, Math.min(left, viewportWidth - tooltipRect.width - viewportPadding));

    const arrowLeft = Math.max(12, Math.min(centerLeft - left, tooltipRect.width - 12));

    setPosition({ top, left, arrowLeft, placement });
  }, []);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    const handleResizeOrScroll = () => updatePosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setVisible(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVisible(false);
      }
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [updatePosition, visible]);

  if (!normalizedItems.length) {
    return <span className="provider-table-count-value">{emptyValue}</span>;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={['provider-table-count-trigger', triggerClassName].filter(Boolean).join(' ')}
        aria-label={triggerAriaLabel ?? String(resolvedTriggerLabel)}
        aria-haspopup="dialog"
        aria-expanded={visible}
        aria-describedby={visible ? tooltipId : undefined}
        onClick={() => setVisible((prev) => !prev)}
        onFocus={() => updatePosition()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setVisible(false);
          }
        }}
      >
        {resolvedTriggerLabel}
      </button>
      {visible && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={tooltipId}
              ref={tooltipRef}
              role="dialog"
              className={`provider-floating-tooltip provider-floating-tooltip-${position.placement}`}
              style={
                {
                  top: `${position.top}px`,
                  left: `${position.left}px`,
                  '--provider-tooltip-arrow-left': `${position.arrowLeft}px`,
                } as CSSProperties
              }
            >
              <div className="provider-floating-tooltip-list">
                {visibleItems.map((item, index) => (
                  <div
                    key={`${item.primary}-${item.secondary || ''}-${index}`}
                    className={`provider-floating-tooltip-item provider-floating-tooltip-item-${tone}`}
                  >
                    <span className="provider-floating-tooltip-item-primary">{item.primary}</span>
                    {item.secondary ? (
                      <span className="provider-floating-tooltip-item-secondary">{item.secondary}</span>
                    ) : null}
                  </div>
                ))}
                {hiddenItemCount > 0 ? (
                  <div className={`provider-floating-tooltip-more provider-floating-tooltip-more-${tone}`}>
                    ... +{hiddenItemCount}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
