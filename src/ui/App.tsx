// Главный компонент UI плагина
import { useState, useEffect } from 'react';
import type { PluginMessage, ScanResult, DetectionResult, ScanScope } from '../shared/types';
import { VIOLATION_TITLE, VIOLATION_CATEGORY, CATEGORY_META, UI } from '../shared/strings';
import type { Category } from '../shared/strings';
import { ScanDesignSystem } from './components/ScanDesignSystem';
import { ReviewFix } from './components/ReviewFix';
import { ScopeSelector } from './components/ScopeSelector';
import { Header } from './components/ui/Header';
import { Button } from './components/ui/Button';
import { Tag } from './components/ui/Tag';
import { Checkbox } from './components/ui/Checkbox';
import { colors, typography, spacing } from './tokens';

type Status = 'idle' | 'scanning' | 'done';
type View = 'mode0' | 'scanner' | 'review';

// Отправляет сообщение в sandbox
function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

export function App() {
  const [currentView, setCurrentView] = useState<View>('mode0');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [scope, setScope] = useState<ScanScope>('selection');
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(new Set());

  useEffect(() => {
    if (detection && detection.violations.length > 0) {
      const cats = new Set<Category>();
      for (let i = 0; i < detection.violations.length; i++) {
        cats.add(VIOLATION_CATEGORY[detection.violations[i].type]);
      }
      setSelectedCategories(cats);
    }
  }, [detection]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (!msg) return;

      if (msg.type === 'scan-progress') {
        setProgress(msg.data);
      } else if (msg.type === 'scan-complete') {
        setResult(msg.data);
        setStatus('done');
      } else if (msg.type === 'detection-complete') {
        setDetection(msg.data);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Mode 0 завершён — переходим к сканеру и сразу запускаем сканирование
  const handleMode0Complete = () => {
    setCurrentView('scanner');
    setStatus('scanning');
    setProgress(null);
    setResult(null);
    setDetection(null);
    sendMessage({ type: 'start-scan', data: { scope } });
  };

  const handleStartScan = () => {
    setStatus('scanning');
    setProgress(null);
    setResult(null);
    setDetection(null);
    sendMessage({ type: 'start-scan', data: { scope } });
  };

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
    setDetection(null);
    setProgress(null);
  };

  // Возврат к Mode 0 (настройка дизайн-системы)
  const handleGoToMode0 = () => {
    setCurrentView('mode0');
  };

  // Возврат из Review & Fix на Dashboard (scanner)
  const handleBackToDashboard = () => {
    setCurrentView('scanner');
  };

  const handleFixApplied = (nodeId: string) => {
    setDetection((prev) => {
      if (!prev) return prev;
      const updated = prev.violations.filter((v) => v.nodeId !== nodeId);
      return { ...prev, violations: updated };
    });
  };

  // -------------------------------------------------------------------------

  if (currentView === 'mode0') {
    return (
      <div style={styles.root}>
        <Header />
        <ScanDesignSystem onComplete={handleMode0Complete} scope={scope} onScopeChange={setScope} />
      </div>
    );
  }

  // Режим Review & Fix — пошаговое исправление нарушений
  if (currentView === 'review') {
    return (
      <ReviewFix
        violations={detection !== null ? detection.violations : []}
        onBack={handleBackToDashboard}
        onFixApplied={handleFixApplied}
      />
    );
  }

  // currentView === 'scanner'
  return (
    <div style={styles.root}>
      <Header onSettingsClick={handleGoToMode0} />

      {status === 'idle' && (
        <>
          <p style={styles.hint}>Готов к сканированию</p>
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <ScopeSelector value={scope} onChange={setScope} />
          </div>
          <Button onClick={handleStartScan}>Сканировать файл</Button>
        </>
      )}

      {status === 'scanning' && (
        <>
          <p style={styles.hint}>
            {progress && progress.current > 0
              ? UI.scanningWithCount(progress.current)
              : UI.scanningIdle}
          </p>
          <Button disabled>Сканировать файл</Button>
        </>
      )}

      {status === 'done' && detection !== null && (
        <>
          <div style={{
            fontFamily: typography.heading.fontFamily,
            fontWeight: typography.heading.fontWeight,
            fontSize: typography.heading.fontSize,
            lineHeight: typography.heading.lineHeight,
            letterSpacing: typography.heading.letterSpacing,
            color: colors.textDefault,
            marginBottom: spacing.s200,
          }}>
            {UI.dashErrorsTitle(detection.violations.length)}
          </div>
          {result && (
            <div style={{ marginBottom: spacing.s300 }}>
              <Tag>{UI.dashContextBadge(result.scopeLabel, result.totalNodesScanned)}</Tag>
            </div>
          )}

          {detection.violations.length > 0 && (
            <div style={{ marginBottom: spacing.s300 }}>
              {((): React.ReactNode => {
                // Группируем нарушения по категориям
                const grouped: Partial<Record<Category, typeof detection.violations>> = {};
                for (let i = 0; i < detection.violations.length; i++) {
                  const v = detection.violations[i];
                  const cat = VIOLATION_CATEGORY[v.type];
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat]!.push(v);
                }
                return (Object.keys(grouped) as Category[]).map((cat) => {
                  const items = grouped[cat]!;
                  const isSelected = selectedCategories.has(cat);
                  return (
                    <div key={cat} style={{ marginBottom: spacing.s200 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `${spacing.s200}px 0`,
                      }}>
                        <Checkbox
                          checked={isSelected}
                          onChange={(checked) => {
                            const next = new Set(selectedCategories);
                            if (checked) { next.add(cat); } else { next.delete(cat); }
                            setSelectedCategories(next);
                          }}
                          label={CATEGORY_META[cat].emoji + ' ' + CATEGORY_META[cat].label}
                        />
                        <strong style={{ color: colors.textDefault, fontSize: typography.body.fontSize }}>{items.length}</strong>
                      </div>
                      {/* Список нарушений внутри категории */}
                      <div style={{ paddingLeft: 28 }}>
                        {items.map((v, idx) => (
                          <div
                            key={v.id}
                            style={{
                              padding: `${spacing.s200}px 0`,
                              fontSize: 14,
                              color: isSelected ? colors.textBody : colors.textMuted,
                              cursor: 'pointer',
                              borderBottom: idx < items.length - 1 ? `1px solid ${colors.borderDefault}` : 'none',
                            }}
                            onClick={() => sendMessage({ type: 'navigate-to-node', data: { nodeId: v.nodeId, pageId: v.pageId } })}
                            title="Перейти к элементу"
                          >
                            <div>{VIOLATION_TITLE[v.type]}</div>
                            <div style={{ color: colors.textMuted, fontSize: 13 }}>
                              {v.nodeName}
                              {v.suggestedToken !== null && <span style={{ color: colors.accentBlue }}> → {v.suggestedToken}</span>}
                            </div>
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
            <p style={styles.hint}>{UI.dashEmpty}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.s200 }}>
            <Button
              disabled={detection.violations.length === 0}
              onClick={() => {/* TODO: bulk fix в Фазе 10.C */}}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.796 4.924L15 7.5l-4.146 3.038L12.472 16 8 12.6 3.528 16l1.618-5.462L1 7.5l5.204-1.576L8 1z" fill="currentColor"/></svg>}
            >
              {UI.dashFixAll}
            </Button>
            <Button
              variant="secondary"
              disabled={detection.violations.length === 0}
              onClick={() => setCurrentView('review')}
            >
              {UI.dashReviewOne}
            </Button>
            <Button
              variant="secondary"
              onClick={handleReset}
            >
              {UI.dashRescan}
            </Button>
          </div>
        </>
      )}

      {/* Сканирование завершено, но detection ещё не пришёл */}
      {status === 'done' && detection === null && result !== null && (
        <p style={styles.hint}>Анализ результатов...</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Стили
// ---------------------------------------------------------------------------

const styles = {
  root: {
    padding: '20px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#1a1a1a',
  },
  hint: {
    margin: '0 0 16px',
    color: '#555',
  },
} satisfies Record<string, React.CSSProperties>;
