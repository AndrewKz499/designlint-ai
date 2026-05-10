// VerificationExample — экран E2/E3 потока «эталон в кадре» (Ф.18a, шаг 18.6).
//
// Задача:
//   PO выбирает на холсте узел-эталон в одном из 4 режимов (Selection/Section/
//   Component/Layout). Sandbox парсит узел и возвращает Example со списком слотов
//   (один слот = один токен, использованный в эталоне). Этот компонент рисует
//   интерфейс выбора, отображает результат парсинга и предлагает Confirm/Skip.
//
// Что делает (ровно):
//   1. Рисует 4 таба через Radio (НЕ создаёт новый Tabs-компонент — это шаг
//      18.6.5, в Ф.18a НЕ входит, см. F18a-verification-example-step.md §18.6).
//   2. По клику на таб — onScopeSelected(scope). Родитель отправит parse-example.
//   3. По клику на ✕ чипа — onClearExample. Родитель отправит clear-example.
//   4. По «Scan example» — onConfirm. По «Skip» — onSkip.
//   5. errorCode и isLoading — отображаются. parse-example-progress в Ф.18a
//      не используется (статичный «Parsing…», см. шаг 18.6).
//
// Что НЕ делает (изоляция шага 18.6):
//   - Не отправляет сообщений в sandbox напрямую — все действия идут через props
//     (родитель в шаге 18.7 подключит parse-example/clear-example).
//   - Не подключается к App.tsx — это шаг 18.7.
//   - Не рендерит чип эталона в Header (это шаг 18.8).
//
// Дисциплина дизайн-системы:
//   Никаких нативных <button>/<input>. Только готовые примитивы из components/ui/*:
//   Radio, Button, Checkbox, Tag, Spinner. Цвета/типографика/spacing — через tokens.ts.
//
// Риск-B (Add another example): кнопка отображается disabled с нативным тултипом
//   через title-атрибут на обёртке (Button сам title не принимает; обёртка
//   div+title — допустимый патерн без локального стилизованного <button>).
//   Текст тултипа — verExampleAddAnotherTooltip.

import React from 'react';
import type { Example, ExampleScope, ExampleSlot } from '../../shared/types';
import { UI } from '../../shared/strings';
import { Button } from './ui/Button';
import { Radio } from './ui/Radio';
import { Checkbox } from './ui/Checkbox';
import { Tag } from './ui/Tag';
import { Spinner } from './ui/Spinner';
import { colors, typography, spacing } from '../tokens';

export interface VerificationExampleProps {
  example: Example | null;
  onScopeSelected: (scope: ExampleScope) => void;
  onClearExample: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  isLoading: boolean;
  errorCode: 'no-selection' | 'not-published' | 'no-tokens-found' | null;
}

// Список табов: порядок фиксируется макетом PO E2 (Selection → Section → Component → Layout).
const SCOPE_OPTIONS: ReadonlyArray<{ scope: ExampleScope; label: string }> = [
  { scope: 'selection', label: UI.verExampleTabSelection },
  { scope: 'section',   label: UI.verExampleTabSection },
  { scope: 'component', label: UI.verExampleTabComponent },
  { scope: 'layout',    label: UI.verExampleTabLayout },
];

// Группировка слотов по slotKind. Порядок групп фиксирован, чтобы UI был
// стабильным независимо от очерёдности слотов в example.slots.
const SLOT_KIND_ORDER: ReadonlyArray<ExampleSlot['slotKind']> = [
  'fill',
  'text-style',
  'spacing',
  'radius',
];

function groupLabel(kind: ExampleSlot['slotKind'], count: number): string {
  if (kind === 'fill')        return UI.verExampleSlotsFill(count);
  if (kind === 'text-style')  return UI.verExampleSlotsTextStyle(count);
  if (kind === 'spacing')     return UI.verExampleSlotsSpacing(count);
  return UI.verExampleSlotsRadius(count);
}

function errorMessage(code: NonNullable<VerificationExampleProps['errorCode']>): string {
  if (code === 'no-selection')   return UI.verExampleErrorNoSelection;
  if (code === 'not-published')  return UI.verExampleErrorNotPublished;
  return UI.verExampleErrorNoTokensFound;
}

