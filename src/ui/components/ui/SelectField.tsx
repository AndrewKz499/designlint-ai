import { useState, useRef, useEffect, useMemo } from 'react';
import { colors, typography, spacing, radii, borders } from '../../tokens';

export interface SelectOption {
  id: string;
  label: string;
  swatch?: string;  // hex-цвет для квадратика слева, опционально
  badge?: string;   // короткий бейдж справа от имени, например 'VAR' или 'STYLE'
  /**
   * Ф.17.8: имя логической секции внутри dropdown. Опции с одинаковым section
   * группируются под одним заголовком (см. `sectionLabels`).
   * Поведение поиска зависит от `searchableSection`: одна секция считается
   * фильтруемой (по умолчанию — нет, top-5 рекомендации не должны исчезать
   * от ввода в search). Опции без section рендерятся без заголовка как
   * единая группа (backward compat).
   */
  section?: string;
}

interface Props {
  value: string;                          // выбранный id
  options: SelectOption[];
  onChange: (id: string) => void;
  label?: string;                         // подпись над селектом
  placeholder?: string;
  /**
   * Если true — над списком опций рендерится <input> для substring-фильтра.
   * Ранжирование результатов: exact match → prefix match → contains, внутри
   * группы — алфавит по label. Бейдж VAR/STYLE сохраняется как в обычном режиме.
   * a11y: input имеет aria-label; навигация стрелками — отложена в v1.1.
   */
  searchable?: boolean;
  /**
   * Placeholder для поискового input'а. Игнорируется при searchable=false.
   */
  searchPlaceholder?: string;
  /**
   * Ф.17.8: маппинг section-id → отображаемое имя заголовка. Заголовок
   * рендерится перед первой опцией каждой секции в порядке появления опций.
   * Если для section нет записи в `sectionLabels` — заголовок не рисуется
   * (вместо этого опции группируются молча).
   */
  sectionLabels?: { [section: string]: string };
  /**
   * Ф.17.8: имя секции, к которой применяется substring-фильтр. Опции из других
   * секций показываются всегда (поведение для top-5 рекомендаций, которые не
   * должны исчезать от ввода в search). Игнорируется при searchable=false
   * или если не задано (тогда фильтр применяется ко всем опциям, как было до 17.8).
   */
  searchableSection?: string;
  /**
   * Ф.17.9: подсказка-сноска под списком опций внутри открытого dropdown.
   * Используется в library-режиме, чтобы объяснить, почему library Styles не
   * находятся поиском (Plugin API в library-режиме отдаёт только Variables —
   * это ограничение Figma, не баг плагина). Видна только когда dropdown открыт.
   * Если не задано — поведение dropdown идентично до Ф.17.9 (backward compat).
   */
  footerHint?: string;
}

/**
 * Сравнение по label, регистр игнорируется. Возвращает отрицательное/0/положительное.
 */
function compareLabels(a: SelectOption, b: SelectOption): number {
  const la = a.label.toLowerCase();
  const lb = b.label.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  return 0;
}

/**
 * Substring-фильтр + ранжирование (exact → prefix → contains, внутри группы — алфавит).
 * Пустой query → исходный порядок без сортировки (опции уже могут быть отсортированы потребителем).
 */
function filterAndRank(options: SelectOption[], query: string): SelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;

  const exact: SelectOption[] = [];
  const prefix: SelectOption[] = [];
  const contains: SelectOption[] = [];

  for (const opt of options) {
    const label = opt.label.toLowerCase();
    if (label === q) {
      exact.push(opt);
    } else if (label.startsWith(q)) {
      prefix.push(opt);
    } else if (label.includes(q)) {
      contains.push(opt);
    }
  }

  exact.sort(compareLabels);
  prefix.sort(compareLabels);
  contains.sort(compareLabels);

  return [...exact, ...prefix, ...contains];
}

