import { useState, useEffect } from 'react';
import type { PluginMessage, SnapshotSource, ReferenceSnapshot, ScanScope } from '../../shared/types';
import { SOURCE_LABEL, UI } from '../../shared/strings';
import { ScopeSelector } from './ScopeSelector';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { colors, typography, spacing } from '../tokens';

type Step = 'sources' | 'scanning' | 'result';

function displaySourceName(source: SnapshotSource): string {
  if (source.kind === 'paintStyles') return SOURCE_LABEL.paintStyles;
  if (source.kind === 'textStyles') return SOURCE_LABEL.textStyles;
  // Variables — показываем имя коллекции из Figma
  return source.name;
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
              <Checkbox
                checked={source.enabled}
                onChange={() => handleToggleSource(source.name)}
                label={displaySourceName(source)}
              />
              <span style={styles.sourceCount}>({source.tokenCount})</span>
            </li>
          ))}
        </ul>
        )}
        <Button disabled={enabledCount === 0} onClick={handleStartScan}>
          Сканировать выбранные
        </Button>
        <Button variant="secondary" onClick={onComplete}>
          Пропустить
        </Button>
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
        <Button disabled>
          Сканировать выбранные
        </Button>
      </div>
    );
  }

  // step === 'result'
  if (snapshot === null) return null;

  const colorCount = snapshot.tokens.filter((t) => t.category === 'color').length;
  const typographyCount = snapshot.tokens.filter((t) => t.category === 'typography').length;
  const spacingCount = snapshot.tokens.filter((t) => t.category === 'spacing').length;
  const radiusCount = snapshot.tokens.filter((t) => t.category === 'radius').length;

  return (
    <div style={styles.root}>
      <h3 style={styles.title}>Дизайн-система просканирована</h3>

      <ul style={styles.resultList}>
        <li>Цветовых токенов: <strong>{colorCount}</strong></li>
        <li>Текстовых токенов: <strong>{typographyCount}</strong></li>
        <li>{UI.sdSpacingLabel}: <strong>{spacingCount}</strong></li>
        <li>{UI.sdRadiusLabel}: <strong>{radiusCount}</strong></li>
      </ul>

      <div style={{ marginTop: spacing.s300, marginBottom: spacing.s300 }}>
        <ScopeSelector value={scope} onChange={onScopeChange} />
      </div>
      <Button onClick={onComplete}>
        Запустить аудит
      </Button>
      <Button variant="secondary" onClick={handleRescan}>
        Пересканировать
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Стили
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: spacing.s400,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.content,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s300,
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
  sourceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s200,
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  sourceItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceCount: {
    color: colors.contentMuted,
    fontSize: typography.body.fontSize,
  },
  resultList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s200,
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
};
