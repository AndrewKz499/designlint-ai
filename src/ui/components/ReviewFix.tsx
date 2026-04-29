import { useState, useEffect, useCallback, useRef } from 'react';
import type { Violation, PluginMessage, ReportMetrics } from '../../shared/types';
import { UI, VIOLATION_TITLE, VIOLATION_HINT, VIOLATION_CATEGORY, CATEGORY_META } from '../../shared/strings';
import { ReportView } from './ReportView';
import { Button } from './ui/Button';
import { Header } from './ui/Header';
import { IconButton } from './ui/IconButton';
import { SelectField, SelectOption } from './ui/SelectField';
import { callGemini } from '../aiClient';
import { colors, typography, spacing, radii } from '../tokens';
import { ErrorCard } from './ErrorCard';

function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

interface Props {
  violations: Violation[];
  onBack: () => void;
  onFixApplied?: (nodeId: string) => void;
  onSettingsClick?: () => void;
  metrics: ReportMetrics;
  onCheckAgain: () => void;
  onClearMarkers: () => void;
  aiEnabled: boolean;
  hasApiKey: boolean;
}

export function ReviewFix({ violations, onBack, onFixApplied, onSettingsClick, metrics, onCheckAgain, onClearMarkers, aiEnabled, hasApiKey }: Props) {
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
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string>('');
  const previewCacheRef = useRef<Map<string, string>>(new Map());

  const [afterBase64, setAfterBase64] = useState<string | null>(null);
  const [afterLoading, setAfterLoading] = useState(false);
  const [afterError, setAfterError] = useState<string | null>(null);
  const afterCacheRef = useRef<Map<string, string>>(new Map());

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

        const nodeId = msg.data.nodeId;
        const cachedAfter = afterCacheRef.current.get(nodeId);
        if (cachedAfter) {
          setAfterBase64(cachedAfter);
          setAfterLoading(false);
          setAfterError(null);
        } else {
          setAfterLoading(true);
          setAfterBase64(null);
          setAfterError(null);
          parent.postMessage(
            { pluginMessage: { type: 'request-preview', data: { nodeId: nodeId, tag: 'after' } } },
            '*'
          );
        }
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

      // Превью: кэш или запрос
      const cachedPreview = previewCacheRef.current.get(current.nodeId);
      if (cachedPreview) {
        setPreviewBase64(cachedPreview);
        setPreviewLoading(false);
        setPreviewError('');
      } else {
        setPreviewBase64(null);
        setPreviewLoading(true);
        setPreviewError('');
        sendMessage({
          type: 'request-preview',
          data: { nodeId: current.nodeId },
        });
      }
    }
  }, [current]);

  // При смене выбранного токена — проверяем кэш, иначе запускаем AI
  useEffect(() => {
    if (current === null || selectedTokenId === null) return;
    if (!aiEnabled) {
      setExplanation('');
      setExplaining(false);
      setExplainError(false);
      return;
    }
    if (!hasApiKey) {
      setExplanation('');
      setExplaining(false);
      setExplainError(false);
      return;
    }
    const cacheKey = current.id + ':' + selectedTokenId;
    const cached = explanationsRef.current.get(cacheKey);

    if (cached) {
      setExplanation(cached);
      return;
    }

    // Кэша нет — запускаем AI
    let prompt: string;
    const tokenInfo = current.candidates?.find(c => c.id === selectedTokenId);
    if (tokenInfo) {
      // Случай: есть candidates (hardcoded_color, missing_text_style)
      prompt = 'Violation: ' + current.currentValue + ' on node "' + current.nodeName +
        '". Suggested token: "' + tokenInfo.name + '" with value ' + tokenInfo.value +
        '. Explain in 1-2 short sentences why this token fits. ' +
        'No preamble, get straight to the point. Reply in English.';
    } else if (current.suggestedToken && current.suggestedTokenId === selectedTokenId) {
      // Случай: нет candidates, но есть suggestedToken (detached_style, similar_to_token)
      prompt = 'On node "' + current.nodeName + '" the value ' + current.currentValue +
        ' was previously linked to design system token "' + current.suggestedToken +
        '" but the link was detached. Explain in 1-2 short sentences why re-linking ' +
        'restores design system consistency. No preamble, get straight to the point. Reply in English.';
    } else {
      return;
    }

    setExplainError(false);
    setExplaining(true);
    setExplanation('');

    callGemini(
      [{ role: 'user', content: prompt }],
      'You are a designer assistant who explains design system token choices. Reply concisely and to the point, in English.',
      200
    )
      .then(text => {
        explanationsRef.current.set(cacheKey, text);
        setExplanation(text);
        setExplainError(false);
      })
      .catch(err => {
        const msg = String(err);
        let friendly = UI.errorAiGeneric;
        if (msg.includes('401') || msg.includes('403')) friendly = UI.errorAiInvalidKey;
        else if (msg.includes('429')) friendly = UI.errorAiRateLimit;
        else if (msg.includes('503') || msg.includes('overloaded')) friendly = UI.errorAiUnavailable;
        setExplanation(friendly);
        setExplainError(true);
      })
      .finally(() => {
        setExplaining(false);
      });
  }, [selectedTokenId, current]);

  // Слушатель preview-ready от sandbox
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg || msg.type !== 'preview-ready') return;
      if (current === null || msg.data.nodeId !== current.nodeId) return;

      const isAfter = msg.data.tag === 'after';

      if (isAfter) {
        setAfterLoading(false);
        if (msg.data.pngBase64) {
          setAfterBase64(msg.data.pngBase64);
          setAfterError(null);
          afterCacheRef.current.set(msg.data.nodeId, msg.data.pngBase64);
        } else {
          setAfterBase64(null);
          setAfterError(msg.data.error || UI.previewBuildError);
        }
        return;
      }

      // Ветка "До" — без изменений
      if (msg.data.pngBase64) {
        previewCacheRef.current.set(current.nodeId, msg.data.pngBase64);
        setPreviewBase64(msg.data.pngBase64);
        setPreviewError('');
      } else {
        setPreviewBase64(null);
        setPreviewError(msg.data.error || UI.previewLoadError);
      }
      setPreviewLoading(false);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [current]);

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
        <ReportView metrics={metrics} onCheckAgain={onCheckAgain} onClearMarkers={onClearMarkers} />
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

  // Опции для SelectField: либо набор кандидатов, либо единственный suggestedToken-фолбэк
  const suggestionOptions: SelectOption[] = (() => {
    if (current && current.candidates && current.candidates.length > 0) {
      return current.candidates.map((c): SelectOption => {
        const isColor = c.value.indexOf('#') === 0;
        return {
          id: c.id,
          label: c.name,
          swatch: isColor ? c.value : undefined,
          badge: c.kind === 'variables' ? 'VAR' : 'STYLE',
        };
      });
    }
    if (current && current.suggestedToken && current.suggestedTokenId) {
      const isColor = current.currentValue.indexOf('#') === 0;
      return [{
        id: current.suggestedTokenId,
        label: current.suggestedToken,
        swatch: isColor ? current.currentValue : undefined,
        badge: 'STYLE',
      }];
    }
    return [];
  })();

  return (
    <div style={styles.root}>
      <Header onSettingsClick={onSettingsClick} />
      {/* Кнопка возврата */}
      <div style={{ color: colors.content, cursor: 'pointer', fontSize: typography.body.fontSize }} onClick={onBack}>{UI.reviewBack}</div>

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
          <div style={styles.previewBox}>
            {previewLoading && (
              <div style={styles.previewPlaceholder}>{UI.previewLoading}</div>
            )}
            {!previewLoading && previewBase64 && (
              <img
                src={'data:image/png;base64,' + previewBase64}
                alt={UI.previewAlt}
                style={styles.previewImg}
              />
            )}
            {!previewLoading && !previewBase64 && previewError && (
              <div style={styles.previewPlaceholder}>{previewError}</div>
            )}
          </div>
          {suggestionOptions.length > 0 && (
            <SelectField
              label={UI.recommendationAi}
              value={selectedTokenId || ''}
              options={suggestionOptions}
              onChange={setSelectedTokenId}
            />
          )}
          {aiEnabled && !hasApiKey && (
            <ErrorCard
              title={UI.aiKeyMissing}
              description={UI.errNoAiKey}
              actionLabel={UI.openSettings}
              onAction={onSettingsClick ?? (() => {})}
            />
          )}
          {aiEnabled && hasApiKey && (
            <>
              {explaining && (
                <div style={styles.explanation}>{UI.thinkingExplanation}</div>
              )}
              {!explaining && explanation && (
                <div style={styles.explanation}>{explanation}</div>
              )}
              {explainError && !explaining && (
                <div style={styles.retryLink} onClick={() => setSelectedTokenId(s => s)}>{UI.tryAgain}</div>
              )}
            </>
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
    padding: spacing.s400,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.content,
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
    fontSize: typography.body.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.content,
    marginRight: spacing.s200,
  },
  categoryCounter: {
    fontSize: typography.body.fontSize,
    color: colors.contentMuted,
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
    gap: spacing.s200,
  },
  dot: {
    flexShrink: 0,
    width: spacing.s200,
    height: spacing.s200,
    borderRadius: 9999,
  },
  nodeName: {
    fontWeight: typography.bodyBold.fontWeight,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  violationType: {
    fontWeight: typography.h3.fontWeight,
    fontSize: typography.h3.fontSize,
  },
  message: {
    color: colors.contentMuted,
    fontFamily: typography.caption.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: typography.caption.lineHeight,
  },
  currentValue: {
    color: colors.contentMuted,
    fontFamily: typography.caption.fontFamily,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  explanation: {
    fontSize: typography.body.fontSize,
    color: colors.contentMuted,
    marginTop: spacing.s200,
    lineHeight: typography.body.lineHeight,
  },
  retryLink: {
    fontSize: typography.body.fontSize,
    color: colors.accent,
    cursor: 'pointer',
    marginTop: spacing.s200,
    textDecoration: 'underline',
  },
  previewBox: {
    width: '100%',
    minHeight: 80,
    maxHeight: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.bgSecondary,
    borderRadius: radii.r200,
    overflow: 'hidden',
    marginTop: spacing.s200,
  },
  previewImg: {
    maxWidth: '100%',
    maxHeight: 200,
    objectFit: 'contain' as const,
    display: 'block',
  },
  previewPlaceholder: {
    fontSize: typography.body.fontSize,
    color: colors.contentMuted,
    padding: spacing.s300,
  },
} satisfies Record<string, React.CSSProperties>;
