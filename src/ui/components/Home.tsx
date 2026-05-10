import { useState, useEffect, useMemo } from 'react';
import type {
  PluginMessage,
  ReferenceSnapshot,
  TokenSource,
  TokenPolicy,
  SelectedSource,
} from '../../shared/types';
import { UI } from '../../shared/strings';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { Radio } from './ui/Radio';
import { SelectField, SelectOption } from './ui/SelectField';
import { colors, typography, spacing } from '../tokens';

type Step = 'scanning' | 'ready';

interface DiscoveredLibrary {
  key: string;
  name: string;
  tokenCount: number;
}

function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

interface Props {
  onComplete: (tokenSource: TokenSource, tokenPolicy: TokenPolicy) => void;
  // Ф.17.6: snapshot теперь живёт в App (single owner). Home получает его как
  // читающий потребитель — для рендера метрик в Source-of-truth и авто-коррекции
  // tokenSource при пустом источнике.
  snapshot: ReferenceSnapshot | null;
  // Ф.17.6: callback наверх — Home сообщает App, что sandbox прислал ds-scan-complete.
  // App кладёт snapshot в свой state и пробрасывает обратно в Home через prop snapshot.
  onSnapshotReady: (snapshot: ReferenceSnapshot) => void;
}

function categoryLabel(cat: string): string {
  if (cat === 'color') return 'Color';
  if (cat === 'typography' || cat === 'text') return 'Text';
  if (cat === 'spacing') return 'Spacing';
  if (cat === 'radius') return 'Radius';
  if (cat === 'effect') return 'Effect';
  return cat;
}

function formatBreakdown(byCat: Record<string, number>): string {
  const parts: string[] = [];
  for (const cat of Object.keys(byCat)) {
    if (byCat[cat] > 0) parts.push(categoryLabel(cat) + ': ' + byCat[cat]);
  }
  return parts.join(' · ');
}

