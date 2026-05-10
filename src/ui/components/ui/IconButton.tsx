import React, { useState } from 'react';
import { colors, spacing, radii } from '../../tokens';

interface IconButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: number;
}

export function IconButton({
  children,
  onClick,
  disabled = false,
  size = 32,
}: IconButtonProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const style: React.CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s200,
    borderRadius: radii.pill,
    background: !disabled && isHovered ? colors.bgSecondary : 'transparent',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    color: colors.content,
    transition: 'background 0.15s ease',
  };

  return (
    <button
      style={style}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  );
}

export default IconButton;
