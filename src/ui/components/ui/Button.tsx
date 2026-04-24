import React, { useState } from 'react';
import { colors, typography, spacing, radii } from '../../tokens';

interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'l' | 'xl';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  type?: 'button' | 'submit';
}

const sizeStyles: Record<'l' | 'xl', React.CSSProperties> = {
  l: {
    padding: '12px 16px',
    minHeight: 44,
  },
  xl: {
    padding: '16px 24px',
    minHeight: 54,
  },
};

const base: React.CSSProperties = {
  width: '100%',
  borderRadius: radii.r200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.s200,
  fontFamily: typography.body.fontFamily,
  fontSize: typography.body.fontSize,
  fontWeight: typography.body.fontWeight,
  lineHeight: typography.body.lineHeight,
  transition: 'filter 0.15s ease',
  outline: 'none',
};

function variantStyle(
  variant: 'primary' | 'secondary',
  disabled: boolean,
): React.CSSProperties {
  if (disabled) {
    return {
      background: colors.bgSecondary,
      color: colors.contentMuted,
      border: 'none',
      cursor: 'not-allowed',
    };
  }
  if (variant === 'primary') {
    return {
      background: colors.content,
      color: colors.contentOnDark,
      border: '1px solid ' + colors.content,
      cursor: 'pointer',
    };
  }
  return {
    background: colors.bgSecondary,
    color: colors.content,
    border: 'none',
    cursor: 'pointer',
  };
}

export function Button({
  variant = 'primary',
  size = 'l',
  children,
  onClick,
  disabled = false,
  icon,
  type = 'button',
}: ButtonProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const style: React.CSSProperties = {
    ...base,
    ...sizeStyles[size],
    ...variantStyle(variant, disabled),
    filter: !disabled && isHovered ? 'brightness(0.92)' : 'none',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={style}
    >
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      {children}
    </button>
  );
}

export default Button;
