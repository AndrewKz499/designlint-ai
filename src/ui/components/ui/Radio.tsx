import React from 'react';
import { colors, typography, spacing } from '../../tokens';

interface RadioProps {
  /** Имя группы radio — для семантической группировки */
  name: string;
  /** Выбран ли radio */
  checked: boolean;
  /** Обработчик выбора (вызывается при переключении в checked) */
  onChange: () => void;
  /** Видимая подпись справа от радио */
  label?: string;
  /** Disabled-state */
  disabled?: boolean;
  /** ARIA-label для assistive tech (если label не задан или нужно расширить) */
  ariaLabel?: string;
}

function ringStyle(checked: boolean, disabled: boolean): React.CSSProperties {
  const common: React.CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
  };
  if (disabled) {
    return {
      ...common,
      background: colors.bgSecondary,
      border: '1px solid ' + colors.borderMuted,
    };
  }
  if (checked) {
    return {
      ...common,
      background: colors.bgDefault,
      border: '1px solid ' + colors.accent,
    };
  }
  return {
    ...common,
    background: colors.bgDefault,
    border: '1px solid ' + colors.borderMuted,
  };
}

export function Radio({
  name,
  checked,
  onChange,
  label,
  disabled = false,
  ariaLabel,
}: RadioProps): React.ReactElement {
  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s300,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: disabled ? colors.contentMuted : colors.content,
  };

  const dotColor = disabled ? colors.contentMuted : colors.accent;

  const handleClick = () => {
    if (!disabled && !checked) onChange();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!checked) onChange();
    }
  };

  return (
    <div
      style={wrapperStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      data-name={name}
      tabIndex={disabled ? -1 : 0}
    >
      <div style={ringStyle(checked, disabled)}>
        {checked && !disabled && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dotColor,
            }}
          />
        )}
      </div>
      {label !== undefined && <span style={labelStyle}>{label}</span>}
    </div>
  );
}

export default Radio;
