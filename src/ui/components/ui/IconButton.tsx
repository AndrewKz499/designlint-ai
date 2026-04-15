import React from 'react';
import { spacing, radii } from '../../tokens';

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
  const style: React.CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s200,
    borderRadius: radii.pill,
    background: 'transparent',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <button style={style} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default IconButton;
