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

export function ReportView({ metrics, onCheckAgain, onClearMarkers }: Props) {
  const [cleared, setCleared] = useState(false);
  const durationSec = Math.floor(metrics.durationMs / 1000);
  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;

  return (
    <div style={styles.root}>
      <div style={styles.title}>{UI.reportTitle}</div>

      <div style={styles.metrics}>
        <div style={styles.metricRow}>
          {UI.reportFixedLabel(metrics.fixedCount, metrics.totalBefore)}
        </div>
        <div style={styles.metricRow}>
          {UI.reportDurationLabel(min, sec)}
        </div>
        <div style={styles.metricRow}>
          {UI.reportScopeLabel(metrics.scopeLabel)}
        </div>
      </div>

      <Button
        variant="secondary"
        disabled={cleared}
        onClick={() => {
          onClearMarkers();
          setCleared(true);
        }}
      >
        {cleared ? UI.reportMarkersCleared : UI.reportClearMarkers}
      </Button>
      <Button onClick={onCheckAgain}>{UI.reportCheckAgain}</Button>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s400,
    padding: spacing.s400,
  } as React.CSSProperties,
  title: {
    fontFamily: typography.heading.fontFamily,
    fontSize: typography.heading.fontSize + 'px',
    fontWeight: typography.heading.fontWeight,
    color: colors.content,
  } as React.CSSProperties,
  metrics: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s200,
  } as React.CSSProperties,
  metricRow: {
    fontSize: typography.body.fontSize + 'px',
    color: colors.content,
  } as React.CSSProperties,
};
