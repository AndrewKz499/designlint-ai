// Главный компонент UI плагина
import { useState, useEffect } from 'react';
import type { PluginMessage, ScanResult, DetectionResult, Violation, ScanScope } from '../shared/types';
import { VIOLATION_TITLE, VIOLATION_CATEGORY, CATEGORY_META, UI } from '../shared/strings';
import type { Category } from '../shared/strings';
import { ScanDesignSystem } from './components/ScanDesignSystem';
import { ReviewFix } from './components/ReviewFix';
import { ScopeSelector } from './components/ScopeSelector';

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
        <h2 style={styles.title}>DesignLint AI</h2>
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
      <div style={styles.titleRow}>
        <h2 style={styles.title}>DesignLint AI</h2>
        <button style={styles.btnIcon} onClick={handleGoToMode0} title="Настройка дизайн-системы">
          ⚙️
        </button>
      </div>

      {status === 'idle' && (
        <>
          <p style={styles.hint}>Готов к сканированию</p>
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <ScopeSelector value={scope} onChange={setScope} />
          </div>
          <button style={styles.btnPrimary} onClick={handleStartScan}>
            Сканировать файл
          </button>
        </>
      )}

      {status === 'scanning' && (
        <>
          <p style={styles.hint}>
            {progress
              ? `Сканирование... Страница ${progress.current} из ${progress.total}`
              : 'Сканирование...'}
          </p>
          <button style={{ ...styles.btnPrimary, ...styles.btnDisabled }} disabled>
            Сканировать файл
          </button>
        </>
      )}

      {status === 'done' && detection !== null && (
        <>
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

          <button
            style={detection.violations.length === 0
              ? { ...styles.btnPrimary, ...styles.btnDisabled }
              : styles.btnPrimary}
            disabled={detection.violations.length === 0}
            onClick={() => setCurrentView('review')}
          >
            {UI.dashReviewOne}
          </button>
          <button style={styles.btnSecondary} onClick={handleReset}>
            Сканировать заново
          </button>
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
} satisfies Record<string, React.CSSProperties>;
