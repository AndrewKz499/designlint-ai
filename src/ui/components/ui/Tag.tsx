import React from 'react';
import { colors, typography, spacing, radii } from '../../tokens';

interface TagProps {
  children: React.ReactNode;
  onRemove?: () => void;
}

const closeIcon = (onRemove: () => void) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    style={{ cursor: 'pointer', flexShrink: 0 }}
    onClick={onRemove}
  >
    <path
      d="M4 4L12 12M12 4L4 12"
      stroke={colors.contentOnDark}
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export function Tag({ children, onRemove }: TagProps): React.ReactElement {
  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.s200,
    background: colors.content,
    borderRadius: radii.r200,
    padding: spacing.s200,
    color: colors.contentOnDark,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    fontFamily: typography.body.fontFamily,
    lineHeight: typography.bodyBold.lineHeight,
  };

  return (
    <div style={containerStyle}>
      {children}
      {onRemove !== undefined && closeIcon(onRemove)}
    </div>
  );
}

export default Tag;