export function Home({ onComplete, snapshot, onSnapshotReady }: Props) {
  const [step, setStep] = useState<Step>('scanning');
  const [tokenSource, setTokenSource] = useState<TokenSource>('variables');
  const [tokenPolicy, setTokenPolicy] = useState<TokenPolicy>('all-tokens');

  // Single-select model (Ф.16.6.5).
  // selectedSource — единый источник истины для скана:
  //   { type: 'local' } или { type: 'library'; libraryKey }.
  // libraries — список доступных подключённых библиотек из discoverSources.
  const [libraries, setLibraries] = useState<DiscoveredLibrary[]>([]);
  const [selectedSource, setSelectedSource] = useState<SelectedSource>({ type: 'local' });
  // Предыдущее состояние для отката при set-selected-source-done { success: false }.
  const [pendingPrevSource, setPendingPrevSource] = useState<SelectedSource | null>(null);

  // На mount: запрос discover-sources (auto-refresh — решение PO 3) и persisted selected source.
  useEffect(() => {
    sendMessage({ type: 'discover-sources' });
    sendMessage({ type: 'get-selected-source' });
  }, []);

  // Слушатель сообщений от sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (msg === undefined) return;

      if (msg.type === 'sources-discovered') {
        setLibraries(msg.data.libraries);
      } else if (msg.type === 'selected-source-loaded') {
        setSelectedSource(msg.data.source);
      } else if (msg.type === 'set-selected-source-done') {
        if (!msg.data.success && pendingPrevSource !== null) {
          // Откат на предыдущий source при ошибке записи
          setSelectedSource(pendingPrevSource);
        }
        setPendingPrevSource(null);
      } else if (msg.type === 'library-unavailable') {
        // Sandbox уже сделал figma.notify + переключил persisted на local.
        // UI тихо обновляет state — не дублируем уведомление.
        setSelectedSource({ type: 'local' });
      } else if (msg.type === 'ds-scan-progress') {
        // Ф.16.6.5: используем только current/total. stage оставлен для backward
        // compat, но в UI больше не отображается (Тiket B).
      } else if (msg.type === 'ds-scan-complete') {
        // Ф.17.6: snapshot владеет App.tsx — поднимаем через onSnapshotReady,
        // обратно прилетает в Home через prop `snapshot`.
        onSnapshotReady(msg.data.snapshot);
        setStep('ready');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [pendingPrevSource, onSnapshotReady]);

  // Авто-старт скана: при наличии persisted selected source запускаем ds-scan-confirmed.
  // Sandbox с Ф.16.6.5 читает persisted selectedSource сам — поле enabledSources
  // больше не нужно (опционально, sandbox его игнорирует).
  useEffect(() => {
    if (step === 'scanning') {
      sendMessage({ type: 'ds-scan-confirmed', data: {} });
    }
  }, [step]);

  // Подсчёт статистики из snapshot (для блока Source of truth при Local).
  const stats = useMemo(() => {
    const stylesByCategory: Record<string, number> = {};
    const variablesByCategory: Record<string, number> = {};
    let stylesTotal = 0;
    let variablesTotal = 0;
    let semanticCount = 0;
    if (snapshot !== null) {
      for (const t of snapshot.tokens) {
        if (t.kind === 'paintStyles' || t.kind === 'textStyles') {
          stylesByCategory[t.category] = (stylesByCategory[t.category] || 0) + 1;
          stylesTotal += 1;
        } else if (t.kind === 'variables') {
          variablesByCategory[t.category] = (variablesByCategory[t.category] || 0) + 1;
          variablesTotal += 1;
          if (t.isSemantic === true) semanticCount += 1;
        }
      }
    }
    return { stylesByCategory, variablesByCategory, stylesTotal, variablesTotal, semanticCount };
  }, [snapshot]);

  // Авто-коррекция выбора при Local, если выбранный источник пуст
  useEffect(() => {
    if (snapshot === null) return;
    if (selectedSource.type !== 'local') return;
    if (tokenSource === 'variables' && stats.variablesTotal === 0) {
      setTokenSource(stats.stylesTotal > 0 ? 'styles' : 'both');
    } else if (tokenSource === 'styles' && stats.stylesTotal === 0) {
      setTokenSource(stats.variablesTotal > 0 ? 'variables' : 'both');
    }
  }, [snapshot, tokenSource, stats.stylesTotal, stats.variablesTotal, selectedSource.type]);

  // Handlers ---------------------------------------------------------------

  function persistSource(next: SelectedSource): void {
    setPendingPrevSource(selectedSource);
    setSelectedSource(next);
    sendMessage({ type: 'set-selected-source', data: { source: next } });
  }

  function handleSelectConnected(): void {
    if (libraries.length === 0) return;
    // Если уже Connected — не дёргаем sandbox.
    if (selectedSource.type === 'library') return;
    // По умолчанию выбираем первую библиотеку, если ничего не выбрано.
    persistSource({ type: 'library', libraryKey: libraries[0].key });
  }

  function handleSelectLocal(): void {
    if (selectedSource.type === 'local') return;
    persistSource({ type: 'local' });
  }

  function handleLibraryChange(libraryKey: string): void {
    persistSource({ type: 'library', libraryKey });
  }

  // ─── Render: scanning ──────────────────────────────────────────────────
  if (step === 'scanning') {
    return (
      <div style={styles.root}>
        <h3 style={styles.title}>{UI.sdScanningTitle}</h3>
        <div style={styles.scanningRow}>
          <p style={styles.subtitle}>{UI.sdScanning}</p>
          <Spinner size={20} />
        </div>
        <Button disabled>{UI.sdScanSelected}</Button>
      </div>
    );
  }

  // ─── Render: ready ─────────────────────────────────────────────────────
  const hasLibraries = libraries.length > 0;
  const isConnected = selectedSource.type === 'library';
  const isLocal = selectedSource.type === 'local';

  // Dropdown options для подключённых библиотек.
  const libraryOptions: SelectOption[] = libraries.map((lib) => ({
    id: lib.key,
    label: lib.name,
  }));
  const selectedLibraryKey =
    selectedSource.type === 'library' ? selectedSource.libraryKey : (libraries[0]?.key ?? '');

  // Source-of-truth при Connected — метрики выбранной библиотеки.
  // Поскольку tokenCount из discoverSources может быть 0 (sandbox его не считает
  // на этапе discover), используем разбивку из snapshot.tokens, если snapshot
  // построен по library-источнику.
  const selectedLibraryName =
    libraries.find((l) => l.key === selectedLibraryKey)?.name ?? '';

  const variablesDisabled = stats.variablesTotal === 0;
  const stylesDisabled = stats.stylesTotal === 0;
  const stylesActive = tokenSource === 'styles' || tokenSource === 'both';
  const variablesActive = tokenSource === 'variables' || tokenSource === 'both';

  return (
    <div style={styles.root}>
      {/* Library content — выбор источника (Ф.16.6.5 single-select) */}
      <div style={styles.section}>
        <div style={styles.caption}>Library content</div>

        <Radio
          name="librarySource"
          checked={isConnected}
          onChange={handleSelectConnected}
          label={UI.connectedLibraryLabel}
          disabled={!hasLibraries}
          ariaLabel={UI.connectedLibraryAria}
        />
        {!hasLibraries && (
          <div style={styles.radioHint}>{UI.noConnectedLibrariesHint}</div>
        )}
        {isConnected && hasLibraries && (
          <div style={styles.dropdownIndent}>
            <SelectField
              value={selectedLibraryKey}
              options={libraryOptions}
              onChange={handleLibraryChange}
            />
          </div>
        )}

        <Radio
          name="librarySource"
          checked={isLocal}
          onChange={handleSelectLocal}
          label={UI.localLibraryLabel}
          ariaLabel={UI.localLibraryAria}
        />
      </div>

      {/* Source of truth — реактивный блок ниже выбора */}
      <div style={styles.section}>
        <div style={styles.caption}>Source of truth</div>

        {isConnected ? (
          // Connected → метрики выбранной библиотеки
          <div style={styles.libraryLine}>
            {selectedLibraryName !== '' ? selectedLibraryName + ' — ' : ''}
            Variables{formatBreakdown(stats.variablesByCategory) ? ' — ' + formatBreakdown(stats.variablesByCategory) : ''}
          </div>
        ) : (
          // Local → старые 2 radio Styles / Variables (поведение сохранено)
          <>
            <Radio
              name="tokenSource"
              checked={tokenSource === 'variables'}
              onChange={() => setTokenSource('variables')}
              disabled={variablesDisabled}
              label={'Variables — recommended'}
            />
            {variablesDisabled && <div style={styles.radioHint}>No variables in library</div>}
            <Radio
              name="tokenSource"
              checked={tokenSource === 'styles'}
              onChange={() => setTokenSource('styles')}
              disabled={stylesDisabled}
              label="Styles"
            />
            {stylesDisabled && <div style={styles.radioHint}>No styles in library</div>}
            <Radio
              name="tokenSource"
              checked={tokenSource === 'both'}
              onChange={() => setTokenSource('both')}
              label="Both"
            />
            <div style={{ ...styles.libraryLineMuted, color: stylesActive ? colors.content : colors.contentMuted }}>
              Styles — {formatBreakdown(stats.stylesByCategory) || '—'}
            </div>
            <div style={{ ...styles.libraryLineMuted, color: variablesActive ? colors.content : colors.contentMuted }}>
              Variables — {formatBreakdown(stats.variablesByCategory) || '—'}
              {stats.semanticCount > 0 && ' · Semantic: ' + stats.semanticCount}
            </div>
          </>
        )}
      </div>

      {/* Token policy — без изменений в Ф.16.6.5 */}
      <div style={styles.section}>
        <div style={styles.caption}>Token policy</div>
        <div style={styles.sectionDescription}>Which tokens AI can recommend as fixes</div>
        <Radio
          name="tokenPolicy"
          checked={tokenPolicy === 'all-tokens'}
          onChange={() => setTokenPolicy('all-tokens')}
          label="All tokens — Recommend any token from the library (primitives + semantic)"
        />
        <Radio
          name="tokenPolicy"
          checked={tokenPolicy === 'semantic-only'}
          onChange={() => setTokenPolicy('semantic-only')}
          disabled={variablesDisabled}
          label="Semantic only — Recommend only semantic aliases (Buttons/Primary, etc.) — for two-tier design systems"
        />
        {variablesDisabled && (
          <div style={styles.radioHint}>No variables in library — semantic-only is not applicable</div>
        )}
      </div>

      <Button size="xl" onClick={() => onComplete(tokenSource, tokenPolicy)}>
        Scan
      </Button>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.content,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s400,
  },
  title: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
    color: colors.content,
    margin: 0,
  },
  subtitle: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.contentMuted,
    margin: 0,
  },
  scanningRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s200,
    width: '100%',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s200,
  },
  caption: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
    letterSpacing: typography.h3.letterSpacing,
    color: colors.content,
  },
  sectionDescription: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.content,
  },
  dropdownIndent: {
    paddingLeft: spacing.s400 + spacing.s300,
  },
  libraryLine: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.content,
  },
  libraryLineMuted: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
  },
  radioHint: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.contentMuted,
    paddingLeft: spacing.s400 + spacing.s300,
  },
};
