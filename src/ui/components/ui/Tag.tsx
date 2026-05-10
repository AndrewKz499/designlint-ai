import React from 'react';
import { colors, typography, spacing, radii } from '../../tokens';

interface TagProps {
  children: React.ReactNode;
  active?: boolean;
  onRemove?: () => void;
  /**
   * Клик по чипу — для use-case переключения active/idle (см. ReadyToScan).
   * Если не передан — Tag рендерится как презентационный <div>, не интерактивный.
   * Несовместим с onRemove на уровне UX (chip-input vs toggle), но технически
   * не запрещён — потребитель сам отвечает за корректное сочетание.
   */
  onClick?: () => void;
}

const closeIcon = (strokeColor: string, onRemove: () => void) => (
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
      stroke={strokeColor}
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export function Tag({ children, active = true, onRemove, onClick }: TagProps): React.ReactElement {
  // JSON ДС Tags: variants Tag_Active / Tag_Disable.
  // Active  = tagBg (#4A4A4A) + tagContent (#FFFFFF)  — текущее.
  // Disable = bgDefault + border + content.
  const baseStyle: React.CSSProperties = active
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.s200,
        background: colors.tagBg,
        border: '1px solid ' + colors.tagBg,
        borderRadius: radii.r200,
        padding: spacing.s200,
        color: colors.tagContent,
        fontSize: typography.body.fontSize,
        fontWeight: typography.body.fontWeight,
        fontFamily: typography.body.fontFamily,
        lineHeight: typography.body.lineHeight,
      }
    : {
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.s200,
        background: colors.bgDefault,
        border: '1px solid ' + colors.border,
        borderRadius: radii.r200,
        padding: spacing.s200,
        color: colors.content,
        fontSize: typography.body.fontSize,
        fontWeight: typography.body.fontWeight,
        fontFamily: typography.body.fontFamily,
        lineHeight: typography.body.lineHeight,
      };

  const strokeColor = active ? colors.tagContent : colors.content;

  // Если onClick задан — рендерим как <button> (a11y + keyboard).
  if (onClick !== undefined) {
    const buttonStyle: React.CSSProperties = {
      ...baseStyle,
      cursor: 'pointer',
      // reset нативных button-стилей
      margin: 0,
      font: 'inherit',
    };
    return (
      <button type="button" style={buttonStyle} onClick={onClick}>
        {children}
        {onRemove !== undefined && closeIcon(strokeColor, onRemove)}
      </button>
    );
  }

  return (
    <div style={baseStyle}>
      {children}
      {onRemove !== undefined && closeIcon(strokeColor, onRemove)}
    </div>
  );
}

export default Tag;
