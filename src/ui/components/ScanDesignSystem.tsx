import { useState, useEffect } from 'react';
import type { PluginMessage, SnapshotSource, ReferenceSnapshot, ScanScope } from '../../shared/types';
import { SOURCE_LABEL, UI } from '../../shared/strings';
import { ScopeSelector } from './ScopeSelector';

type Step = 'sources' | 'scanning' | 'result';

const SOURCE_NAME_MAP: Record<string, string> = {
  'Local Paint Styles': SOURCE_LABEL.paintStyles,
  'Local Text Styles':  SOURCE_LABEL.textStyles,
};

function displaySourceName(name: string): string {
  if (SOURCE_NAME_MAP[name] !== undefined) return SOURCE_NAME_MAP[name];
  if (name.toLowerCase().includes('variable')) return SOURCE_LABEL.variables;
  return name;
}

function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

interface Props {
  /** Вызывается когда пользователь готов перейти к аудиту */
  onComplete: () => void;
  scope: ScanScope;
  onScopeChange: (scope: ScanScope) => void;
}

export function ScanDesignSystem({ onComplete, scope, onScopeChange }: Props) {
  const [step, setStep] = useState<Step>('sources');
  const [sources, setSources] = useState<SnapshotSource[]>([]);
  const [scanStage, setScanStage] = useState<string>('');
  const [snapshot, setSnapshot] = useState<ReferenceSnapshot | null>(null);

  // Автоматически запускаем поиск источников при монтировании
  useEffect(() => {
    sendMessage({ type: 'discover-sources' });
  }, []);

  // Подписка на сообщения от sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (msg === undefined) return;

      if (msg.type === 'ds-sources-found') {
        setSources(msg.data.sources);
        setStep('sources');
      } else if (msg.type === 'ds-scan-progress') {
        setScanStage(msg.data.stage);
      } else if (msg.type === 'ds-scan-complete') {
        setSnapshot(msg.data.snapshot);
        setStep('result');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleToggleSource = (name: string) => {
    setSources((prev) =>
      prev.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s)),
    );
  };

  const handleStartScan = () => {
    const enabled = sources.filter((s) => s.enabled).map((s) => s.name);
    setStep('scanning');
    setScanStage('');
    sendMessage({ type: 'ds-scan-confirmed', data: { enabledSources: enabled } });
  };

  const handleRescan = () => {
    setSnapshot(null);
    setSources([]);
    setScanStage('');
    setStep('sources');
    sendMessage({ type: 'discover-sources' });
  };

  const enabledCount = sources.filter((s) => s.enabled).length;

  // -------------------------------------------------------------------------
  // Рендер по состояниям
  // -------------------------------------------------------------------------

  if (step === 'sources') {
    return (
      <div style={styles.root}>
        <h3 style={styles.title}>Источники дизайн-системы</h3>
        {sources.length === 0 ? (
          <p style={styles.subtitle}>{UI.searchingSources}</p>
        ) : (
        <ul style={styles.sourceList}>
          {sources.map((source) => (
            <li key={source.name} style={styles.sourceItem}>
              <label style={styles.sourceLabel}>
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={() => handleToggleSource(source.name)}
                  style={styles.checkbox}
                />
                <span style={styles.sourceName}>{displaySourceName(source.name)}</span>
                <span style={styles.sourceCount}>({source.tokenCount})</span>
              </label>
            </li>
          ))}
        </ul>
        )}
        <button
          style={enabledCount === 0 ? { ...styles.btnPrimary, ...styles.btnDisabled } : styles.btnPrimary}
          disabled={enabledCount === 0}
          onClick={handleStartScan}
        >
          Сканировать выбранные
        </button>
        <button style={styles.btnText} onClick={onComplete}>
          Пропустить
        </button>
      </div>
    );
  }

  if (step === 'scanning') {
    return (
      <div style={styles.root}>
        <h3 style={styles.title}>Сканирование дизайн-системы</h3>
        <p style={styles.subtitle}>
          {scanStage !== '' ? 'Сканирование... ' + scanStage : 'Сканирование...'}
        </p>
        <button style={{ ...styles.btnPrimary, ...styles.btnDisabled }} disabled>
          Сканировать выбранные
        </button>
      </div>
    );
  }

  // step === 'result'
  if (snapshot === null) return null;

  const colorCount = snapshot.tokens.filter((t) => t.category === 'color').length;
  const typographyCount = snapshot.tokens.filter((t) => t.category === 'typography').length;
  const spacingCount = snapshot.tokens.filter((t) => t.category === 'spacing').length;
  const radiusCount = snapshot.tokens.filter((t) => t.category === 'radius').length;
  const issueCount = snapshot.validation.issues.length;

  return (
    <div style={styles.root}>
      <h3 style={styles.title}>Дизайн-система просканирована</h3>

      <ul style={styles.resultList}>
        <li>Цветовых токенов: <strong>{colorCount}</strong></li>
        <li>Текстовых токенов: <strong>{typographyCount}</strong></li>
        <li>{UI.sdSpacingLabel}: <strong>{spacingCount}</strong></li>
        <li>{UI.sdRadiusLabel}: <strong>{radiusCount}</strong></li>
      </ul>

      {issueCount > 0 && (
        <div style={styles.warningBanner}>
          {issueCount === 1
            ? '1 замечание к токенам'
            : issueCount + ' замечания к токенам'}
        </div>
      )}

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <ScopeSelector value={scope} onChange={onScopeChange} />
      </div>
      <button style={styles.btnPrimary} onClick={onComplete}>
        Запустить аудит
      </button>
      <button style={styles.btnText} onClick={handleRescan}>
        Пересканировать
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Стили
// ---------------------------------------------------------------------------

const styles = {
  root: {
    padding: '16px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
  },
  subtitle: {
    margin: 0,
    color: '#555',
    lineHeight: 1.5,
  },
  sourceList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sourceItem: {
    display: 'block',
  },
  sourceLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  checkbox: {
    margin: 0,
    cursor: 'pointer',
    accentColor: '#0D99FF',
  },
  sourceName: {
    flex: 1,
  },
  sourceCount: {
    color: '#888',
  },
  resultList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  warningBanner: {
    padding: '8px 12px',
    background: '#FFF8E1',
    border: '1px solid #FFD54F',
    borderRadius: '6px',
    color: '#7A5C00',
    fontSize: '12px',
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
  } as React.CSSProperties,
  btnDisabled: {
    background: '#a0cff7',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  btnText: {
    display: 'block',
    width: '100%',
    padding: '6px 0',
    background: 'transparent',
    color: '#0D99FF',
    border: 'none',
    fontSize: '13px',
    cursor: 'pointer',
  } as React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
