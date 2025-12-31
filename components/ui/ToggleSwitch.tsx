/**
 * Toggle Switch Component
 *
 * Animated toggle switch with label and disabled states.
 * Active state uses amber/gold accent color from fintech theme.
 */

interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
}

export function ToggleSwitch({
  label,
  checked,
  onChange,
  disabled = false,
  description
}: ToggleSwitchProps) {
  const toggleId = `toggle-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="toggle">
      <label className="toggle-container" htmlFor={toggleId}>
        <div className="toggle-content">
          <span className="toggle-label">{label}</span>
          {description && <span className="toggle-description">{description}</span>}
        </div>

        <input
          id={toggleId}
          type="checkbox"
          className="toggle-input"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />

        <span className={`toggle-switch ${disabled ? 'toggle-disabled' : ''}`}>
          <span className="toggle-slider"></span>
        </span>
      </label>
    </div>
  );
}

export default ToggleSwitch;
