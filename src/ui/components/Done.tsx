import { useState } from 'react';
import type { ReportMetrics } from '../../shared/types';
import { UI } from '../../shared/strings';
import { Button } from './ui/Button';
import { colors, typography, spacing } from '../tokens';

type Props = {
  metrics: ReportMetrics;
  onCheckAgain: () => void;
  onClearMarkers: () => void;
};

export function Done({ metrics, onCheckAgain, onClearMarkers }: Props) {
  const [cleared, setCleared] = useState(false);

  return (
    <div style={styles.root}>
      <div style={styles.title}>{UI.reportTitle}</div>

      <div style={styles.metrics}>
        <div style={styles.metricRow}>
          {UI.reportFixedLabel(metrics.fixedCount, metrics.totalBefore)}
        </div>
        <div style={styles.metricRow}>
          {UI.reportScopeLabel(metrics.scopeLabel)}
        </div>
      </div>

      <div style={styles.buttons}>
        <Button
          disabled={cleared}
          onClick={() => {
            onClearMarkers();
            setCleared(true);
          }}
        >
          {cleared ? UI.reportMarkersCleared : UI.reportClearMarkers}
        </Button>
        <Button variant="secondary" onClick={onCheckAgain}>{UI.reportCheckAgain}</Button>
      </div>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s400,
    padding: spacing.containerPadding,
    height: '100%',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  buttons: {
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s200,
  } as React.CSSProperties,
  title: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.content,
  } as React.CSSProperties,
  metrics: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s200,
  } as React.CSSProperties,
  metricRow: {
    fontSize: typography.body.fontSize,
    color: colors.content,
  } as React.CSSProperties,
};
