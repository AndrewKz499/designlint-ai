import React from 'react';
import { colors, typography, spacing } from '../../tokens';
import { IconButton } from './IconButton';

interface HeaderProps {
  onSettingsClick?: () => void;
}

const gearIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="3" stroke={colors.iconDefault} strokeWidth="1.5" />
    <path
      d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.697 3.697l1.414 1.414M14.889 14.889l1.414 1.414M3.697 16.303l1.414-1.414M14.889 5.111l1.414-1.414"
      stroke={colors.iconDefault}
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export function Header({ onSettingsClick }: HeaderProps): React.ReactElement {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.s300}px ${spacing.s400}px`,
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: typography.heading.fontFamily,
    fontWeight: typography.heading.fontWeight,
    fontSize: typography.heading.fontSize,
    lineHeight: typography.heading.lineHeight,
    letterSpacing: typography.heading.letterSpacing,
    color: colors.textDefault,
    margin: 0,
  };

  return (
    <div style={containerStyle}>
      <span style={titleStyle}>DesignLint AI</span>
      <IconButton onClick={onSettingsClick} disabled={onSettingsClick === undefined}>
        {gearIcon}
      </IconButton>
    </div>
  );
}

export default Header;
