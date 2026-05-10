import { useState, useEffect, useCallback, useRef } from 'react';
import type { Violation, PluginMessage, ReportMetrics, ReferenceSnapshot, ScanResult, Token, Example } from '../../shared/types';
import { UI, VIOLATION_HINT, VIOLATION_CATEGORY, CATEGORY_META } from '../../shared/strings';
import { Done } from './Done';
import { Button } from './ui/Button';
import { Header } from './ui/Header';
import { IconButton } from './ui/IconButton';
import { BackButton } from './ui/BackButton';
import { SelectField, SelectOption } from './ui/SelectField';
import { callGemini } from '../aiClient';
import { colors, typography, spacing, radii } from '../tokens';
import { ErrorCard } from './ErrorCard';

function sendMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// Ф.17.9: подсказка-плейсхолдер про ограничение library-режима — Plugin API
// в library-режиме отдаёт только Variables, не Styles, поэтому search не
// найдёт library Styles. Без подсказки юзер с 200 Styles в библиотеке решит,
// что плагин сломан. Показывается только когда snapshot построен из library.
// TODO: finalize wording in release prep — release-scribe
const LIBRARY_HINT = "Library styles aren't searchable. Use file styles for full search.";

interface Props {
  violations: Violation[];
  onBack: () => void;
  onNavigateHome: () => void;
  onOpenSettings: () => void;
  metrics: ReportMetrics;
  onCheckAgain: () => void;
  onClearMarkers: () => void;
  aiEnabled: boolean;
  hasApiKey: boolean;
  // Ф.17.6: snapshot переезжает из Home в App (single owner). ReportView получает
  // его как читающий потребитель. Используется в Ф.17.5 для маппинга tokenId → name
  // в componentContext-секции AI prompt; в Ф.17.8 — для unified search.
  // null-абильный: App-уровень не гарантирует наличие snapshot к моменту рендера ReportView.
  snapshot: ReferenceSnapshot | null;
  /**
   * Ф.17.5: ScanResult из App — источник `componentTokenIndex` (Ф.17.3) и
   * per-node `componentName` (Ф.17.2 в ScannedColor / ScannedText). Backend
   * не кладёт `componentName` в Violation, поэтому ReportView сам ищет его
   * по nodeId через result.colors / result.texts. Значения нужны только для
   * обогащения AI prompt в useEffect ниже.
   * null-абильный: при отсутствии result componentContext-секция не добавляется
   * (backward compat).
   */
  result: ScanResult | null;
  /**
   * Ф.18a (шаг 18.8): активный эталон, рендерится как чип в Header под
   * заголовком ReportView. Видимостью управляет examplee !== null (Header сам
   * чип не покажет, если null или showExampleChip=false).
   */
  example: Example | null;
  /** Ф.18a (шаг 18.8): App.tsx отправит clear-example в sandbox. */
  onClearExample: () => void;
}

