import React from 'react';
import { colors, typography, spacing, radii } from '../../tokens';

interface ButtonProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}

const base: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.s200,
  width: '100%',
  padding: spacing.s300,
  borderRadius: radii.r200,
  fontSize: typography.body.fontSize,
  fontWeight: typography.body.fontWeight,
  fontFamily: typography.body.fontFamily,
  cursor: 'pointer',
  lineHeight: typography.body.lineHeight,
};

const variantStyles: Record<'primary' | 'secondary', React.CSSProperties> = {
  primary: {
    background: colors.bgBrandDefault,
    border: `1px solid ${colors.borderBrand}`,
    color: colors.textBrandOnBrand,
  },
  secondary: {
    background: colors.bgSecondary,
    border: 'none',
    color: colors.textNeutral,
  },
};

const disabledStyles: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
};

export function Button({
  variant = 'primary',
  children,
  onClick,
  disabled = false,
  icon,
}: ButtonProps): React.ReactElement {
  const style: React.CSSProperties = {
    ...base,
    ...variantStyles[variant],
    ...(disabled ? disabledStyles : {}),
  };

  return (
    <button style={style} onClick={onClick} disabled={disabled}>
      {icon !== undefined && icon}
      {children}
    </button>
  );
}

export default Button;
