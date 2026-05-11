// Главный компонент UI плагина
import { useState, useEffect } from 'react';
import type { PluginMessage, ScanResult, DetectionResult, ScanScope, TokenSource, TokenPolicy, ReferenceSnapshot, Example, ExampleScope } from '../shared/types';
import { VIOLATION_CATEGORY, UI } from '../shared/strings';
import type { Category } from '../shared/strings';
import { Home } from './components/Home';
import { ReportView } from './components/ReportView';
import { ErrorCard } from './components/ErrorCard';
import { ReadyToScan } from './components/ReadyToScan';
import { Dashboard } from './components/Dashboard';
import { Header } from './components/ui/Header';
import { Button } from './components/ui/Button';
import { colors, typography, spacing } from './tokens';
import { Settings } from './components/Settings';
import { Spinner } from './components/ui/Spinner';
import { VerificationExample } from './components/VerificationExample';

type Status = 'idle' | 'scanning' | 'done';
type View = 'mode0' | 'verification-example' | 'scanner' | 'review' | 'settings';
type ParseExampleErrorCode = 'no-selection' | 'not-published' | 'no-tokens-found';

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
  const [fixedCount, setFixedCount] = useState<number>(0);
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);
  const [scanErrorCode, setScanErrorCode] = useState<'no-selection' | 'no-tokens' | 'no-ai-key' | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [tokenSource, setTokenSource] = useState<TokenSource>('variables');
  const [tokenPolicy, setTokenPolicy] = useState<TokenPolicy>('all-tokens');
  // Ф.17.6: snapshot теперь живёт в App (single owner). Home получает его обратно
  // как prop для рендера метрик; App пробрасывает в ReportView для AI prompt
  // component context (Ф.17.5) и unified search (Ф.17.8). Установка снаружи —
  // через onSnapshotReady, который Home вызывает при получении ds-scan-complete.
  const [snapshot, setSnapshot] = useState<ReferenceSnapshot | null>(null);

  // Ф.18a (шаг 18.7): локальный state эталона. clientStorage-персист — отдельный
  // шаг 18.5 (sandbox); в 18.7 example живёт только в памяти App. После
  // перезапуска плагина теряется — это ожидаемо для текущего шага.
  const [example, setExample] = useState<Example | null>(null);
  const [parseExampleLoading, setParseExampleLoading] = useState<boolean>(false);
  const [parseExampleErrorCode, setParseExampleErrorCode] =
    useState<ParseExampleErrorCode | null>(null);
  // Ф.18a (шаг 18.10): флаг «использовать ли example при следующем скане».
  // Confirm → true, Skip → false. Решение хранится отдельно от самого example,
  // чтобы Skip не сбрасывал выбранный эталон в state — пользователь может
  // передумать и пересканировать с эталоном без повторного выбора.
  const [useExampleOnNextScan, setUseExampleOnNextScan] = useState<boolean>(false);
  // Ф.18a (шаг 18.11): snapshot эталона на момент последнего скана.
  // Отделён от `example` (текущий выбранный эталон), чтобы Dashboard мог
  // показывать «vs example "…"» как условия прошлого скана даже после того,
  // как пользователь снял чип ✕ в Header (clear-example не сбрасывает этот
  // snapshot — обновляется только в handleStartScan). null до первого скана
  // и для скана-без-эталона (Skip).
  const [lastScanExample, setLastScanExample] = useState<Example | null>(null);

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
        // TEMP: remove in Ф.16.7
        console.log('[BUG-FIX-DEBUG] sample violation from detection', JSON.stringify(
          msg.data.violations[0],
          null,
          2
        ));
        // Инициализация selectedCategories только при ПЕРВОМ detection в сессии —
        // иначе после применения Fix новый detection-complete затрёт ручно снятые
        // пользователем галки. Триггер «первого detection» — detection === null
        // (handleReset сбрасывает его в null перед новым сканом).
        setDetection((prev) => {
          if (prev === null) {
            setFixedCount(0);
            const cats = new Set<Category>();
            for (let i = 0; i < msg.data.violations.length; i++) {
              cats.add(VIOLATION_CATEGORY[msg.data.violations[i].type]);
            }
            setSelectedCategories(cats);
          }
          return msg.data;
        });
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
      } else if (msg.type === 'fix-complete' && msg.data.success === true) {
        handleFixApplied(msg.data.nodeId);
      } else if (msg.type === 'parse-example-result') {
        // Ф.18a (шаг 18.7): результат парсинга эталона из sandbox.
        // - success → example !== null, error не задан;
        // - error   → example === null, error содержит код.
        // parse-example-progress в Ф.18a не используется (статичный «Parsing…»
        // в VerificationExample, см. шаг 18.6).
        setParseExampleLoading(false);
        if (msg.data.example !== null) {
          setExample(msg.data.example);
          setParseExampleErrorCode(null);
        } else {
          setExample(null);
          setParseExampleErrorCode(msg.data.error ?? 'no-tokens-found');
        }
      } else if (msg.type === 'example-loaded') {
        // Подтверждение clear-example от sandbox (или ответ get-example в 18.5+).
        // В 18.7 шлём clear-example только при ✕ на чипе — обновляем state.
        setExample(msg.data.example);
        setParseExampleErrorCode(null);
      }
    };

    window.addEventListener('message', handler);
    parent.postMessage({ pluginMessage: { type: 'get-ai-enabled' } }, '*');
    parent.postMessage({ pluginMessage: { type: 'get-api-key' } }, '*');
    // Ф.18a (шаг 18.5): запрос persisted example. В 18.7 эта строка отсутствовала,
    // из-за чего после перезапуска плагина чип «Example: …» терялся, хотя
    // sandbox теперь сохраняет эталон в clientStorage. Sandbox валидирует
    // nodeId и возвращает null, если узел удалён.
    parent.postMessage({ pluginMessage: { type: 'get-example' } }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // Mode 0 завершён — Ф.18a (шаг 18.7): переходим на VerificationExample,
  // а не сразу на scanner. Скан запустится после Confirm/Skip с экрана эталона
  // (см. handleVerificationExampleConfirm / handleVerificationExampleSkip).
  // Поведение и порядок сбросов state сохранены — они нужны для последующего
  // экрана scanner с чистым idle-состоянием.
  const handleMode0Complete = (source: TokenSource, policy: TokenPolicy) => {
    setTokenSource(source);
    setTokenPolicy(policy);
    setCurrentView('verification-example');
    setStatus('idle');           // было 'scanning' — теперь idle, чтобы показался Экран 2 (Audit areas)
    setProgress(null);
    setResult(null);
    setDetection(null);
    setScanErrorCode(null);      // на всякий случай сбросить, если был старый ErrorCard
    // Сбрасываем error эталона при заходе с Mode 0 — не показывать остатки
    // прошлой сессии. Сам example НЕ сбрасываем: пользователь мог уже выбрать
    // его и просто вернуться через Home, чтобы поправить tokenSource.
    setParseExampleErrorCode(null);
    setParseExampleLoading(false);
    // НЕ слать start-scan здесь — это делает handleStartScan по кнопке Scan file на Экране 2
  };

  // ─── Ф.18a: handlers экрана VerificationExample (шаг 18.7) ────────────
  const handleVerificationExampleScopeSelected = (scope: ExampleScope) => {
    setParseExampleLoading(true);
    setParseExampleErrorCode(null);
    sendMessage({ type: 'parse-example', data: { scope } });
  };

  // Общий handler очистки эталона. Используется и из VerificationExample
  // (✕ на чипе внутри компонента), и из Header (✕ на чипе под заголовком,
  // шаг 18.8). Sandbox по получении clear-example удаляет персистентный
  // example и отвечает example-loaded({example: null}) — обработка симметрична.
  const handleClearExample = () => {
    setExample(null);
    setParseExampleErrorCode(null);
    sendMessage({ type: 'clear-example' });
  };

  // Confirm/Skip — общая логика: переход на scanner в idle. Скан запустится
  // отдельно по кнопке Scan file через handleStartScan (как и до Ф.18a).
  // Ф.18a (шаг 18.10): различие confirm vs skip — в значении флага
  // `useExampleOnNextScan`. Confirm → true (детектор получит example как
  // priority override). Skip → false (детектор работает по старой логике,
  // даже если example в state остался от прошлой сессии). Сам example в
  // state при Skip НЕ сбрасываем — пользователь может вернуться и подтвердить.
  const handleVerificationExampleConfirm = () => {
    setUseExampleOnNextScan(true);
    setCurrentView('scanner');
  };
  const handleVerificationExampleSkip = () => {
    setUseExampleOnNextScan(false);
    setCurrentView('scanner');
  };

  const handleStartScan = () => {
    setStatus('scanning');
    setProgress(null);
    setResult(null);
    setDetection(null);
    // Ф.18a (шаг 18.10): передаём example в sandbox только если пользователь
    // подтвердил выбор через Confirm. На Skip отправляем null, чтобы детектор
    // не использовал эталон. См. types.ts → 'start-scan'.
    const exampleForScan: Example | null =
      useExampleOnNextScan && example !== null ? example : null;
    // Ф.18a (шаг 18.11): фиксируем snapshot эталона прошлого скана для
    // Dashboard sub-line «vs example …». Обновляется только здесь —
    // последующий clear-example не должен затирать условия прошлого скана.
    setLastScanExample(exampleForScan);
    sendMessage({
      type: 'start-scan',
      data: { scope, tokenSource, tokenPolicy, example: exampleForScan },
    });
  };

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
    setDetection(null);
    setProgress(null);
    setFixedCount(0);
    setScanErrorCode(null);
    setCurrentView('scanner');
  };

  // Навигация на Home (mode0) БЕЗ сброса state — отличается от handleReset.
  // Сохраняет detection / scope / selectedCategories / result / fixedCount /
  // scanErrorCode. Используется home-иконкой Header на Ready-to-scan и
  // (после Ф.16.5) на ReportView.
  const handleNavigateHome = () => {
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

  // Ф.18b.1.8.D1: для bulk-fix («Fix all») извлекаем `field` из violation.id
  // тем же способом, что и одиночный handleFix в ReportView. Формат id (см.
  // detector.makeViolationId):
  //   'nodeId_spacing_off_scale:<paddingLeft|paddingRight|...|itemSpacing|counterAxisSpacing>'
  //   'nodeId_radius_off_scale:<uniform|topLeft|topRight|bottomLeft|bottomRight>'
  // Для radius corner-имена мапятся в Figma-поля (ADR-002): 'uniform' →
  // 'cornerRadius' (fixer разворачивает в 4 биндинга). Для color/typography
  // id без `:`, field остаётся undefined — fix-violation совместим с прежним
  // контрактом (fixer проверяет field только для numeric-нарушений).
  const RADIUS_CORNER_TO_FIELD: { [corner: string]: string } = {
    uniform: 'cornerRadius',
    topLeft: 'topLeftRadius',
    topRight: 'topRightRadius',
    bottomLeft: 'bottomLeftRadius',
    bottomRight: 'bottomRightRadius',
  };

  function extractFieldForViolation(violationId: string, violationType: string): string | undefined {
    const idx = violationId.lastIndexOf(':');
    if (idx === -1) return undefined;
    const suffix = violationId.slice(idx + 1);
    if (violationType === 'radius_off_scale') {
      return RADIUS_CORNER_TO_FIELD[suffix];
    }
    if (violationType === 'spacing_off_scale') {
      return suffix;
    }
    return undefined;
  }

  const handleBulkFix = () => {
    if (!detection) return;
    const toFix = filteredViolations.filter((v) => v.suggestedTokenId !== null);
    if (toFix.length === 0) return;
    const fixedNodeIds = new Set<string>();
    for (let i = 0; i < toFix.length; i++) {
      const field = extractFieldForViolation(toFix[i].id, toFix[i].type);
      sendMessage({
        type: 'fix-violation',
        data: {
          nodeId: toFix[i].nodeId,
          tokenId: toFix[i].suggestedTokenId!,
          violationType: toFix[i].type,
          // Ф.18b.1.8.D1: field для spacing/radius; undefined для color/typography.
          field: field,
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
        <Header
          example={example}
          showExampleChip={true}
          onClearExample={handleClearExample}
        />
        <Settings onBack={() => setCurrentView('scanner')} />
        <ResizeHandle />
      </div>
    );
  }

  if (currentView === 'mode0') {
    // Шаг 18.8: на Home чип эталона НЕ рендерим (showExampleChip=false),
    // даже если example задан. Пользователь только начинает работу — чип
    // отвлекал бы от выбора library/source/policy.
    return (
      <div style={styles.root}>
        <Header icon="gear" onIconClick={() => setCurrentView('settings')} />
        <Home
          onComplete={handleMode0Complete}
          snapshot={snapshot}
          onSnapshotReady={setSnapshot}
        />
        <ResizeHandle />
      </div>
    );
  }

  if (currentView === 'verification-example') {
    // Шаг 18.8: на VerificationExample чип в Header НЕ рендерим — у компонента
    // свой чип внутри. Дублировать = двойной чип.
    return (
      <div style={styles.root}>
        <Header icon="home" onIconClick={handleNavigateHome} />
        <VerificationExample
          example={example}
          onScopeSelected={handleVerificationExampleScopeSelected}
          onClearExample={handleClearExample /* чип внутри VerificationExample */}
          onConfirm={handleVerificationExampleConfirm}
          onSkip={handleVerificationExampleSkip}
          isLoading={parseExampleLoading}
          errorCode={parseExampleErrorCode}
        />
        <ResizeHandle />
      </div>
    );
  }

  // Режим Review & Fix — пошаговое исправление нарушений
  if (currentView === 'review') {
    return (
      <ReportView
        violations={filteredViolations}
        onBack={handleBackToDashboard}
        onNavigateHome={handleNavigateHome}
        onOpenSettings={() => setCurrentView('settings')}
        metrics={{
          fixedCount,
          // Derived snapshot: filteredViolations — это остаток в фильтре
          // (после применения Fix исправленные удалены из detection.violations
          // и учтены в fixedCount). Сумма даёт исходное число нарушений
          // в выбранном пользователем фильтре selectedCategories.
          totalBefore: filteredViolations.length + fixedCount,
          scopeLabel: result?.scopeLabel ?? '',
        }}
        onCheckAgain={handleReset}
        onClearMarkers={() => sendMessage({ type: 'clear-markers' })}
        aiEnabled={aiEnabled}
        hasApiKey={hasApiKey}
        snapshot={snapshot}
        result={result}
        example={example}
        onClearExample={handleClearExample}
      />
    );
  }

  // currentView === 'scanner'
  return (
    <div style={styles.root}>
      <Header
        icon="home"
        onIconClick={handleNavigateHome}
        example={example}
        showExampleChip={true}
        onClearExample={handleClearExample}
      />

      {scanErrorCode === 'no-selection' && (
        <div style={{ marginTop: 'auto' }}>
          <ErrorCard
            title={UI.errorNoSelectionTitle}
            description={UI.errNoSelection}
            actionLabel={UI.errorNoSelectionAction}
            onAction={() => setScanErrorCode(null)}
          />
        </div>
      )}

      {scanErrorCode === 'no-tokens' && (
        <div style={{ marginTop: 'auto' }}>
          <ErrorCard
            title={UI.errorNoTokensTitle}
            description={UI.errNoTokens}
            actionLabel={UI.errorNoTokensAction}
            onAction={() => setScanErrorCode(null)}
          />
        </div>
      )}

      {!scanErrorCode && status === 'idle' && (
        <>
          <p style={styles.hint}>{UI.scanReady}</p>
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <ReadyToScan value={scope} onChange={setScope} />
          </div>
          <Button onClick={handleStartScan}>{UI.scanFile}</Button>
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
          <Button disabled>{UI.scanFile}</Button>
        </>
      )}

      {!scanErrorCode && status === 'done' && detection !== null && (
        <Dashboard
          detection={detection}
          result={result}
          lastScanExample={lastScanExample}
          selectedCategories={selectedCategories}
          onSelectedCategoriesChange={setSelectedCategories}
          filteredViolations={filteredViolations}
          onBulkFix={handleBulkFix}
          onReviewOne={() => setCurrentView('review')}
          onRescan={handleReset}
          onNavigateToNode={(nodeId, pageId) => sendMessage({ type: 'navigate-to-node', data: { nodeId, pageId } })}
        />
      )}

      {/* Сканирование завершено, но detection ещё не пришёл */}
      {!scanErrorCode && status === 'done' && detection === null && result !== null && (
        <p style={styles.hint}>{UI.analyzingResults}</p>
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
    padding: spacing.containerPadding,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.content,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
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
