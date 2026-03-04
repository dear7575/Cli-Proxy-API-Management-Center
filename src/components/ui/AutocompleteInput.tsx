import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
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
  
  const normalizedOptions = options.map(opt => 
    typeof opt === 'string' ? { value: opt, label: opt } : { value: opt.value, label: opt.label || opt.value }
  );

  const filteredOptions = normalizedOptions.filter(opt => {
    const v = value.toLowerCase();
    return opt.value.toLowerCase().includes(v) || (opt.label && opt.label.toLowerCase().includes(v));
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
            className={`input ${styles.fieldInput} ${className}`.trim()} 
            value={value}
            onChange={handleInputChange}
            onFocus={() => setIsOpen(true)}
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

        {isOpen && filteredOptions.length > 0 && !disabled && (
            <div className={styles.dropdown}>
                {filteredOptions.map((opt, index) => (
                    <div
                        key={`${opt.value}-${index}`}
                        onClick={() => handleSelect(opt.value)}
                        className={`${styles.option} ${index === highlightedIndex ? styles.optionActive : ''}`.trim()}
                        onMouseEnter={() => setHighlightedIndex(index)}
                    >
                        <span className={styles.optionValue}>{opt.value}</span>
                        {opt.label && opt.label !== opt.value && (
                            <span className={styles.optionLabel}>{opt.label}</span>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
