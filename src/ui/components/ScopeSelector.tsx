// Сегмент-контрол выбора области сканирования
import type { ScanScope } from '../../shared/types';
import { SCOPE_LABEL, UI } from '../../shared/strings';
import { colors, typography, spacing, radii, borders } from '../tokens';

type Props = {
  value: ScanScope;
  onChange: (scope: ScanScope) => void;
};

// Фиксированный порядок вариантов
const SCOPES: ScanScope[] = ['selection', 'section', 'topFrames', 'page'];

export function ScopeSelector({ value, onChange }: Props) {
  return (
    <div>
      {/* Заголовок над рядом кнопок */}
      <div style={styles.label}>{UI.scopeTitle}</div>

      {/* Горизонтальный ряд из 4 кнопок */}
      <div style={styles.group}>
        {SCOPES.map((scope) => (
          <button
            key={scope}
            style={scope === value ? styles.btnActive : styles.btnIdle}
            onClick={() => onChange(scope)}
          >
            {SCOPE_LABEL[scope]}
          </button>
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
    fontSize: typography.body.fontSize,
    color: colors.contentMuted,
    marginBottom: spacing.s200,
  } as React.CSSProperties,
  group: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s200,
  } as React.CSSProperties,
  btnIdle: {
    height: '28px',
    padding: `0 ${spacing.s300}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: colors.content,
    border: `${borders.stroke}px solid ${colors.content}`,
    borderRadius: radii.r200,
    fontFamily: typography.caption.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: 1,
    cursor: 'pointer',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  btnActive: {
    height: '28px',
    padding: `0 ${spacing.s300}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.content,
    color: colors.contentOnDark,
    border: `${borders.stroke}px solid ${colors.content}`,
    borderRadius: radii.r200,
    fontFamily: typography.caption.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: 1,
    cursor: 'pointer',
    boxSizing: 'border-box',
  } as React.CSSProperties,
};
