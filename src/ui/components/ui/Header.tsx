import React from 'react';
import type { Example } from '../../../shared/types';
import { UI } from '../../../shared/strings';
import { colors, typography, spacing } from '../../tokens';
import { IconButton } from './IconButton';
import { Tag } from './Tag';

type HeaderIcon = 'gear' | 'home' | 'none';

interface HeaderProps {
  /** Какая иконка показывается справа: gear / home / none. Default 'none'. */
  icon?: HeaderIcon;
  /** Клик по иконке. Если не передан — клик no-op. */
  onIconClick?: () => void;
  /**
   * Активный эталон. Если null — чип не рендерится. Шаг 18.8 (Ф.18a).
   * Само наличие prop не означает рендер — управляется флагом showExampleChip,
   * чтобы Header не знал о маршрутах (currentView). Решение о видимости
   * принимает App.tsx (см. там).
   */
  example?: Example | null;
  /**
   * Флаг видимости чипа эталона. Шаг 18.8 (Ф.18a).
   * App.tsx вычисляет его как `example !== null && currentView !== 'mode0' &&
   * currentView !== 'verification-example'`. Если false — чип не рендерится,
   * даже если example задан. Это держит Header «глупым» относительно роутинга.
   */
  showExampleChip?: boolean;
  /** Клик по ✕ чипа эталона — App.tsx отправит clear-example в sandbox. */
  onClearExample?: () => void;
}

const gearSvg = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// Inline SVG home: line-style, 24×24, под gear (см. эталоны 02/04/05/06).
// Соответствует JSON ДС Component 1 → variant Home (id 204:208).
const homeSvg = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11L12 3L21 11V20C21 20.5523 20.5523 21 20 21H15V14H9V21H4C3.44772 21 3 20.5523 3 20V11Z"/>
  </svg>
);

export function Header({
  icon = 'none',
  onIconClick,
  example = null,
  showExampleChip = false,
  onClearExample,
}: HeaderProps): React.ReactElement {
  // Внешний flex-column wrapper нужен, чтобы чип эталона рендерился ПОД
  // строкой с заголовком и иконкой (а не сбоку). Шаг 18.8: чип-зона — отдельная
  // строка под Header, единое место рендера на всех экранах.
  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s200,
    padding: `${spacing.s300}px 0`,
  };

  const titleRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: typography.h1.fontFamily,
    fontWeight: typography.h1.fontWeight,
    fontSize: '32px',
    lineHeight: 1.2,
    letterSpacing: typography.h1.letterSpacing,
    color: colors.content,
    margin: 0,
  };

  // Если onIconClick не передан и icon !== 'none' — иконка показывается, клик no-op.
  const handleClick = onIconClick ?? (() => {});

  let iconSvg: React.ReactNode = null;
  if (icon === 'gear') iconSvg = gearSvg;
  else if (icon === 'home') iconSvg = homeSvg;

  // Шаг 18.8: чип эталона рендерится только при showExampleChip=true И
  // example !== null. Видимость по currentView вычисляется в App.tsx.
  // Чип использует существующий Tag без новых вариаций — стилизация это Ф.18b.
  const renderChip = showExampleChip && example !== null;
  const handleClearExample = onClearExample ?? (() => {});

  return (
    <div style={wrapperStyle}>
      <div style={titleRowStyle}>
        <span style={titleStyle}>DesignLint AI</span>
        {iconSvg !== null && (
          <IconButton onClick={handleClick}>
            {iconSvg}
          </IconButton>
        )}
      </div>
      {renderChip && (
        <div>
          <Tag onRemove={handleClearExample}>
            {UI.verExampleChip(example.name)}
          </Tag>
        </div>
      )}
    </div>
  );
}

export default Header;
