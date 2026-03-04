import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: string;
  error?: string;
  rightElement?: ReactNode;
}

export function Input({ label, hint, error, rightElement, className = '', ...rest }: InputProps) {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <div className="input-wrap">
        <input className={`input ${className}`.trim()} {...rest} />
        {rightElement && (
          <div className="input-right-element">
            {rightElement}
          </div>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
