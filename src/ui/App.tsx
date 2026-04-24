// Главный компонент UI плагина
import { useState, useEffect } from 'react';
import type { PluginMessage, ScanResult, DetectionResult, ScanScope } from '../shared/types';
import { VIOLATION_TITLE, VIOLATION_CATEGORY, CATEGORY_META, UI } from '../shared/strings';
import type { Category } from '../shared/strings';
import { ScanDesignSystem } from './components/ScanDesignSystem';
import { ReviewFix } from './components/ReviewFix';
import { ErrorCard } from './components/ErrorCard';
import { ScopeSelector } from './components/ScopeSelector';
import { Header } from './components/ui/Header';
import { Button } from './components/ui/Button';
import { Tag } from './components/ui/Tag';
import { Checkbox } from './components/ui/Checkbox';
import { colors, typography, spacing } from './tokens';
import { Settings } from './components/Settings';
import { Spinner } from './components/ui/Spinner';

type Status = 'idle' | 'scanning' | 'done';
type View = 'mode0' | 'scanner' | 'review' | 'settings';

function ResizeHandle() {
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    var startX = e.clientX;
    var startY = e.clientY;
    var startW = window.innerWidth;
    var startH = window.innerHeight;

    function onMove(ev: PointerEvent) {
      var w = startW + (ev.clientX - startX);
      var h = startH + (ev.clientY - startY);
      parent.postMessage({ pluginMessage: { type: 'resize', data: { width: w, height: h } } }, '*');
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  var style: React.CSSProperties = {
    position: 'fixed',
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    cursor: 'nwse-resize',
    zIndex: 1000,
  };
  return (
    <div style={style} onPointerDown={onPointerDown}>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M14 14L14 10 M14 14L10 14 M14 14L14 6 M14 14L6 14" stroke="#999" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

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
  const [totalBefore, setTotalBefore] = useState<number | null>(null);
  const [fixedCount, setFixedCount] = useState<number>(0);
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);
  const [scanErrorCode, setScanErrorCode] = useState<'no-selection' | 'no-tokens' | 'no-ai-key' | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);

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
        // Запоминаем исходные метрики только при ПЕРВОМ детекшене в сессии
        if (totalBefore === null) {
          setTotalBefore(msg.data.violations.length);
          setFixedCount(0);
        }
      } else if (msg.type === 'ai-enabled-response') {
        setAiEnabled(msg.data.enabled);
      } else if (msg.type === 'scan-error') {
        setScanErrorCode(msg.data.code);
        setStatus('idle');
        setProgress(null);
      } else if (msg.type === 'api-key-response') {
        setHasApiKey(msg.data.key !== null && msg.data.key !== '');
      } else if (msg.type === 'set-api-key-done') {
        setHasApiKey(true);
      }
    };

    window.addEventListener('message', handler);
    parent.postMessage({ pluginMessage: { type: 'get-ai-enabled' } }, '*');
    parent.postMessage({ pluginMessage: { type: 'get-api-key' } }, '*');
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
    setTotalBefore(null);
    setFixedCount(0);
  };

  // Возврат к Mode 0 (настройка дизайн-системы)
  const handleGoToMode0 = () => {
    setCurrentView('mode0');
  };

  // Возврат из Review & Fix на Dashboard (scanner)
  const handleBackToDashboard = () => {
    setCurrentView('scanner');
  };

  // Единый источник отфильтрованных нарушений — по выбранным чекбоксам категорий
  const filteredViolations = detection
    ? detection.violations.filter((v) => selectedCategories.has(VIOLATION_CATEGORY[v.type]))
    : [];

  const handleBulkFix = () => {
    if (!detection) return;
    const toFix = filteredViolations.filter((v) => v.suggestedTokenId !== null);
    if (toFix.length === 0) return;
    const fixedNodeIds = new Set<string>();
    for (let i = 0; i < toFix.length; i++) {
      sendMessage({
        type: 'fix-violation',
        data: {
          nodeId: toFix[i].nodeId,
          tokenId: toFix[i].suggestedTokenId!,
          violationType: toFix[i].type,
        },
      });
      fixedNodeIds.add(toFix[i].nodeId);
    }
    // Обновляем detection — убираем исправленные
    setDetection((prev) => {
      if (!prev) return prev;
      const remaining = prev.violations.filter((v) => !fixedNodeIds.has(v.nodeId));
      return { ...prev, violations: remaining };
    });
  };

  const handleFixApplied = (nodeId: string) => {
    setFixedCount(c => c + 1);
    setDetection((prev) => {
      if (!prev) return prev;
      const updated = prev.violations.filter((v) => v.nodeId !== nodeId);
      return { ...prev, violations: updated };
    });
  };

  // -------------------------------------------------------------------------

  if (currentView === 'settings') {
    return (
      <div style={styles.root}>
        <Header />
        <Settings onBack={() => setCurrentView('scanner')} />
        <ResizeHandle />
      </div>
    );
  }

  if (currentView === 'mode0') {
    return (
      <div style={styles.root}>
        <Header onSettingsClick={() => setCurrentView('settings')} />
        <ScanDesignSystem onComplete={handleMode0Complete} scope={scope} onScopeChange={setScope} />
        <ResizeHandle />
      </div>
    );
  }

  // Режим Review & Fix — пошаговое исправление нарушений
  if (currentView === 'review') {
    return (
      <ReviewFix
        violations={filteredViolations}
        onBack={handleBackToDashboard}
        onFixApplied={handleFixApplied}
        onSettingsClick={() => setCurrentView('settings')}
        metrics={{
          fixedCount,
          totalBefore: totalBefore ?? (detection?.violations.length ?? 0),
          scopeLabel: result?.scopeLabel ?? '',
        }}
        onCheckAgain={handleReset}
        onClearMarkers={() => sendMessage({ type: 'clear-markers' })}
        aiEnabled={aiEnabled}
        hasApiKey={hasApiKey}
      />
    );
  }

  // currentView === 'scanner'
  return (
    <div style={styles.root}>
      <Header onSettingsClick={handleGoToMode0} />

      {scanErrorCode === 'no-selection' && (
        <div style={{ marginTop: 'auto' }}>
          <ErrorCard
            title="Нет выделения"
            description={UI.errNoSelection}
            actionLabel="Попробовать снова"
            onAction={() => setScanErrorCode(null)}
          />
        </div>
      )}

      {scanErrorCode === 'no-tokens' && (
        <div style={{ marginTop: 'auto' }}>
          <ErrorCard
            title="Нет токенов дизайн-системы"
            description={UI.errNoTokens}
            actionLabel="Понятно"
            onAction={() => setScanErrorCode(null)}
          />
        </div>
      )}

      {!scanErrorCode && status === 'idle' && (
        <>
          <p style={styles.hint}>Готов к сканированию</p>
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <ScopeSelector value={scope} onChange={setScope} />
          </div>
          <Button onClick={handleStartScan}>Сканировать файл</Button>
        </>
      )}

      {!scanErrorCode && status === 'scanning' && (
        <>
          <div style={styles.scanningRow}>
            <p style={styles.scanningText}>
              {progress && progress.current > 0
                ? UI.scanningWithCount(progress.current)
                : UI.scanningIdle}
            </p>
            <Spinner size={24} />
          </div>
          <Button disabled>Сканировать файл</Button>
        </>
      )}

      {!scanErrorCode && status === 'done' && detection !== null && (
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
                // Группировка отфильтрованных — для счётчиков рядом с чекбоксом
                const filteredGrouped: Partial<Record<Category, typeof detection.violations>> = {};
                for (let i = 0; i < filteredViolations.length; i++) {
                  const v = filteredViolations[i];
                  const cat = VIOLATION_CATEGORY[v.type];
                  if (!filteredGrouped[cat]) filteredGrouped[cat] = [];
                  filteredGrouped[cat]!.push(v);
                }
                return (Object.keys(allGrouped) as Category[]).map((cat) => {
                  const items = allGrouped[cat]!;
                  const filteredCount = (filteredGrouped[cat] || []).length;
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
                            setSelectedCategories(next);
                          }}
                          label={CATEGORY_META[cat].label + ': ' + filteredCount}
                        />
                      </div>
                      {/* Список нарушений внутри категории */}
                      <div style={{ paddingLeft: spacing.s400 }}>
                        {items.map((v, idx) => (
                          <div
                            key={v.id}
                            style={{
                              padding: `${spacing.s200}px 0`,
                              fontSize: 14,
                              color: isSelected ? colors.content : colors.contentMuted,
                              cursor: 'pointer',
                              borderBottom: idx < items.length - 1 ? `1px solid ${colors.border}` : 'none',
                            }}
                            onClick={() => sendMessage({ type: 'navigate-to-node', data: { nodeId: v.nodeId, pageId: v.pageId } })}
                            title="Перейти к элементу"
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
            <p style={styles.hint}>{UI.dashEmpty}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.s200 }}>
            <Button
              disabled={detection.violations.length === 0}
              onClick={handleBulkFix}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.796 4.924L15 7.5l-4.146 3.038L12.472 16 8 12.6 3.528 16l1.618-5.462L1 7.5l5.204-1.576L8 1z" fill="currentColor"/></svg>}
            >
              {UI.dashFixAll}
            </Button>
            <Button
              variant="secondary"
              disabled={filteredViolations.length === 0}
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
      {!scanErrorCode && status === 'done' && detection === null && result !== null && (
        <p style={styles.hint}>Анализ результатов...</p>
      )}
      <ResizeHandle />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Стили
// ---------------------------------------------------------------------------

const styles = {
  root: {
    padding: spacing.s400,
    fontFamily: typography.body.fontFamily,
    fontSize: '13px',
    color: colors.content,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    boxSizing: 'border-box',
  },
  hint: {
    margin: `0 0 ${spacing.s400}px`,
    color: colors.contentMuted,
  },
  scanningRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s200,
    width: '100%',
    marginTop: spacing.s300,
    marginBottom: spacing.s400,
  },
  scanningText: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
    color: colors.content,
    margin: 0,
  },
} satisfies Record<string, React.CSSProperties>;