export function VerificationExample({
  example,
  onScopeSelected,
  onClearExample,
  onConfirm,
  onSkip,
  isLoading,
  errorCode,
}: VerificationExampleProps): React.ReactElement {
  // Активный таб: scope текущего эталона, иначе подсветки нет.
  // Используем derived state (паттерн архитектуры — без useState/useEffect-синхронизации).
  const activeScope: ExampleScope | null = example !== null ? example.scope : null;

  // Группировка слотов в populated-state. Считаем один раз на render.
  const slotsByKind: Partial<Record<ExampleSlot['slotKind'], ExampleSlot[]>> = {};
  if (example !== null) {
    for (let i = 0; i < example.slots.length; i++) {
      const slot = example.slots[i];
      if (!slotsByKind[slot.slotKind]) slotsByKind[slot.slotKind] = [];
      slotsByKind[slot.slotKind]!.push(slot);
    }
  }

  // Кнопка Scan example активна только в populated-state (есть example, нет ошибки, не loading).
  const canConfirm = example !== null && !isLoading && errorCode === null;
  // Skip всегда доступен (кроме loading — чтобы пользователь не спамил во время парсинга).
  const canSkip = !isLoading;

  return (
    <div style={styles.root}>
      {/* Заголовок экрана */}
      <h3 style={styles.title}>{UI.verExampleTitle}</h3>

      {/* Табы 4 режимов через Radio. Layout-таб в Ф.18a показывает заглушку
          под табами (parser в sandbox шлёт no-tokens-found, см. шаг 18.6).
          Disabled во время loading, чтобы не накладывались параллельные парсинги. */}
      <div style={styles.tabsRow} role="radiogroup" aria-label={UI.verExampleTitle}>
        {SCOPE_OPTIONS.map((opt) => (
          <Radio
            key={opt.scope}
            name="verExampleScope"
            checked={activeScope === opt.scope}
            onChange={() => onScopeSelected(opt.scope)}
            label={opt.label}
            disabled={isLoading}
          />
        ))}
      </div>

      {/* Тело экрана — одно из 4 состояний.
          Приоритет: loading > error > populated > empty.
          isLoading проверяем первым, чтобы спиннер не перекрывался error/empty
          при гонках сообщений. */}
      {isLoading && (
        <div style={styles.loadingRow}>
          <Spinner size={20} />
          <span style={styles.bodyText}>{UI.verExampleParsing}</span>
        </div>
      )}

      {!isLoading && errorCode !== null && (
        <p style={styles.errorText}>{errorMessage(errorCode)}</p>
      )}

      {!isLoading && errorCode === null && example === null && (
        <p style={styles.bodyMuted}>{UI.verExampleEmpty}</p>
      )}

      {!isLoading && errorCode === null && example !== null && (
        <div style={styles.section}>
          {/* Чип Example: <name> ✕ через готовый Tag. */}
          <div>
            <Tag onRemove={onClearExample}>
              {UI.verExampleChip(example.name)}
            </Tag>
          </div>

          {/* Список слотов сгруппирован по slotKind. Чек-боксы сейчас всегда
              checked — interactivity подключим в Ф.18b (см. шаг 18.6). */}
          <div style={styles.caption}>{UI.verExampleSlotsTitle}</div>
          <div style={styles.slotsList}>
            {SLOT_KIND_ORDER.map((kind) => {
              const items = slotsByKind[kind];
              if (!items || items.length === 0) return null;
              return (
                <div key={kind} style={styles.slotGroup}>
                  <Checkbox
                    checked={true}
                    onChange={() => { /* Ф.18b: переключение группы слотов. */ }}
                    label={groupLabel(kind, items.length)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add another example — disabled с тултипом через title на обёртке
          (Button сам title не принимает). Риск-B шага 18.6: показываем UX-модель
          сразу, чтобы PO видел, что multi-example запланирован. */}
      <div title={UI.verExampleAddAnotherTooltip}>
        <Button variant="secondary" disabled>
          {UI.verExampleAddAnother}
        </Button>
      </div>

      {/* CTA: Scan example (primary) + Skip (secondary). Прижимаются вниз
          через marginTop: auto на блоке (паттерн ErrorCard / архитектура). */}
      <div style={styles.actions}>
        <Button onClick={onConfirm} disabled={!canConfirm}>
          {UI.verExampleConfirm}
        </Button>
        <Button variant="secondary" onClick={onSkip} disabled={!canSkip}>
          {UI.verExampleSkip}
        </Button>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────
// Все стили — inline через tokens.ts. В iframe Figma-плагина нет глобальных
// stylesheets, см. CLAUDE.md → «Ограничения среды».

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.content,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s400,
    minHeight: '100%',
  },
  title: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
    letterSpacing: typography.h3.letterSpacing,
    color: colors.content,
    margin: 0,
  },
  caption: {
    fontFamily: typography.bodyBold.fontFamily,
    fontSize: typography.bodyBold.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    lineHeight: typography.bodyBold.lineHeight,
    color: colors.content,
  },
  // Табы — горизонтальный ряд Radio. flexWrap, чтобы при узком окне переносились
  // на вторую строку, а не наезжали друг на друга.
  tabsRow: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s400,
    rowGap: spacing.s300,
  },
  loadingRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s300,
  },
  bodyText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.content,
  },
  bodyMuted: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.contentMuted,
    margin: 0,
  },
  errorText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.errorBorder,
    margin: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s300,
  },
  slotsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s200,
  },
  slotGroup: {
    display: 'flex',
    alignItems: 'center',
    padding: `${spacing.s200}px 0`,
  },
  // Прижим действий к низу — паттерн ErrorCard (см. CLAUDE.md → marginTop: auto).
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s200,
    marginTop: 'auto',
  },
};

export default VerificationExample;
