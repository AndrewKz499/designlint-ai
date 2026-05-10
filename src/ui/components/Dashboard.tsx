// Dashboard — агрегатор нарушений по категориям.
// Показывается на Экране 2 (currentView='scanner') в фазе status='done',
// когда detection пришёл из sandbox. Содержит: H3-заголовок, Tag с context-
// бейджем (область + число обойдённых нод), список категорий с Checkbox
// и вложенным списком нарушений, три CTA — Fix all / Review one by one / Rescan.
//
// Layout родителя (Header + ResizeHandle) остаётся в App.tsx — Dashboard
// рендерит только содержимое контейнера.
//
// В макете эталон 03-reviewfix.png (фрейм 148:12219). Имя агрегатора в коде —
// Dashboard, фрейм назван ReviewFix; расхождение принято PO в Ф.16.4.
// См. context/glossary/Glossary.md → раздел «Технические состояния и протокол».

import type { DetectionResult, Example, ScanResult, Violation } from '../../shared/types';
import { UI, VIOLATION_TITLE, VIOLATION_CATEGORY, CATEGORY_META } from '../../shared/strings';
import type { Category } from '../../shared/strings';
import { Button } from './ui/Button';
import { Tag } from './ui/Tag';
import { Checkbox } from './ui/Checkbox';
import { colors, typography, spacing } from '../tokens';

interface Props {
  detection: DetectionResult; // non-null: родитель уже отфильтровал
  result: ScanResult | null;
  /**
   * Ф.18a (шаг 18.11): эталон, с которым был запущен последний скан.
   * null — скан без эталона (Skip) или эталон ещё не задан. Отделён от
   * текущего `example` в App, чтобы sub-line отражала условия прошлого
   * скана и не мигала при ✕ на чипе в Header.
   */
  lastScanExample: Example | null;
  selectedCategories: Set<Category>;
  onSelectedCategoriesChange: (next: Set<Category>) => void;
  filteredViolations: Violation[];
  onBulkFix: () => void;
  onReviewOne: () => void;
  onRescan: () => void;
  onNavigateToNode: (nodeId: string, pageId: string) => void;
}

export function Dashboard({
  detection,
  result,
  lastScanExample,
  selectedCategories,
  onSelectedCategoriesChange,
  filteredViolations,
  onBulkFix,
  onReviewOne,
  onRescan,
  onNavigateToNode,
}: Props) {
  return (
    <>
      <div style={{
        fontFamily: typography.h3.fontFamily,
        fontWeight: typography.h3.fontWeight,
        fontSize: typography.h3.fontSize,
        lineHeight: typography.h3.lineHeight,
        letterSpacing: typography.h3.letterSpacing,
        color: colors.content,
        marginBottom: spacing.s200,
      }}>
        {UI.dashAreasTitle}
      </div>
      {result && (
        <div style={{ marginBottom: spacing.s400 }}>
          <Tag>{UI.dashContextBadge(result.scopeLabel, result.totalNodesScanned)}</Tag>
          {lastScanExample !== null && (
            <div style={{
              marginTop: spacing.s200,
              fontSize: typography.body.fontSize,
              color: colors.contentMuted,
            }}>
              {UI.dashVsExample(lastScanExample.name)}
            </div>
          )}
        </div>
      )}

      {detection.violations.length > 0 && (
        <div style={{ marginBottom: spacing.s300 }}>
          {((): React.ReactNode => {
            // Группировка всех нарушений — основа списка чекбоксов
            const allGrouped: Partial<Record<Category, typeof detection.violations>> = {};
            for (let i = 0; i < detection.violations.length; i++) {
              const v = detection.violations[i];
              const cat = VIOLATION_CATEGORY[v.type];
              if (!allGrouped[cat]) allGrouped[cat] = [];
              allGrouped[cat]!.push(v);
            }
            return (Object.keys(allGrouped) as Category[]).map((cat) => {
              const items = allGrouped[cat]!;
              const isSelected = selectedCategories.has(cat);
              return (
                <div key={cat} style={{ marginBottom: spacing.s200 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: `${spacing.s200}px 0`,
                  }}>
                    <Checkbox
                      checked={isSelected}
                      onChange={(checked) => {
                        const next = new Set(selectedCategories);
                        if (checked) { next.add(cat); } else { next.delete(cat); }
                        onSelectedCategoriesChange(next);
                      }}
                      label={CATEGORY_META[cat].label + ': ' + items.length}
                    />
                  </div>
                  {/* Список нарушений внутри категории */}
                  <div style={{ paddingLeft: spacing.s400 }}>
                    {items.map((v, idx) => (
                      <div
                        key={v.id}
                        style={{
                          padding: `${spacing.s200}px 0`,
                          fontSize: typography.body.fontSize,
                          color: isSelected ? colors.content : colors.contentMuted,
                          cursor: 'pointer',
                          borderBottom: idx < items.length - 1 ? `1px solid ${colors.border}` : 'none',
                        }}
                        onClick={() => onNavigateToNode(v.nodeId, v.pageId)}
                        title={UI.navigateToNodeTitle}
                      >
                        <span style={{ color: colors.contentMuted, marginRight: spacing.s200 }}>{idx + 1}</span>
                        <span>{VIOLATION_TITLE[v.type]} {v.nodeName}</span>
                        {v.suggestedToken !== null && (
                          <span style={{ color: colors.accent }}> → {v.suggestedToken}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {detection.violations.length === 0 && (
        <p style={{ margin: `0 0 ${spacing.s400}px`, color: colors.contentMuted }}>{UI.dashEmpty}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.s200 }}>
        <Button
          disabled={detection.violations.length === 0}
          onClick={onBulkFix}
          icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.796 4.924L15 7.5l-4.146 3.038L12.472 16 8 12.6 3.528 16l1.618-5.462L1 7.5l5.204-1.576L8 1z" fill="currentColor"/></svg>}
        >
          {UI.dashFixAll}
        </Button>
        <Button
          variant="secondary"
          disabled={filteredViolations.length === 0}
          onClick={onReviewOne}
        >
          {UI.dashReviewOne}
        </Button>
        <Button
          variant="secondary"
          onClick={onRescan}
        >
          {UI.dashRescan}
        </Button>
      </div>
    </>
  );
}
