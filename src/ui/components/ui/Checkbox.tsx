import React from 'react';
import { colors, typography, spacing, radii } from '../../tokens';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

function checkmark(strokeColor: string): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M1.5 5L4 7.5L8.5 2.5"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function boxStyle(checked: boolean, disabled: boolean): React.CSSProperties {
  const common: React.CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: radii.r100,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s ease, border-color 0.15s ease',
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
      background: colors.accent,
      border: 'none',
    };
  }
  return {
    ...common,
    background: colors.bgDefault,
    border: '1px solid ' + colors.borderMuted,
  };
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: CheckboxProps): React.ReactElement {
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

  const toggle = () => {
    if (!disabled) onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const tickColor = disabled ? colors.contentMuted : colors.contentOnDark;

  return (
    <div
      style={wrapperStyle}
      onClick={toggle}
      onKeyDown={handleKeyDown}
      role="checkbox"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
    >
      <div style={boxStyle(checked, disabled)}>
        {checked && checkmark(tickColor)}
      </div>
      {label !== undefined && <span style={labelStyle}>{label}</span>}
    </div>
  );
}

export default Checkbox;
