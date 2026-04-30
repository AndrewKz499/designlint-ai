import { useState, useEffect, useMemo } from 'react';
import type { PluginMessage, ReferenceSnapshot, TokenSource, TokenPolicy } from '../../shared/types';
import { UI } from '../../shared/strings';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { colors, typography, spacing } from '../tokens';

type Step = 'scanning' | 'ready';

function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

interface Props {
  onComplete: (tokenSource: TokenSource, tokenPolicy: TokenPolicy) => void;
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

export function ScanDesignSystem({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('scanning');
  const [scanStage, setScanStage] = useState<string>('');
  const [snapshot, setSnapshot] = useState<ReferenceSnapshot | null>(null);
  const [tokenSource, setTokenSource] = useState<TokenSource>('variables');
  const [tokenPolicy, setTokenPolicy] = useState<TokenPolicy>('all-tokens');

  // Кикуем discover-sources при монтировании; источники авто-сканируются ниже
  useEffect(() => {
    sendMessage({ type: 'discover-sources' });
  }, []);

  // Слушатель сообщений от sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (msg === undefined) return;

      if (msg.type === 'ds-sources-found') {
        // Авто-сканирование всех найденных источников без запроса пользователя
        const allNames = msg.data.sources.map((s) => s.name);
        sendMessage({ type: 'ds-scan-confirmed', data: { enabledSources: allNames } });
      } else if (msg.type === 'ds-scan-progress') {
        setScanStage(msg.data.stage);
      } else if (msg.type === 'ds-scan-complete') {
        setSnapshot(msg.data.snapshot);
        setStep('ready');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Подсчёт статистики из snapshot
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

  // Авто-коррекция выбора, если выбранный источник пуст
  useEffect(() => {
    if (snapshot === null) return;
    if (tokenSource === 'variables' && stats.variablesTotal === 0) {
      setTokenSource(stats.stylesTotal > 0 ? 'styles' : 'both');
    } else if (tokenSource === 'styles' && stats.stylesTotal === 0) {
      setTokenSource(stats.variablesTotal > 0 ? 'variables' : 'both');
    }
  }, [snapshot, tokenSource, stats.stylesTotal, stats.variablesTotal]);

  // ─── Render: scanning ──────────────────────────────────────────────────
  if (step === 'scanning') {
    return (
      <div style={styles.root}>
        <h3 style={styles.title}>{UI.sdScanningTitle}</h3>
        <div style={styles.scanningRow}>
          <p style={styles.subtitle}>
            {scanStage !== '' ? UI.sdScanningWith(scanStage) : UI.sdScanning}
          </p>
          <Spinner size={20} />
        </div>
        <Button disabled>{UI.sdScanSelected}</Button>
      </div>
    );
  }

  // ─── Render: ready ─────────────────────────────────────────────────────
  const variablesDisabled = stats.variablesTotal === 0;
  const stylesDisabled = stats.stylesTotal === 0;
  const stylesActive = tokenSource === 'styles' || tokenSource === 'both';
  const variablesActive = tokenSource === 'variables' || tokenSource === 'both';

  return (
    <div style={styles.root}>
      {/* Library content */}
      <div style={styles.section}>
        <div style={styles.caption}>Library content</div>
        <div style={styles.libraryRow}>
          <div style={styles.libraryCol}>
            <div style={{ ...styles.colTotal, color: stylesActive ? colors.content : colors.contentMuted }}>
              {stats.stylesTotal}
            </div>
            <div style={{ ...styles.colLabel, color: stylesActive ? colors.content : colors.contentMuted }}>
              Styles
            </div>
            <div style={styles.colBreakdown}>{formatBreakdown(stats.stylesByCategory)}</div>
          </div>
          <div style={styles.libraryCol}>
            <div style={{ ...styles.colTotal, color: variablesActive ? colors.content : colors.contentMuted }}>
              {stats.variablesTotal}
            </div>
            <div style={{ ...styles.colLabel, color: variablesActive ? colors.content : colors.contentMuted }}>
              Variables
            </div>
            <div style={styles.colBreakdown}>
              {formatBreakdown(stats.variablesByCategory)}
              {stats.semanticCount > 0 && ' · Semantic: ' + stats.semanticCount}
            </div>
          </div>
        </div>
      </div>

      {/* Source of truth */}
      <div style={styles.section}>
        <div style={styles.caption}>Source of truth</div>
        <label style={styles.radioRow}>
          <input
            type="radio"
            name="tokenSource"
            value="variables"
            checked={tokenSource === 'variables'}
            onChange={() => setTokenSource('variables')}
            disabled={variablesDisabled}
            style={styles.radio}
          />
          <span style={{ color: variablesDisabled ? colors.contentMuted : colors.content }}>
            Variables — recommended
          </span>
        </label>
        {variablesDisabled && <div style={styles.radioHint}>No variables in library</div>}
        <label style={styles.radioRow}>
          <input
            type="radio"
            name="tokenSource"
            value="styles"
            checked={tokenSource === 'styles'}
            onChange={() => setTokenSource('styles')}
            disabled={stylesDisabled}
            style={styles.radio}
          />
          <span style={{ color: stylesDisabled ? colors.contentMuted : colors.content }}>Styles</span>
        </label>
        {stylesDisabled && <div style={styles.radioHint}>No styles in library</div>}
        <label style={styles.radioRow}>
          <input
            type="radio"
            name="tokenSource"
            value="both"
            checked={tokenSource === 'both'}
            onChange={() => setTokenSource('both')}
            style={styles.radio}
          />
          <span style={{ color: colors.content }}>Both</span>
        </label>
      </div>

      {/* Token policy */}
      <div style={styles.section}>
        <div style={styles.caption}>Token policy</div>
        <div style={styles.sectionDescription}>Which tokens AI can recommend as fixes</div>
        <label style={styles.radioRow}>
          <input
            type="radio"
            name="tokenPolicy"
            value="all-tokens"
            checked={tokenPolicy === 'all-tokens'}
            onChange={() => setTokenPolicy('all-tokens')}
            style={styles.radio}
          />
          <div style={styles.optionContent}>
            <span style={{ color: colors.content }}>All tokens</span>
            <div style={styles.optionDescription}>
              Recommend any token from the library (primitives + semantic)
            </div>
          </div>
        </label>
        <label style={styles.radioRow}>
          <input
            type="radio"
            name="tokenPolicy"
            value="semantic-only"
            checked={tokenPolicy === 'semantic-only'}
            onChange={() => setTokenPolicy('semantic-only')}
            disabled={variablesDisabled}
            style={styles.radio}
          />
          <div style={styles.optionContent}>
            <span style={{ color: variablesDisabled ? colors.contentMuted : colors.content }}>Semantic only</span>
            <div style={styles.optionDescription}>
              Recommend only semantic aliases (Buttons/Primary, etc.) — for two-tier design systems
            </div>
          </div>
        </label>
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
    fontFamily: typography.caption.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: typography.caption.lineHeight,
    color: colors.content,
  },
  sectionDescription: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.content,
  },
  optionContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s200,
  },
  optionDescription: {
    fontFamily: typography.caption.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: typography.caption.lineHeight,
    color: colors.content,
  },
  libraryRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: spacing.s400,
  },
  libraryCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s200,
    flex: 1,
  },
  colTotal: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
  },
  colLabel: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
  },
  colBreakdown: {
    fontFamily: typography.caption.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: typography.caption.lineHeight,
    color: colors.content,
  },
  radioRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s200,
    cursor: 'pointer',
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
  },
  radio: {
    accentColor: colors.accent,
    cursor: 'pointer',
    margin: 0,
  },
  radioHint: {
    fontFamily: typography.caption.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: typography.caption.lineHeight,
    color: colors.contentMuted,
    paddingLeft: spacing.s400,
  },
};