/**
 * Ф.17.8: фильтр + ранжирование с учётом `searchableSection`. Опции из этой
 * секции пропускаются через `filterAndRank`; опции из других секций
 * показываются всегда. Порядок секций сохраняется по первому появлению
 * в исходном массиве (top-5 «Suggested» сверху, search — снизу).
 *
 * Если `searchableSection` не задан или query пустой — поведение совпадает
 * с обычным `filterAndRank`.
 */
function filterAndRankBySection(
  options: SelectOption[],
  query: string,
  searchableSection: string | undefined,
): SelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  if (!searchableSection) return filterAndRank(options, query);

  // Сохраняем порядок секций по первому появлению опции каждой секции.
  const seenSections: string[] = [];
  const bySection: { [s: string]: SelectOption[] } = {};
  for (const opt of options) {
    const key = opt.section ?? '';
    if (!(key in bySection)) {
      bySection[key] = [];
      seenSections.push(key);
    }
    bySection[key].push(opt);
  }

  const result: SelectOption[] = [];
  for (const section of seenSections) {
    if (section === searchableSection) {
      result.push(...filterAndRank(bySection[section], query));
    } else {
      result.push(...bySection[section]);
    }
  }
  return result;
}

export function SelectField({
  value,
  options,
  onChange,
  label,
  placeholder,
  searchable = false,
  searchPlaceholder,
  sectionLabels,
  searchableSection,
  footerHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // При закрытии dropdown — сбрасываем query, чтобы при следующем открытии
  // пользователь не видел остатков предыдущего поиска.
  useEffect(() => {
    if (!open) {
      setQuery('');
    } else if (searchable && inputRef.current) {
      // Автофокус на input при открытии — UX для substring-поиска.
      inputRef.current.focus();
    }
  }, [open, searchable]);

  const selected = options.find(o => o.id === value);

  // Derived: отфильтрованный/отранжированный список. Не дублируем в useState.
  // При наличии searchableSection фильтр применяется только к этой секции
  // (Ф.17.8 — top-5 рекомендации не должны исчезать от ввода в поиск).
  const visibleOptions = useMemo(
    () => (searchable ? filterAndRankBySection(options, query, searchableSection) : options),
    [searchable, options, query, searchableSection]
  );

  const wrapStyle: React.CSSProperties = { position: 'relative', width: '100%' };

  const labelStyle: React.CSSProperties = {
    fontSize: typography.body.fontSize,
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
    fontSize: typography.body.fontSize,
    color: colors.content,
    boxSizing: 'border-box',
    // Без overflow:hidden flex-children с длинным контентом могут выпирать
    // за правую границу контейнера на первом layout-проходе (chevron «вылетает»).
    overflow: 'hidden',
  };

  const swatchStyle = (hex: string): React.CSSProperties => ({
    width: 16, height: 16, borderRadius: 3,
    background: hex, flexShrink: 0,
    border: `${borders.stroke}px solid ${colors.border}`,
  });

  const valueStyle: React.CSSProperties = {
    flex: 1,
    textAlign: 'left',
    // minWidth: 0 — ключевой фикс: без него flex-child имеет min-width: auto
    // и не сжимается меньше intrinsic content width, выдавливая chevron
    // за границу контейнера. См. баг 7 ретеста.
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

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
    maxHeight: 240,
    overflowY: 'auto',
    boxSizing: 'border-box',
  };

  const optionStyle = (isSelected: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: spacing.s200,
    padding: `${spacing.s300}px ${spacing.s400}px`,
    cursor: 'pointer',
    background: isSelected ? colors.bgSecondary : 'transparent',
    fontSize: typography.body.fontSize,
  });

  // Стиль input'а внутри dropdown — выровнен по высоте 40px (как trigger).
  // Без своего border (полагается на dropdown), нижний разделитель — через borderBottom.
  const searchInputStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    padding: `0 ${spacing.s400}px`,
    border: 'none',
    borderBottom: `${borders.stroke}px solid ${colors.border}`,
    background: colors.bgDefault,
    color: colors.content,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const emptyStyle: React.CSSProperties = {
    padding: `${spacing.s300}px ${spacing.s400}px`,
    fontSize: typography.body.fontSize,
    color: colors.contentMuted,
  };

  // Ф.17.8: заголовок секции внутри dropdown. Стиль — типографика caption-like
  // (мелкий текст, muted-цвет), чтобы визуально отделять группы опций без
  // конкуренции с самими опциями.
  const sectionHeaderStyle: React.CSSProperties = {
    padding: `${spacing.s200}px ${spacing.s400}px`,
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
    color: colors.contentMuted,
    background: colors.bgDefault,
  };

  // Ф.17.9: подвал dropdown с подсказкой про library styles. Визуально отделён
  // верхней границей (как searchInput'у borderBottom в 17.8), цвет/размер
  // согласованы с sectionHeaderStyle (muted, 11px) — не конкурирует с опциями.
  const footerHintStyle: React.CSSProperties = {
    padding: `${spacing.s200}px ${spacing.s400}px`,
    fontSize: '11px',
    color: colors.contentMuted,
    borderTop: `${borders.stroke}px solid ${colors.border}`,
    background: colors.bgDefault,
    lineHeight: 1.4,
  };

  return (
    <div style={wrapStyle} ref={ref}>
      {label && <span style={labelStyle}>{label}</span>}
      <div style={selectStyle} onClick={() => setOpen(!open)}>
        {selected?.swatch && <div style={swatchStyle(selected.swatch)} />}
        <span style={valueStyle}>{selected?.label || placeholder || '—'}</span>
        {selected?.badge && <span style={badgeStyle}>{selected.badge}</span>}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke={colors.contentMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {open && (
        <div style={dropdownStyle}>
          {searchable && (
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder || 'Search…'}
              aria-label={label ? `Search ${label}` : 'Search options'}
              style={searchInputStyle}
              // onClick должен не закрывать dropdown через outside-click logic —
              // input лежит внутри ref, поэтому отдельная защита не нужна.
            />
          )}
          {(() => {
            // Ф.17.8: рендер с заголовками секций. Заголовок вставляется
            // перед первой опцией каждой новой секции, если для неё есть
            // запись в sectionLabels. Опции без section или с section без
            // записи в sectionLabels рендерятся без заголовка (backward compat).
            const items: React.ReactNode[] = [];
            let prevSection: string | undefined = undefined;
            let searchableSectionHasItems = false;
            for (const opt of visibleOptions) {
              if (opt.section !== prevSection) {
                if (opt.section && sectionLabels && sectionLabels[opt.section]) {
                  items.push(
                    <div key={'__h_' + opt.section} style={sectionHeaderStyle}>
                      {sectionLabels[opt.section]}
                    </div>
                  );
                }
                prevSection = opt.section;
              }
              if (searchableSection && opt.section === searchableSection) {
                searchableSectionHasItems = true;
              }
              items.push(
                <div
                  key={opt.id}
                  style={optionStyle(opt.id === value)}
                  onClick={() => { onChange(opt.id); setOpen(false); }}
                >
                  {opt.swatch && <div style={swatchStyle(opt.swatch)} />}
                  <span>{opt.label}</span>
                  {opt.badge && <span style={badgeStyle}>{opt.badge}</span>}
                </div>
              );
            }
            // "No matches": показываем, если searchable активен и query непустой,
            // но в search-секции (или вообще в видимом списке, если секция не задана)
            // нет результатов. Top-5 секция при этом по-прежнему рендерится.
            const q = query.trim();
            if (searchable && q.length > 0) {
              const showNoMatches = searchableSection
                ? !searchableSectionHasItems
                : visibleOptions.length === 0;
              if (showNoMatches) {
                items.push(<div key="__empty" style={emptyStyle}>No matches</div>);
              }
            } else if (searchable && visibleOptions.length === 0) {
              items.push(<div key="__empty" style={emptyStyle}>No matches</div>);
            }
            // Ф.17.9: footer hint — последний элемент списка, виден только
            // при открытом dropdown (этот блок целиком не рендерится при !open).
            if (footerHint) {
              items.push(
                <div key="__footer_hint" style={footerHintStyle}>{footerHint}</div>
              );
            }
            return items;
          })()}
        </div>
      )}
    </div>
  );
}
