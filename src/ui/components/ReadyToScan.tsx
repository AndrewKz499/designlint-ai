// Сегмент-контрол выбора области сканирования
import type { ScanScope } from '../../shared/types';
import { SCOPE_LABEL, UI } from '../../shared/strings';
import { colors, typography, spacing } from '../tokens';
import { Tag } from './ui/Tag';

type Props = {
  value: ScanScope;
  onChange: (scope: ScanScope) => void;
};

// Фиксированный порядок вариантов
const SCOPES: ScanScope[] = ['selection', 'section', 'topFrames', 'page'];

export function ReadyToScan({ value, onChange }: Props) {
  return (
    <div>
      {/* Заголовок над рядом чипов — H3 по эталону 02-ready-to-scan.png.
          Info-иконка (i) намеренно НЕ добавлена (решение PO 2026-05-08). */}
      <div style={styles.label}>{UI.scopeTitle}</div>

      {/* Горизонтальный ряд из 4 чипов через ДС Tag (active/idle) */}
      <div style={styles.group}>
        {SCOPES.map((scope) => (
          <Tag
            key={scope}
            active={scope === value}
            onClick={() => onChange(scope)}
          >
            {SCOPE_LABEL[scope]}
          </Tag>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Стили
// ---------------------------------------------------------------------------

const styles = {
  label: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
    letterSpacing: typography.h3.letterSpacing,
    color: colors.content,
    marginBottom: spacing.s200,
  } as React.CSSProperties,
  group: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s200,
  } as React.CSSProperties,
};