export function ReportView({ violations, onBack, onNavigateHome, onOpenSettings, metrics, onCheckAgain, onClearMarkers, aiEnabled, hasApiKey, snapshot, result, example, onClearExample }: Props) {
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
      // Инициализация selectedTokenId: сначала suggestedTokenId, иначе первый
      // из candidates (нарушения вроде hardcoded_color могут не иметь
      // suggestedTokenId, но иметь набор кандидатов на выбор)
      const initialTokenId = current.suggestedTokenId
        ?? (current.candidates && current.candidates.length > 0 ? current.candidates[0].id : null);
      setSelectedTokenId(initialTokenId);
      const cacheKey = current.id + ':' + (initialTokenId || '');
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

    // Ф.17.5: componentContext-секция. Добавляется только если нашли componentName
    // у текущего nodeId в scanResult И в componentTokenIndex для этого имени есть
    // ≥1 tokenId. Backend (17.4) при <2 narrowed-кандидатах фоллбэчится на полную
    // палитру топ-5 — но индекс компонента остаётся; UI всё равно даёт его в
    // prompt, чтобы Gemini понимал контекст. Если componentName отсутствует ИЛИ
    // индекс пуст — секция не добавляется (backward compat, см. AC-2).
    if (result) {
      let componentName: string | undefined;
      for (let i = 0; i < result.colors.length; i++) {
        if (result.colors[i].nodeId === current.nodeId) {
          componentName = result.colors[i].componentName;
          break;
        }
      }
      if (componentName === undefined) {
        for (let i = 0; i < result.texts.length; i++) {
          if (result.texts[i].nodeId === current.nodeId) {
            componentName = result.texts[i].componentName;
            break;
          }
        }
      }
      const tokenIds = (componentName !== undefined && result.componentTokenIndex)
        ? result.componentTokenIndex[componentName]
        : undefined;
      if (componentName !== undefined && tokenIds && tokenIds.length > 0 && snapshot) {
        // Маппинг tokenId → name через snapshot.tokens (для Gemini name читабельнее uuid).
        // Лимит N=20 (решение PO, Риск 7) — обрезаем индекс до 20 первых tokenId.
        const nameById: { [id: string]: string } = {};
        for (let i = 0; i < snapshot.tokens.length; i++) {
          nameById[snapshot.tokens[i].id] = snapshot.tokens[i].name;
        }
        const limit = Math.min(tokenIds.length, 20);
        const paletteNames: string[] = [];
        for (let i = 0; i < limit; i++) {
          const n = nameById[tokenIds[i]];
          if (n) paletteNames.push(n);
        }
        if (paletteNames.length > 0) {
          prompt += ' Component context: "' + componentName +
            '". Tokens used in this component: ' + paletteNames.join(', ') + '.';
        }
      }
    }

    // Ф.18a (шаг 18.10): если рекомендация пришла от эталона — даём AI знать,
    // что токен взят из эталонного узла, а не из общей палитры. Помогает Gemini
    // сформулировать «такой же токен использован в эталоне», вместо обобщённого
    // «по близости hex». Бюджет одна строка (см. шаг 18.10, решение по AI prompt).
    if (current.exampleSlot) {
      prompt += ' This token was taken from the user-selected example reference (slot: ' +
        current.exampleSlot.slotKind + ', role: ' + current.exampleSlot.role + ').';
    }

    setExplainError(false);
    setExplaining(true);
    setExplanation('');

    const controller = new AbortController();

    callGemini(
      [{ role: 'user', content: prompt }],
      'You are a designer assistant who explains design system token choices. Reply concisely and to the point, in English.',
      200,
      controller.signal
    )
      .then(text => {
        if (controller.signal.aborted) return;
        explanationsRef.current.set(cacheKey, text);
        setExplanation(text);
        setExplainError(false);
        setExplaining(false);
      })
      .catch(err => {
        // AbortError — тихо игнорируем: новый запрос уже запущен и управляет state
        if (err && (err.name === 'AbortError' || controller.signal.aborted)) return;
        const msg = String(err);
        let friendly = UI.errorAiGeneric;
        if (msg.includes('401') || msg.includes('403')) friendly = UI.errorAiInvalidKey;
        else if (msg.includes('429')) friendly = UI.errorAiRateLimit;
        else if (msg.includes('503') || msg.includes('overloaded')) friendly = UI.errorAiUnavailable;
        setExplanation(friendly);
        setExplainError(true);
        setExplaining(false);
      });

    return () => {
      controller.abort();
    };
  }, [selectedTokenId, current, result, snapshot]);

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

  // -------------------------------------------------------------------------
  // Рендер: все нарушения обработаны
  // -------------------------------------------------------------------------

  if (total === 0) {
    return (
      <div style={styles.root}>
        <Header
          icon="home"
          onIconClick={onNavigateHome}
          example={example}
          showExampleChip={true}
          onClearExample={onClearExample}
        />
        <div style={styles.doneSlot}>
          <Done metrics={metrics} onCheckAgain={onCheckAgain} onClearMarkers={onClearMarkers} />
        </div>
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

  // TEMP: remove in Ф.16.7
  const fixDisabled = current === null || selectedTokenId === null;
  console.log('[BUG-FIX-DEBUG] current violation', JSON.stringify({
    type: current?.type,
    suggestedTokenId: current?.suggestedTokenId,
    candidatesCount: current?.candidates?.length,
    candidates: current?.candidates?.slice(0, 3).map((c) => ({ id: c.id, kind: (c as any).kind, name: (c as any).name })),
    selectedTokenId: selectedTokenId,
    fixDisabled: fixDisabled,
  }));

  // Ф.17.8: опции для SelectField — две секции в одном плоском массиве:
  //   (a) "suggested" — top-5 кандидатов от детектора (current.candidates после 17.4),
  //       либо одиночный suggestedToken-фолбэк (для detached_style без candidates);
  //   (b) "search" — все snapshot.tokens (search ищет по этому набору).
  // Дедупликация: токены из (a) исключаются из (b) — top-5 имеет приоритет.
  // Если candidates пусты — секция (a) скрыта, отображается только search.
  // Если snapshot отсутствует — секция (b) пуста (старый сценарий, backward compat).
  const suggestionOptions: SelectOption[] = (() => {
    const out: SelectOption[] = [];
    const suggestedIds = new Set<string>();

    if (current && current.candidates && current.candidates.length > 0) {
      for (const c of current.candidates) {
        const isColor = c.value.indexOf('#') === 0;
        out.push({
          id: c.id,
          label: c.name,
          swatch: isColor ? c.value : undefined,
          badge: c.kind === 'variables' ? 'VAR' : 'STYLE',
          section: 'suggested',
        });
        suggestedIds.add(c.id);
      }
    } else if (current && current.suggestedToken && current.suggestedTokenId) {
      const isColor = current.currentValue.indexOf('#') === 0;
      out.push({
        id: current.suggestedTokenId,
        label: current.suggestedToken,
        swatch: isColor ? current.currentValue : undefined,
        badge: 'STYLE',
        section: 'suggested',
      });
      suggestedIds.add(current.suggestedTokenId);
    }

    if (snapshot && snapshot.tokens.length > 0 && current) {
      // Ф.17.12: фильтр snapshot.tokens по природе текущего нарушения, чтобы
      // в search-секции color-нарушений не появлялись числовые spacing/radius
      // variables (например '0', '112'), а в text-нарушениях — color-токены.
      // Классификация нарушения берётся из VIOLATION_CATEGORY (single source
      // of truth, src/shared/strings.ts):
      //   colors      → Token.category === 'color'
      //   typography  → Token.category === 'typography'
      //   layout      → Token.category === 'spacing' | 'radius'
      // detached_style по строке 17 strings.ts всегда отнесён к 'colors'
      // (text-варианта в текущем детекторе нет — если появится, правка пойдёт
      // через VIOLATION_CATEGORY и фильтр продолжит работать).
      const category = VIOLATION_CATEGORY[current.type];
      const allowedTokenCategories: Token['category'][] =
        category === 'colors' ? ['color']
        : category === 'typography' ? ['typography']
        : ['spacing', 'radius']; // layout

      const filtered = snapshot.tokens.filter((t) =>
        allowedTokenCategories.indexOf(t.category) !== -1
      );

      // Алфавитная сортировка по name (стабильное представление при пустом query;
      // search дополнительно отранжирует exact→prefix→contains).
      const sorted = filtered.sort((a, b) =>
        a.name.toLowerCase() < b.name.toLowerCase() ? -1
          : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0
      );
      for (const t of sorted) {
        if (suggestedIds.has(t.id)) continue;  // дедуп: top-5 имеет приоритет
        const isColor = t.value.indexOf('#') === 0;
        out.push({
          id: t.id,
          label: t.name,
          swatch: isColor ? t.value : undefined,
          badge: t.kind === 'variables' ? 'VAR' : 'STYLE',
          section: 'search',
        });
      }
    }

    return out;
  })();

  // Ф.17.8: показывать ли заголовок «Suggested» (только когда есть >0
  // suggested-опций; при пустых candidates секция скрыта целиком).
  const hasSuggestedSection = suggestionOptions.some((o) => o.section === 'suggested');
  const sectionLabels: { [s: string]: string } = {};
  if (hasSuggestedSection) sectionLabels.suggested = 'Suggested for this component';
  // Заголовок «Search all tokens» рисуем только если есть search-опции
  // (т.е. snapshot непустой). Если есть только suggested — заголовков нет
  // (один источник, не нужно навешивать UI-разделитель).
  const hasSearchSection = suggestionOptions.some((o) => o.section === 'search');
  if (hasSuggestedSection && hasSearchSection) sectionLabels.search = 'Search all tokens';

  return (
    <div style={styles.root}>
      <Header icon="home" onIconClick={onNavigateHome} />
      {/* Кнопка возврата */}
      <BackButton onClick={onBack} />

      {/* Навигация по категории: H3 категории слева, inline pagination справа */}
      <div style={styles.categoryNav}>
        <h3 style={styles.categoryLabel}>{categoryLabel}</h3>
        <div style={styles.pagination}>
          <IconButton disabled={categoryIndex <= 0} onClick={goPrev}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </IconButton>
          <span style={styles.categoryCounter}>{categoryIndex + 1}/{categoryTotal}</span>
          <IconButton disabled={categoryIndex >= categoryTotal - 1} onClick={goNext}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </IconButton>
        </div>
      </div>

      {/* Карточка нарушения */}
      {current !== null && (
        <div style={styles.card}>
          {/* Склейка nodeName + hint + currentValue в один body-параграф */}
          <p style={styles.message}>
            {current.nodeName}. {VIOLATION_HINT[current.type]} {current.currentValue}.
          </p>
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
              searchable={hasSearchSection}
              searchPlaceholder="Search all tokens…"
              sectionLabels={sectionLabels}
              searchableSection="search"
              footerHint={
                hasSearchSection && snapshot?.selectedSource?.type === 'library'
                  ? LIBRARY_HINT
                  : undefined
              }
            />
          )}
          {aiEnabled && !hasApiKey && (
            <ErrorCard
              title={UI.aiKeyMissing}
              description={UI.errNoAiKey}
              actionLabel={UI.openSettings}
              onAction={onOpenSettings}
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
            disabled={current === null || selectedTokenId === null}
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
    padding: spacing.containerPadding,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.content,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s300,
    minHeight: '100%',
    boxSizing: 'border-box' as const,
  },
  doneSlot: {
    // flex:1 даёт слоту вертикальный размер от родителя; display:grid +
    // gridTemplateRows:'1fr' надёжно растягивает Done на всю высоту слота
    // (в отличие от flex-column, где `height:100%` ребёнка может не
    // подхватываться). Это позволяет marginTop:auto на кнопках внутри
    // Done прижать их к низу.
    flex: 1,
    display: 'grid',
    gridTemplateRows: '1fr',
  },
  categoryNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s200,
    marginBottom: spacing.s300,
  },
  categoryLabel: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
    letterSpacing: typography.h3.letterSpacing,
    color: colors.content,
    margin: 0,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.s200,
    color: colors.accent,
  },
  categoryCounter: {
    fontFamily: typography.bodyBold.fontFamily,
    fontSize: typography.bodyBold.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.accent,
    minWidth: '32px',
    textAlign: 'center' as const,
  },
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.s200,
    marginBottom: spacing.s300,
  },
  message: {
    color: colors.content,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    margin: 0,
  },
  explanation: {
    fontSize: typography.body.fontSize,
    color: colors.content,
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
    background: colors.bgDefault,
    border: '1px dashed ' + colors.errorFill,
    borderRadius: radii.r200,
    overflow: 'hidden',
    marginTop: spacing.s200,
    padding: spacing.s300,
    boxSizing: 'border-box' as const,
  },
  previewImg: {
    maxWidth: '100%',
    maxHeight: 200,
    objectFit: 'contain' as const,
    display: 'block',
  },
  previewPlaceholder: {
    fontFamily: typography.bodyBold.fontFamily,
    fontSize: typography.bodyBold.fontSize,
    fontWeight: typography.bodyBold.fontWeight,
    color: colors.accent,
    padding: spacing.s300,
    textAlign: 'center' as const,
  },
} satisfies Record<string, React.CSSProperties>;
