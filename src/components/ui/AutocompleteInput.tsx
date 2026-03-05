import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDown } from './icons';
import styles from './AutocompleteInput.module.scss';

interface AutocompleteInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[] | { value: string; label?: string }[];
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  wrapperClassName?: string;
  wrapperStyle?: React.CSSProperties;
  id?: string;
  rightElement?: ReactNode;
}

export function AutocompleteInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  hint,
  error,
  className = '',
  wrapperClassName = '',
  wrapperStyle,
  id,
  rightElement
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 320,
  });
  const [dropdownPlacement, setDropdownPlacement] = useState<'top' | 'bottom'>('bottom');
  
  const normalizedOptions = options.map(opt => 
    typeof opt === 'string' ? { value: opt, label: opt } : { value: opt.value, label: opt.label || opt.value }
  );

  const filteredOptions = normalizedOptions.filter(opt => {
    const v = value.toLowerCase();
    return opt.value.toLowerCase().includes(v) || (opt.label && opt.label.toLowerCase().includes(v));
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || disabled) return;

    const updateDropdownPosition = () => {
      const inputEl = inputRef.current;
      if (!inputEl) return;
      const rect = inputEl.getBoundingClientRect();
      const viewportPadding = 12;
      const minWidth = 420;
      const maxWidth = Math.min(760, window.innerWidth - viewportPadding * 2);
      const width = Math.min(Math.max(rect.width, minWidth), maxWidth);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const shouldOpenTop = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(180, Math.min(360, shouldOpenTop ? spaceAbove : spaceBelow));
      const top = shouldOpenTop ? Math.max(viewportPadding, rect.top - maxHeight - 4) : rect.bottom + 4;
      setDropdownPlacement(shouldOpenTop ? 'top' : 'bottom');
      setDropdownStyle({ top, left, width, maxHeight });
    };

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [isOpen, disabled, filteredOptions.length]);

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !dropdownRef.current) return;
    const target = dropdownRef.current.querySelector<HTMLElement>(`[data-option-index="${highlightedIndex}"]`);
    target?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
          setIsOpen(true);
          const exactMatchIndex = filteredOptions.findIndex((opt) => opt.value === value);
          setHighlightedIndex(exactMatchIndex >= 0 ? exactMatchIndex : 0);
          return;
      }
      setHighlightedIndex(prev => 
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault();
        handleSelect(filteredOptions[highlightedIndex].value);
      } else if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`form-group ${wrapperClassName}`} ref={containerRef} style={wrapperStyle}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className={styles.fieldWrap}>
        <input 
            id={id}
            ref={inputRef}
            className={`input ${styles.fieldInput} ${className}`.trim()} 
            value={value}
            onChange={handleInputChange}
            onFocus={() => {
              setIsOpen(true);
              const exactMatchIndex = filteredOptions.findIndex((opt) => opt.value === value);
              setHighlightedIndex(exactMatchIndex);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
        />
        <div 
            className={`${styles.rightControls} ${disabled ? styles.rightControlsDisabled : ''}`.trim()}
            onClick={() => !disabled && setIsOpen(!isOpen)}
        >
            {rightElement}
            <IconChevronDown size={16} className={styles.chevronIcon} />
        </div>

      </div>
      {isOpen && filteredOptions.length > 0 && !disabled && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={dropdownRef}
              className={`${styles.dropdown} ${dropdownPlacement === 'top' ? styles.dropdownTop : ''}`.trim()}
              style={{
                position: 'fixed',
                top: `${dropdownStyle.top}px`,
                left: `${dropdownStyle.left}px`,
                width: `${dropdownStyle.width}px`,
                maxHeight: `${dropdownStyle.maxHeight}px`,
              }}
            >
              {filteredOptions.map((opt, index) => (
                <div
                  key={`${opt.value}-${index}`}
                  data-option-index={index}
                  onClick={() => handleSelect(opt.value)}
                  className={`${styles.option} ${index === highlightedIndex ? styles.optionActive : ''} ${
                    opt.value === value ? styles.optionSelected : ''
                  }`.trim()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className={styles.optionValue}>{opt.value}</span>
                  {opt.label && opt.label !== opt.value && (
                    <span className={styles.optionLabel}>{opt.label}</span>
                  )}
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
