// Главный компонент UI плагина
import { useState, useEffect } from 'react';
import type { PluginMessage, ScanResult, DetectionResult, Violation, ScanScope } from '../shared/types';
import { VIOLATION_TITLE, VIOLATION_CATEGORY, CATEGORY_META, UI } from '../shared/strings';
import type { Category } from '../shared/strings';
import { ScanDesignSystem } from './components/ScanDesignSystem';
import { ReviewFix } from './components/ReviewFix';
import { ScopeSelector } from './components/ScopeSelector';
import { Header } from './components/ui/Header';
import { Button } from './components/ui/Button';
import { Tag } from './components/ui/Tag';
import { colors, typography, spacing } from './tokens';

type Status = 'idle' | 'scanning' | 'done';
type View = 'mode0' | 'scanner' | 'review';

// Отправляет сообщение в sandbox
function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// Все точки нарушений — красные (единый стиль маркеров)
function severityDot(_severity: Violation['severity']): string {
  return '#FF3B30';
}

export function App() {
  const [currentView, setCurrentView] = useState<View>('mode0');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [scope, setScope] = useState<ScanScope>('selection');

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

          {/* Блок "По категориям" */}
          {detection.violations.length > 0 && (
            <div style={styles.groupBlock}>
              <div style={styles.groupTitle}>Категории</div>
              {((): React.ReactNode => {
                const counts: Partial<Record<Category, number>> = {};
                for (let i = 0; i < detection.violations.length; i++) {
                  const cat = VIOLATION_CATEGORY[detection.violations[i].type];
                  counts[cat] = (counts[cat] || 0) + 1;
                }
                return (Object.keys(counts) as Category[]).map((cat) => (
                  <div key={cat} style={styles.groupRow}>
                    <span>{CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label}</span>
                    <strong>{counts[cat]}</strong>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Блок "По страницам" */}
          {detection.violations.length > 0 && (
            <div style={styles.groupBlock}>
              <div style={styles.groupTitle}>Страницы</div>
              {((): React.ReactNode => {
                const pageCounts: Record<string, number> = {};
                for (let i = 0; i < detection.violations.length; i++) {
                  const name = detection.violations[i].pageName;
                  pageCounts[name] = (pageCounts[name] || 0) + 1;
                }
                return Object.keys(pageCounts).map((name) => (
                  <div key={name} style={styles.groupRow}>
                    <span>{name}</span>
                    <strong>{pageCounts[name]}</strong>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Список нарушений — первые 20 */}
          {detection.violations.length > 0 && (
            <ul style={styles.violationList}>
              {detection.violations.slice(0, 20).map((v) => (
                <li
                  key={v.id}
                  style={styles.violationItem}
                  onClick={() => sendMessage({ type: 'navigate-to-node', data: { nodeId: v.nodeId, pageId: v.pageId } })}
                  title="Перейти к элементу"
                >
                  <span
                    style={{ ...styles.dot, background: severityDot(v.severity) }}
                  />
                  <div style={styles.violationBody}>
                    <div style={styles.violationName}>{VIOLATION_TITLE[v.type]}</div>
                    <div style={styles.violationMsg}>{v.nodeName}</div>
                    {v.suggestedToken !== null && (
                      <div style={styles.suggestion}>→ {v.suggestedToken}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {detection.violations.length === 0 && (
            <p style={styles.hint}>{UI.dashEmpty}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button disabled={detection.violations.length === 0} onClick={() => setCurrentView('review')}>
              {UI.dashReviewOne}
            </Button>
            <Button variant="secondary" onClick={handleReset}>Сканировать заново</Button>
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
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
  },
  btnIcon: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '2px 4px',
    lineHeight: 1,
  },
  hint: {
    margin: '0 0 16px',
    color: '#555',
  },
  healthScore: {
    margin: '0 0 12px',
    fontSize: '15px',
  },
  groupBlock: {
    marginBottom: '16px',
  },
  groupTitle: {
    fontWeight: 600,
    fontSize: '13px',
    marginBottom: '6px',
  },
  groupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
    fontSize: '13px',
  },
  summaryBlock: {
    marginBottom: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  summaryRow: {
    fontSize: '13px',
  },
  violationList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    maxHeight: '260px',
    overflowY: 'auto' as const,
  },
  violationItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    cursor: 'pointer',
  },
  dot: {
    flexShrink: 0,
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginTop: '3px',
  },
  violationBody: {
    flex: 1,
    minWidth: 0,
  },
  violationName: {
    fontWeight: 500,
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  violationMsg: {
    color: '#444',
    lineHeight: 1.4,
  },
  suggestion: {
    color: '#0D99FF',
    marginTop: '2px',
  },
  btnPrimary: {
    display: 'block',
    width: '100%',
    padding: '10px 0',
    background: '#0D99FF',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnDisabled: {
    background: '#a0cff7',
    cursor: 'not-allowed',
  },
  btnSecondary: {
    display: 'block',
    width: '100%',
    padding: '10px 0',
    background: 'transparent',
    color: '#0D99FF',
    border: '1px solid #0D99FF',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  contextChip: {
    display: 'inline-block',
    padding: '4px 10px',
    background: '#F3F4F6',
    borderRadius: '6px',
    fontSize: '11px',
    color: '#555',
    marginBottom: '12px',
  } as React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
