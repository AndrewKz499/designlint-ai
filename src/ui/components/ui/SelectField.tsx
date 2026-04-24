import { useState, useRef, useEffect } from 'react';
import { colors, typography, spacing, radii, borders } from '../../tokens';

export interface SelectOption {
  id: string;
  label: string;
  swatch?: string;  // hex-цвет для квадратика слева, опционально
  badge?: string;   // короткий бейдж справа от имени, например 'VAR' или 'STYLE'
}

interface Props {
  value: string;                          // выбранный id
  options: SelectOption[];
  onChange: (id: string) => void;
  label?: string;                         // подпись над селектом
  placeholder?: string;
}

export function SelectField({ value, options, onChange, label, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = options.find(o => o.id === value);

  const wrapStyle: React.CSSProperties = { position: 'relative', width: '100%' };

  const labelStyle: React.CSSProperties = {
    fontSize: typography.body.fontSize + 'px',
    color: colors.content,
    marginBottom: spacing.s200,
    display: 'block',
  };

  const selectStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.s200,
    width: '100%',
    height: 40,
    padding: `0 ${spacing.s300}px 0 ${spacing.s400}px`,
    background: colors.bgDefault,
    border: `${borders.stroke}px solid ${colors.border}`,
    borderRadius: radii.r200,
    cursor: 'pointer',
    fontSize: typography.body.fontSize + 'px',
    color: colors.content,
    boxSizing: 'border-box',
  };

  const swatchStyle = (hex: string): React.CSSProperties => ({
    width: 16, height: 16, borderRadius: 3,
    background: hex, flexShrink: 0,
    border: `${borders.stroke}px solid ${colors.border}`,
  });

  const valueStyle: React.CSSProperties = { flex: 1, textAlign: 'left' };

  const badgeStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    padding: '2px 6px',
    marginLeft: 'auto',
    background: colors.bgSecondary,
    color: colors.contentMuted,
    borderRadius: radii.r100,
    flexShrink: 0,
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: -1,
    background: colors.bgDefault,
    border: `${borders.stroke}px solid ${colors.border}`,
    borderTop: 'none',
    borderRadius: `0 0 ${radii.r200}px ${radii.r200}px`,
    zIndex: 100,
    maxHeight: 200,
    overflowY: 'auto',
    boxSizing: 'border-box',
  };

  const optionStyle = (isSelected: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: spacing.s200,
    padding: `${spacing.s300}px ${spacing.s400}px`,
    cursor: 'pointer',
    background: isSelected ? colors.bgSecondary : 'transparent',
    fontSize: typography.body.fontSize + 'px',
  });

  return (
    <div style={wrapStyle} ref={ref}>
      {label && <span style={labelStyle}>{label}</span>}
      <div style={selectStyle} onClick={() => setOpen(!open)}>
        {selected?.swatch && <div style={swatchStyle(selected.swatch)} />}
        <span style={valueStyle}>{selected?.label || placeholder || '—'}</span>
        {selected?.badge && <span style={badgeStyle}>{selected.badge}</span>}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke={colors.contentMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {open && (
        <div style={dropdownStyle}>
          {options.map(opt => (
            <div
              key={opt.id}
              style={optionStyle(opt.id === value)}
              onClick={() => { onChange(opt.id); setOpen(false); }}
            >
              {opt.swatch && <div style={swatchStyle(opt.swatch)} />}
              <span>{opt.label}</span>
              {opt.badge && <span style={badgeStyle}>{opt.badge}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
