import { useState, useEffect, useCallback, useRef } from 'react';
import type { Violation, PluginMessage } from '../../shared/types';
import { UI, VIOLATION_TITLE, VIOLATION_HINT, VIOLATION_CATEGORY, CATEGORY_META } from '../../shared/strings';
import { Button } from './ui/Button';
import { Header } from './ui/Header';
import { IconButton } from './ui/IconButton';
import { SelectField, SelectOption } from './ui/SelectField';
import { callGemini } from '../aiClient';
import { colors, typography, spacing } from '../tokens';

function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

interface Props {
  violations: Violation[];
  onBack: () => void;
  onFixApplied?: (nodeId: string) => void;
  onSettingsClick?: () => void;
}

export function ReviewFix({ violations, onBack, onFixApplied, onSettingsClick }: Props) {
  // Снимок исходных violations на монтировании — для стабильного знаменателя счётчика
  const violationsSnapshotRef = useRef<Violation[]>(violations);
  const explanationsRef = useRef<Map<string, string>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string>('');
  const [explaining, setExplaining] = useState<boolean>(false);
  const [explainError, setExplainError] = useState<boolean>(false);

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

  // Сброс выбора при смене текущего нарушения + подтягивание объяснения из кэша
  useEffect(() => {
    if (current !== null) {
      setSelectedTokenId(current.suggestedTokenId);
      const cacheKey = current.id + ':' + (current.suggestedTokenId || '');
      const cached = explanationsRef.current.get(cacheKey);
      setExplanation(cached || '');
    }
  }, [current]);

  // При смене выбранного токена — проверяем кэш, иначе запускаем AI
  useEffect(() => {
    if (current === null || selectedTokenId === null) return;
    const cacheKey = current.id + ':' + selectedTokenId;
    const cached = explanationsRef.current.get(cacheKey);

    if (cached) {
      setExplanation(cached);
      return;
    }

    // Кэша нет — запускаем AI
    const tokenInfo = current.candidates?.find(c => c.id === selectedTokenId);
    if (!tokenInfo) return;

    setExplainError(false);
    setExplaining(true);
    setExplanation('');

    const prompt = 'Нарушение: ' + current.currentValue + ' на ноде "' + current.nodeName +
      '". Предложенный токен: "' + tokenInfo.name + '" со значением ' + tokenInfo.value +
      '. Объясни в 1-2 коротких предложениях, почему этот токен подходит. ' +
      'Без вступлений, сразу по сути. На русском.';

    callGemini(
      [{ role: 'user', content: prompt }],
      'Ты помощник дизайнера, объясняешь выбор токенов из дизайн-системы. Отвечай кратко, по делу, на русском.',
      200
    )
      .then(text => {
        explanationsRef.current.set(cacheKey, text);
        setExplanation(text);
        setExplainError(false);
      })
      .catch(err => {
        const msg = String(err);
        let friendly = 'Не удалось получить объяснение.';
        if (msg.includes('401') || msg.includes('403')) friendly = 'Неверный API-ключ. Проверьте настройки.';
        else if (msg.includes('429')) friendly = 'Превышен лимит запросов. Попробуйте позже.';
        else if (msg.includes('503') || msg.includes('overloaded')) friendly = 'Сервис временно недоступен.';
        setExplanation(friendly);
        setExplainError(true);
      })
      .finally(() => {
        setExplaining(false);
      });
  }, [selectedTokenId, current]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleFix = () => {
    if (current === null) return;
    const tokenId = selectedTokenId || current.suggestedTokenId;
    if (tokenId === null) return;
    sendMessage({
      type: 'fix-violation',
      data: {
        nodeId: current.nodeId,
        tokenId: tokenId,
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
        <Header onSettingsClick={onSettingsClick} />
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

  const currentCategory = current ? VIOLATION_CATEGORY[current.type] : 'color';
  // categoryAll — все нарушения этой категории из ИСХОДНОГО входа (стабильный знаменатель)
  const categoryAll = violationsSnapshotRef.current.filter(function(v){ return VIOLATION_CATEGORY[v.type] === currentCategory; });
  const categoryTotal = categoryAll.length;
  const categoryIndex = current ? categoryAll.indexOf(current) : 0;
  const categoryLabel = CATEGORY_META[currentCategory as keyof typeof CATEGORY_META]
    ? CATEGORY_META[currentCategory as keyof typeof CATEGORY_META].label : '';

  return (
    <div style={styles.root}>
      <Header onSettingsClick={onSettingsClick} />
      {/* Кнопка возврата */}
      <div style={{ color: colors.accentBlue, cursor: 'pointer', fontSize: typography.body.fontSize }} onClick={onBack}>{UI.reviewBack}</div>

      {/* Навигация по категории */}
      <div style={styles.categoryNav}>
        <span style={styles.categoryLabel}>{categoryLabel}:</span>
        <IconButton disabled={categoryIndex <= 0} onClick={goPrev}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </IconButton>
        <span style={styles.categoryCounter}>{categoryIndex + 1} / {categoryTotal}</span>
        <IconButton disabled={categoryIndex >= categoryTotal - 1} onClick={goNext}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </IconButton>
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
          {current.candidates && current.candidates.length > 0 && (
            <SelectField
              label="Рекомендация AI"
              value={selectedTokenId || ''}
              options={current.candidates.map(function(c): SelectOption {
                var isColor = c.value.indexOf('#') === 0;
                return { id: c.id, label: c.name, swatch: isColor ? c.value : undefined };
              })}
              onChange={setSelectedTokenId}
            />
          )}
          {explaining && (
            <div style={styles.explanation}>Думаю над объяснением...</div>
          )}
          {!explaining && explanation && (
            <div style={styles.explanation}>{explanation}</div>
          )}
          {explainError && !explaining && (
            <div style={styles.retryLink} onClick={() => setSelectedTokenId(s => s)}>Попробовать ещё раз</div>
          )}
        </div>
      )}

      {/* Кнопки действий */}
      <div style={{ display: 'flex', gap: spacing.s200 }}>
        <div style={{ flex: 1 }}>
          <Button
            disabled={current === null || (selectedTokenId === null && current.suggestedTokenId === null)}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Стили
// ---------------------------------------------------------------------------

const styles = {
  root: {
    padding: '16px',
    fontFamily: typography.body.fontFamily,
    fontSize: '13px',
    color: colors.textDefault,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s300,
  },
  categoryNav: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.s200,
    marginBottom: spacing.s300,
  },
  categoryLabel: {
    fontSize: typography.body.fontSize + 'px',
    fontWeight: typography.heading.fontWeight,
    color: colors.textDefault,
    marginRight: spacing.s200,
  },
  categoryCounter: {
    fontSize: typography.body.fontSize + 'px',
    color: colors.textMuted,
    minWidth: '32px',
    textAlign: 'center' as const,
  },
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s200,
    marginBottom: spacing.s300,
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
    fontWeight: typography.heading.fontWeight,
    fontSize: typography.heading.fontSize,
  },
  message: {
    color: colors.textBody,
    lineHeight: 1.4,
    fontSize: '12px',
  },
  currentValue: {
    color: colors.textMuted,
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  explanation: {
    fontSize: typography.body.fontSize + 'px',
    color: colors.textMuted,
    marginTop: spacing.s200,
    lineHeight: 1.4,
  },
  doneMsg: {
    textAlign: 'center' as const,
    color: '#22C55E',
    fontWeight: 600,
    fontSize: '14px',
    padding: '32px 0',
  },
  retryLink: {
    fontSize: typography.body.fontSize + 'px',
    color: colors.accentBlue,
    cursor: 'pointer',
    marginTop: spacing.s200,
    textDecoration: 'underline',
  },
} satisfies Record<string, React.CSSProperties>;
