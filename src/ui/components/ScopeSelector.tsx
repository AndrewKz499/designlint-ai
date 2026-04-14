// Сегмент-контрол выбора области сканирования
import type { ScanScope } from '../../shared/types';
import { SCOPE_LABEL, UI } from '../../shared/strings';

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
    fontSize: '11px',
    color: '#888',
    marginBottom: '4px',
  } as React.CSSProperties,
  group: {
    display: 'flex',
    width: '100%',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #E5E7EB',
  } as React.CSSProperties,
  btnIdle: {
    flex: 1,
    padding: '6px 8px',
    background: 'transparent',
    color: '#555',
    border: 'none',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    cursor: 'pointer',
  } as React.CSSProperties,
  btnActive: {
    flex: 1,
    padding: '6px 8px',
    background: '#0D99FF',
    color: '#fff',
    border: 'none',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 500,
  } as React.CSSProperties,
};
