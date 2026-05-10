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
    // Эталоны 09/11: disabled = bgDefault + border + muted text.
    return {
      background: colors.bgDefault,
      color: colors.contentMuted,
      border: '1px solid ' + colors.border,
      cursor: 'not-allowed',
    };
  }
  if (variant === 'primary') {
    return {
      background: colors.content,
      color: colors.tagContent,
      border: '1px solid ' + colors.content,
      cursor: 'pointer',
    };
  }
  // secondary: эталоны 04/06/11 — серый фон + синий (accent) текст.
  return {
    background: colors.bgSecondary,
    color: colors.accent,
    border: '1px solid ' + colors.bgSecondary,
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
  const [isActive, setIsActive] = useState(false);

  // hover/active для активной кнопки: hover — brightness(0.92), active — brightness(0.85).
  // disabled — без hover/active эффектов.
  const filterValue = (() => {
    if (disabled) return 'none';
    if (isActive) return 'brightness(0.85)';
    if (isHovered) return 'brightness(0.92)';
    return 'none';
  })();

  const style: React.CSSProperties = {
    ...base,
    ...sizeStyles[size],
    ...variantStyle(variant, disabled),
    filter: filterValue,
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsActive(false); }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      style={style}
    >
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      {children}
    </button>
  );
}

export default Button;
