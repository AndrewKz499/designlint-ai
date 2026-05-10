import React, { useState } from 'react';
import { colors, typography, spacing } from '../../tokens';

interface BackButtonProps {
  onClick: () => void;
}

// Соответствие JSON ДС: компонент Lable_icons (id 148:12607).
// Эталоны 02/04/05/09 — синяя стрелка «<» + текст «Back», выравнивание по левому краю.
// Не подключается к экранам в Ф.16.2 — потребители ReportView/Settings переедут в Ф.16.5/Ф.16.6.
export function BackButton({ onClick }: BackButtonProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.s200,
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    color: colors.accent,
    fontFamily: typography.bodyBold.fontFamily,
    fontSize: typography.bodyBold.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    lineHeight: typography.bodyBold.lineHeight,
    textDecoration: isHovered ? 'underline' : 'none',
    outline: 'none',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={style}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M10 3L5 8L10 13"
          stroke={colors.accent}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Back</span>
    </button>
  );
}

export default BackButton;
