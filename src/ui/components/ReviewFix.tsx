import { useState, useEffect, useCallback } from 'react';
import type { Violation, PluginMessage } from '../../shared/types';
import { UI, VIOLATION_TITLE, VIOLATION_HINT } from '../../shared/strings';
import { Button } from './ui/Button';
import { Header } from './ui/Header';
import { colors, typography, spacing } from '../tokens';

function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

interface Props {
  violations: Violation[];
  onBack: () => void;
  onFixApplied?: (nodeId: string) => void;
}

export function ReviewFix({ violations, onBack, onFixApplied }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());

  // Фильтруем нарушения — убираем игнорированные и исправленные
  const active = violations.filter(
    (v) => !ignoredIds.has(v.id) && !fixedIds.has(v.nodeId),
  );

  const total = active.length;
  const safeIndex = total === 0 ? 0 : Math.min(currentIndex, total - 1);
  const current = total > 0 ? active[safeIndex] : null;

  // Подписка на fix-complete от sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (msg === undefined) return;

      if (msg.type === 'fix-complete' && msg.data.success) {
        setFixedIds((prev) => {
          const next = new Set(prev);
          next.add(msg.data.nodeId);
          return next;
        });
        if (onFixApplied) onFixApplied(msg.data.nodeId);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // При смене текущего нарушения — навигируем к ноде
  useEffect(() => {
    if (current !== null) {
      sendMessage({
        type: 'navigate-to-node',
        data: { nodeId: current.nodeId, pageId: current.pageId },
      });
    }
  }, [current]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleFix = () => {
    if (current === null || current.suggestedTokenId === null) return;
    sendMessage({
      type: 'fix-violation',
      data: {
        nodeId: current.nodeId,
        tokenId: current.suggestedTokenId,
        violationType: current.type,
      },
    });
  };

  const handleSkip = () => {
    goNext();
  };

  const handleIgnore = () => {
    if (current === null) return;
    setIgnoredIds((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
    // После удаления текущего элемента индекс может выйти за границу
    setCurrentIndex((i) => (i >= total - 1 ? Math.max(0, i - 1) : i));
  };

  // Цвет точки severity
  const severityColor = (v: Violation): string => {
    if (v.severity === 'critical') return '#FF3B30';
    if (v.severity === 'warning') return '#FF9500';
    return '#8E8E93';
  };

  // -------------------------------------------------------------------------
  // Рендер: все нарушения обработаны
  // -------------------------------------------------------------------------

  if (total === 0) {
    return (
      <div style={styles.root}>
        <Header />
        <div style={{ color: colors.accentBlue, cursor: 'pointer', fontSize: typography.body.fontSize }} onClick={onBack}>
          {UI.reviewBack}
        </div>
        <div style={styles.doneMsg}>{UI.reviewDone}</div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Рендер: карточка нарушения
  // -------------------------------------------------------------------------

  return (
    <div style={styles.root}>
      <Header />
      {/* Кнопка возврата */}
      <div style={{ color: colors.accentBlue, cursor: 'pointer', fontSize: typography.body.fontSize }} onClick={onBack}>{UI.reviewBack}</div>

      {/* Заголовок с счётчиком */}
      <div style={styles.header}>
        <span style={styles.title}>{UI.reviewTitle}</span>
        <span style={styles.counter}>{safeIndex + 1} из {total}</span>
      </div>

      {/* Карточка нарушения */}
      {current !== null && (
        <div style={styles.card}>
          <div style={styles.cardTop}>
            <span style={{ ...styles.dot, background: severityColor(current) }} />
            <span style={styles.nodeName}>{current.nodeName}</span>
          </div>
          <div style={styles.violationType}>{VIOLATION_TITLE[current.type]}</div>
          <div style={styles.message}>{VIOLATION_HINT[current.type]}</div>
          <div style={styles.currentValue}>{current.currentValue}</div>
          {current.suggestedToken !== null && (
            <div style={styles.suggestion}>
              {UI.reviewSuggested}: {current.suggestedToken}
            </div>
          )}
        </div>
      )}

      {/* Кнопки действий */}
      <div style={{ display: 'flex', gap: spacing.s200 }}>
        <div style={{ flex: 1 }}>
          <Button
            disabled={current === null || current.suggestedTokenId === null}
            onClick={handleFix}
          >
            {UI.reviewFix}
          </Button>
        </div>
        <div style={{ flex: 1 }}>
          <Button variant="secondary" onClick={handleSkip}>
            {UI.reviewSkip}
          </Button>
        </div>
        <div style={{ flex: 1 }}>
          <Button variant="secondary" onClick={handleIgnore}>
            {UI.reviewIgnore}
          </Button>
        </div>
      </div>

      {/* Навигация ◀ ▶ */}
      <div style={styles.nav}>
        <button
          style={safeIndex === 0 ? { ...styles.navBtn, ...styles.navBtnDisabled } : styles.navBtn}
          disabled={safeIndex === 0}
          onClick={goPrev}
        >
          ◀
        </button>
        <button
          style={safeIndex === total - 1 ? { ...styles.navBtn, ...styles.navBtnDisabled } : styles.navBtn}
          disabled={safeIndex === total - 1}
          onClick={goNext}
        >
          ▶
        </button>
      </div>
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
  },
  counter: {
    fontSize: '12px',
    color: '#888',
  },
  card: {
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dot: {
    flexShrink: 0,
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  nodeName: {
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  violationType: {
    fontWeight: 600,
    fontSize: '13px',
  },
  message: {
    color: '#555',
    lineHeight: 1.4,
    fontSize: '12px',
  },
  currentValue: {
    color: '#888',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  suggestion: {
    color: '#0D99FF',
    fontSize: '12px',
  },
  nav: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
  },
  navBtn: {
    background: '#F3F4F6',
    border: 'none',
    borderRadius: '6px',
    width: '36px',
    height: '32px',
    fontSize: '14px',
    cursor: 'pointer',
  } as React.CSSProperties,
  navBtnDisabled: {
    color: '#ccc',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  doneMsg: {
    textAlign: 'center' as const,
    color: '#22C55E',
    fontWeight: 600,
    fontSize: '14px',
    padding: '32px 0',
  },
} satisfies Record<string, React.CSSProperties>;
