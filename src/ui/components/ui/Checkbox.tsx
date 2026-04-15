import React from 'react';
import { colors, typography, spacing, radii } from '../../tokens';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

const checkmark = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path
      d="M1.5 5L4 7.5L8.5 2.5"
      stroke={colors.iconBrandOnBrand}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: CheckboxProps): React.ReactElement {
  const boxStyle: React.CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: radii.r100,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...(checked
      ? { background: colors.bgBrandDefault, border: 'none' }
      : { background: colors.bgDefault, border: `1px solid ${colors.borderCheckbox}` }),
  };

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.s300,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.textDefault,
  };

  const handleClick = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <div style={wrapperStyle} onClick={handleClick}>
      <div style={boxStyle}>
        {checked && checkmark}
      </div>
      {label !== undefined && (
        <span style={labelStyle}>{label}</span>
      )}
    </div>
  );
}

export default Checkbox;
