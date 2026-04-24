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
    width: '100%',
    borderRadius: radii.r200,
    overflow: 'hidden',
    border: `${borders.stroke}px solid ${colors.border}`,
  } as React.CSSProperties,
  btnIdle: {
    flex: 1,
    padding: `${spacing.s200}px`,
    background: 'transparent',
    color: colors.contentMuted,
    border: 'none',
    fontFamily: typography.body.fontFamily,
    fontSize: '12px',
    cursor: 'pointer',
  } as React.CSSProperties,
  btnActive: {
    flex: 1,
    padding: `${spacing.s200}px`,
    background: colors.content,
    color: colors.contentOnDark,
    border: 'none',
    fontFamily: typography.body.fontFamily,
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 500,
  } as React.CSSProperties,
};
