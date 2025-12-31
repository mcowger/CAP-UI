/**
 * Input Component
 *
 * Reusable input field with label, error states, and focus glow effects.
 * Styled with fintech glassmorphism theme.
 */

import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export function Input({
  label,
  error,
  fullWidth = false,
  className = '',
  id,
  ...rest
}: InputProps) {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

  const wrapperClasses = [
    'input-wrapper',
    fullWidth ? 'input-full' : '',
    error ? 'input-has-error' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const inputClasses = ['input-field', className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClasses}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
        </label>
      )}
      <input id={inputId} className={inputClasses} {...rest} />
      {error && <span className="input-error">{error}</span>}
    </div>
  );
}

export default Input;
