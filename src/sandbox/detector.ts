import type { ScanResult, ReferenceSnapshot, Violation, DetectionResult, Severity, TokenSource, TokenPolicy, ScannedColor, ScannedText, Example, ExampleSlot, Token, ViolationType, SlotRole } from '../shared/types';

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/** Конвертирует "#RRGGBB" в объект {r, g, b} с каналами 0–255 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r: r, g: g, b: b };
}

/** Проверяет, отличаются ли два цвета не более чем на delta по каждому RGB-каналу */
function isColorSimilar(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  delta: number,
): boolean {
  return (
    Math.abs(a.r - b.r) <= delta &&
    Math.abs(a.g - b.g) <= delta &&
    Math.abs(a.b - b.b) <= delta
  );
}

/** Формирует уникальный ID нарушения из ID ноды и типа нарушения */
function makeViolationId(nodeId: string, type: string): string {
  return nodeId + '_' + type;
}

/**
 * Ф.17.4: возвращает топ-5 кандидатов с component-aware narrowing.
 * Если у узла нет componentName, индекс отсутствует или для компонента нет записи —
 * возвращает scored.slice(0, 5) (fallback на полную палитру).
 * Если фильтрация по индексу даёт ≥2 кандидатов — возвращает их (до 5).
 * Если <2 — возвращает полную палитру (решение PO: «слишком узко»).
 */
function pickTopCandidates<T extends { id: string }>(
  scored: Array<{ token: T; dist: number }>,
  scanResult: ScanResult,
  componentName: string | undefined,
): Array<{ token: T; dist: number }> {
  const fallback = scored.slice(0, 5);
  if (componentName === undefined || componentName === '') return fallback;
  const index = scanResult.componentTokenIndex;
  if (index === undefined) return fallback;
  const ids = index[componentName];
  if (ids === undefined || ids.length === 0) return fallback;
  const allowed = new Set<string>(ids);
  const narrowed: Array<{ token: T; dist: number }> = [];
  for (let i = 0; i < scored.length && narrowed.length < 5; i++) {
    if (allowed.has(scored[i].token.id)) narrowed.push(scored[i]);
  }
  return narrowed.length >= 2 ? narrowed : fallback;
}

// ---------------------------------------------------------------------------
// Ф.18a (шаг 18.10): priority override на основе эталона
// ---------------------------------------------------------------------------

/**
 * Маппинг типа нарушения → slotKind эталона (см. ExampleSlot.slotKind).
 * Согласовано в шаге 18.3: stroke и fill объединены под 'fill', поэтому
 * для всех цветовых нарушений используется один slotKind.
 *
 * `nonstandard_font_size` пока не маппится: в эталоне нет slotKind 'font-size'
 * (отдельной шкалы), а text-style целиком включает font-size + family + weight,
 * что не подходит для одиночной замены fontSize. Эта развилка отложена в Ф.18b.
 */
function slotKindForViolation(type: ViolationType): ExampleSlot['slotKind'] | null {
  if (type === 'hardcoded_color' || type === 'detached_style' || type === 'similar_to_token') {
    return 'fill';
  }
  if (type === 'missing_text_style') {
    return 'text-style';
  }
  if (type === 'spacing_off_scale') {
    return 'spacing';
  }
  return null;
}

/**
 * Ф.18a (шаг 18.13.4): определяет семантическую роль нарушения, чтобы
 * матчить его с подходящими слотами эталона. Симметрична `inferRole` в
 * `exampleParser.ts`: те же правила (text-style → text, stroke → border,
 * TEXT-нода → text, иначе для color → background).
 *
 * scannedNode — данные из ScanResult (ScannedColor для цветовых нарушений,
 * ScannedText для текстовых; undefined как defensive fallback). Для
 * `missing_text_style` роль определяется по типу нарушения и не требует node.
 *
 * Один helper с union вместо двух (color + typography), т.к. развилка идёт
 * по `violation.type` сверху вниз, а node нужен только в ветке hardcoded_color
 * для чтения paintTarget / nodeType.
 */
function inferViolationRole(
  violation: Violation,
  scannedNode: ScannedColor | ScannedText | undefined,
): SlotRole {
  // (a) typography по определению.
  if (violation.type === 'missing_text_style') return 'text';

  // (b) hardcoded_color: stroke → border, TEXT → text, иначе background.
  if (violation.type === 'hardcoded_color' || violation.type === 'detached_style' || violation.type === 'similar_to_token') {
    if (scannedNode !== undefined && (scannedNode as ScannedColor).paintTarget === 'stroke') return 'border';
    if (scannedNode !== undefined && (scannedNode as ScannedColor).nodeType === 'TEXT') return 'text';
    return 'background';
  }

  // (c)/(d) spacing и прочие — multi-slot вне scope 18.13.
  return 'unknown';
}

/**
 * Ф.18a (шаг 18.13.4): возвращает ВСЕ слоты эталона указанного slotKind+role
 * (E4=a — все слоты роли попадают в candidates). При отсутствии матча по role
 * graceful fallback на role='unknown' (E5: миграция legacy-example в 18.13.5
 * проставит role='unknown' старым слотам). При полном отсутствии матча по
 * slotKind — null, тогда `applyExampleOverride` отдаёт управление старой
 * логике pickTopCandidates (R-13.4=b).
 */
function findExampleSlot(
  example: Example | null,
  kind: ExampleSlot['slotKind'],
  role: SlotRole,
): ExampleSlot[] | null {
  if (example === null) return null;

  // 1. Точный матч по slotKind+role.
  const exact: ExampleSlot[] = [];
  for (let i = 0; i < example.slots.length; i++) {
    if (example.slots[i].slotKind === kind && example.slots[i].role === role) {
      exact.push(example.slots[i]);
    }
  }
  if (exact.length > 0) return exact;

  // 2. Fallback на role='unknown' (E5 graceful для legacy-example).
  const unknown: ExampleSlot[] = [];
  for (let i = 0; i < example.slots.length; i++) {
    if (example.slots[i].slotKind === kind && example.slots[i].role === 'unknown') {
      unknown.push(example.slots[i]);
    }
  }
  if (unknown.length > 0) return unknown;

  // 3. Полное отсутствие матча — sentinel для перехода на pickTopCandidates.
  return null;
}

/**
 * Создаёт Token-обёртку из ExampleSlot, если в snapshot нет реального токена
 * с таким id. Это inline fallback для library-токенов (R6 / эскалация шага
 * 18.10): эталон может ссылаться на токен, которого нет в snapshot текущей
 * библиотеки. UI получает корректные name/value/id для рендера и Fix.
 *
 * `kind` определяется по slotKind: 'fill' / 'spacing' / 'radius' → variables
 * как самый общий kind (UI отрендерит без дополнительной семантики);
 * 'text-style' → textStyles. Лучшего хеуристика нет, т.к. ExampleSlot
 * не различает Style vs Variable.
 */
function tokenFromSlot(slot: ExampleSlot): Token {
  let category: Token['category'];
  let kind: Token['kind'];
  if (slot.slotKind === 'fill') {
    category = 'color';
    kind = 'variables';
  } else if (slot.slotKind === 'text-style') {
    category = 'typography';
    kind = 'textStyles';
  } else if (slot.slotKind === 'spacing') {
    category = 'spacing';
    kind = 'variables';
  } else {
    category = 'radius';
    kind = 'variables';
  }
  return {
    id: slot.tokenId,
    name: slot.tokenName,
    category: category,
    value: slot.hexInTheme,
    source: 'Example',
    kind: kind,
  };
}

/**
 * Возвращает Token из snapshot по id; если не нашёл — fallback на
 * inline-Token из ExampleSlot (R6: эталон может ссылаться на library-токен,
 * которого нет в snapshot).
 */
function resolveTokenForSlot(snapshot: ReferenceSnapshot | null, slot: ExampleSlot): Token {
  if (snapshot !== null) {
    for (let i = 0; i < snapshot.tokens.length; i++) {
      if (snapshot.tokens[i].id === slot.tokenId) return snapshot.tokens[i];
    }
  }
  return tokenFromSlot(slot);
}

/**
 * Применяет priority override от эталона к одному violation.
 *
 * Ф.18a (шаг 18.13.4): теперь учитывает SlotRole. Алгоритм:
 *  1. Определяем роль нарушения через `inferViolationRole` (по типу +
 *     ScannedColor.paintTarget/nodeType).
 *  2. Находим ВСЕ слоты эталона с подходящими slotKind+role
 *     (E4=a; fallback на role='unknown' для legacy-example).
 *  3. Если матч есть — берём первый слот как primary suggestion,
 *     остальные слоты + старые candidates (от pickTopCandidates) сливаем
 *     в единый список с дедупом по tokenId и лимитом 10.
 *  4. Если матча нет — оставляем результат старой логики
 *     (R-13.4=b: pickTopCandidates как fallback).
 *
 * `scannedNode` — данные ScanResult по nodeId нарушения (нужны только
 * для inferViolationRole; индексы строит вызывающий runDetection).
 */
function applyExampleOverride(
  violation: Violation,
  example: Example | null,
  snapshot: ReferenceSnapshot | null,
  scannedNode: ScannedColor | ScannedText | undefined,
): void {
  if (example === null) return;
  const kind = slotKindForViolation(violation.type);
  if (kind === null) return;

  const role = inferViolationRole(violation, scannedNode);
  const matchedSlots = findExampleSlot(example, kind, role);
  if (matchedSlots === null) return; // R-13.4=b: fallback на pickTopCandidates.

  const primarySlot = matchedSlots[0];
  const primaryToken = resolveTokenForSlot(snapshot, primarySlot);
  violation.suggestedToken = primaryToken.name;
  violation.suggestedTokenId = primaryToken.id;
  violation.exampleSlot = primarySlot;

  // Сборка candidates: сначала все слоты роли, затем старый top-N от
  // pickTopCandidates (уже лежит в violation.candidates), потом дедуп
  // по tokenId и лимит 10. Multi-slot идут первыми, поэтому при коллизии
  // tokenId сохраняется их вариант (важно для R6 inline tokens из эталона).
  const seen: { [tokenId: string]: boolean } = {};
  const merged: Array<{ id: string; name: string; value: string; kind: 'paintStyles' | 'textStyles' | 'variables' }> = [];

  for (let i = 0; i < matchedSlots.length; i++) {
    const t = resolveTokenForSlot(snapshot, matchedSlots[i]);
    if (seen[t.id] === true) continue;
    seen[t.id] = true;
    merged.push({ id: t.id, name: t.name, value: t.value, kind: t.kind });
    if (merged.length >= 10) break;
  }

  if (violation.candidates !== undefined && merged.length < 10) {
    for (let i = 0; i < violation.candidates.length; i++) {
      const c = violation.candidates[i];
      if (seen[c.id] === true) continue;
      seen[c.id] = true;
      merged.push(c);
      if (merged.length >= 10) break;
    }
  }

  violation.candidates = merged;
}

// ---------------------------------------------------------------------------
// Основная функция
// ---------------------------------------------------------------------------

/**
 * Запускает аудит файла на соответствие дизайн-системе.
 * Использует результат сканирования нод и (если есть) эталонный снепшот.
 *
 * Ф.18a (шаг 18.10): добавлен параметр `example`. Если задан — для каждого
 * нарушения соответствующего slotKind детектор перезаписывает suggestedToken
 * первым подходящим слотом эталона (priority override). Старая логика
 * hex-расстояния остаётся как fallback: для нарушений без покрытия по
 * slotKind работает как раньше.
 */
export function runDetection(
  scanResult: ScanResult,
  snapshot: ReferenceSnapshot | null,
  tokenSource: TokenSource,
  tokenPolicy: TokenPolicy,
  example: Example | null = null,
): DetectionResult {
  const violations: Violation[] = [];

  // Индекс для быстрого поиска и замены нарушений по nodeId
  // Ключ: nodeId — для цветовых нарушений одна нода имеет не более одного цветового violation
  const colorViolationIndex: Record<string, number> = {};

  // -------------------------------------------------------------------------
  // Шаг 1: проверки цветов (без снепшота — hardcoded_color)
  // -------------------------------------------------------------------------

  for (let i = 0; i < scanResult.colors.length; i++) {
    const color = scanResult.colors[i];
    if (color.boundStyleId !== null) continue;
    if (color.boundVariableId !== null) continue;

    const violation: Violation = {
      id: makeViolationId(color.nodeId, 'hardcoded_color'),
      type: 'hardcoded_color',
      severity: 'critical',
      nodeId: color.nodeId,
      nodeName: color.nodeName,
      pageId: color.pageId,
      pageName: color.pageName,
      message: 'Цвет ' + color.hex + ' задан напрямую, не привязан к стилю',
      currentValue: color.hex,
      suggestedToken: null,
      suggestedTokenId: null,
    };

    colorViolationIndex[color.nodeId] = violations.length;
    violations.push(violation);
  }

  // -------------------------------------------------------------------------
  // Шаг 2: проверки текстов (без снепшота — missing_text_style)
  // -------------------------------------------------------------------------

  for (let i = 0; i < scanResult.texts.length; i++) {
    const text = scanResult.texts[i];
    if (text.boundStyleId !== null) continue;

    violations.push({
      id: makeViolationId(text.nodeId, 'missing_text_style'),
      type: 'missing_text_style',
      severity: 'warning',
      nodeId: text.nodeId,
      nodeName: text.nodeName,
      pageId: text.pageId,
      pageName: text.pageName,
      message: 'Текст ' + text.fontSize + 'px без привязанного стиля',
      currentValue: text.fontSize + 'px/' + text.fontFamily + '/' + text.fontWeight,
      suggestedToken: null,
      suggestedTokenId: null,
    });
  }

  // -------------------------------------------------------------------------
  // Шаг 3: уточняющие проверки со снепшотом
  // -------------------------------------------------------------------------

  if (snapshot !== null) {
    // Извлекаем цветовые токены один раз
    const colorTokens = [];
    for (let i = 0; i < snapshot.tokens.length; i++) {
      const t = snapshot.tokens[i];
      if (t.category !== 'color') continue;
      if (tokenSource === 'styles' && t.kind !== 'paintStyles') continue;
      if (tokenSource === 'variables' && t.kind !== 'variables') continue;
      // Policy 'semantic-only': для variables оставляем только isSemantic === true.
      // PaintStyles "семантичны" по природе (имеют осмысленные имена) — пропускаем.
      if (tokenPolicy === 'semantic-only' && t.kind === 'variables' && t.isSemantic !== true) continue;
      colorTokens.push(t);
    }

    // --- Уточнение цветовых нарушений ---
    for (let i = 0; i < scanResult.colors.length; i++) {
      const color = scanResult.colors[i];
      if (color.boundStyleId !== null) continue;
      if (color.boundVariableId !== null) continue;

      const existingIndex = colorViolationIndex[color.nodeId];
      if (existingIndex === undefined) continue;

      const rgb = hexToRgb(color.hex);


      // Ищем точное совпадение с токеном
      let exactMatch = null;
      for (let j = 0; j < colorTokens.length; j++) {
        if (colorTokens[j].value === color.hex) {
          exactMatch = colorTokens[j];
          break;
        }
      }

      if (exactMatch !== null) {
        // Цвет совпадает с токеном, но стиль не привязан → detached_style
        violations[existingIndex] = {
          id: makeViolationId(color.nodeId, 'detached_style'),
          type: 'detached_style',
          severity: 'warning',
          nodeId: color.nodeId,
          nodeName: color.nodeName,
          pageId: color.pageId,
          pageName: color.pageName,
          message: 'Цвет ' + color.hex + ' совпадает с токеном, но стиль не привязан',
          currentValue: color.hex,
          suggestedToken: exactMatch.name,
          suggestedTokenId: exactMatch.id,
        };
        continue;
      }

      // Ищем похожий токен (дельта ≤ 5 по каждому каналу)
      let similarMatch = null;
      for (let j = 0; j < colorTokens.length; j++) {
        const tokenRgb = hexToRgb(colorTokens[j].value);
        if (isColorSimilar(rgb, tokenRgb, 5)) {
          similarMatch = colorTokens[j];
          break;
        }
      }

      if (similarMatch !== null) {
        // Цвет близок к токену → similar_to_token
        violations[existingIndex] = {
          id: makeViolationId(color.nodeId, 'similar_to_token'),
          type: 'similar_to_token',
          severity: 'warning',
          nodeId: color.nodeId,
          nodeName: color.nodeName,
          pageId: color.pageId,
          pageName: color.pageName,
          message: 'Цвет ' + color.hex + ' похож на токен "' + similarMatch.name + '"',
          currentValue: color.hex,
          suggestedToken: similarMatch.name,
          suggestedTokenId: similarMatch.id,
        };
      }
      // Если точного и похожего совпадения нет — собираем топ-5 по манхэттенской дистанции
      if (similarMatch === null && colorTokens.length > 0) {
        var scored = [];
        for (var k = 0; k < colorTokens.length; k++) {
          var tokenRgb2 = hexToRgb(colorTokens[k].value);
          var dist = Math.abs(rgb.r - tokenRgb2.r)
                   + Math.abs(rgb.g - tokenRgb2.g)
                   + Math.abs(rgb.b - tokenRgb2.b);
          scored.push({ token: colorTokens[k], dist: dist });
        }
        scored.sort(function(a, b){ return a.dist - b.dist; });
        // Ф.17.4: топ-5 + component-aware narrowing (fallback на полную палитру при <2).
        var top = pickTopCandidates(scored, scanResult, color.componentName);

        if (top.length > 0) {
          var best = top[0].token;
          violations[existingIndex].suggestedToken = best.name;
          violations[existingIndex].suggestedTokenId = best.id;
          violations[existingIndex].message = 'Цвет ' + color.hex + ' задан напрямую. Ближайший токен: ' + best.name;
          violations[existingIndex].candidates = top.map(function(s){
            return { id: s.token.id, name: s.token.name, value: s.token.value, kind: s.token.kind };
          });
        }
      }
    }

    // --- Проверка размеров шрифта по шкале ---
    const fontSizes = snapshot.scales.fontSizes;
    if (fontSizes.length > 0) {
      for (let i = 0; i < scanResult.texts.length; i++) {
        const text = scanResult.texts[i];
        if (text.boundStyleId !== null) continue;
        if (text.fontSize === -1) continue; // mixed — пропускаем

        let inScale = false;
        for (let j = 0; j < fontSizes.length; j++) {
          if (fontSizes[j] === text.fontSize) {
            inScale = true;
            break;
          }
        }

        if (!inScale) {
          violations.push({
            id: makeViolationId(text.nodeId, 'nonstandard_font_size'),
            type: 'nonstandard_font_size',
            severity: 'info',
            nodeId: text.nodeId,
            nodeName: text.nodeName,
            pageId: text.pageId,
            pageName: text.pageName,
            message: 'Размер шрифта ' + text.fontSize + 'px не входит в шкалу дизайн-системы',
            currentValue: text.fontSize + 'px',
            suggestedToken: null,
            suggestedTokenId: null,
          });
        }
      }
    }
  }

  // --- Рекомендация ближайшего текстового стиля для текстов без стиля ---
  // TODO: tokenPolicy 'semantic-only' для текста пока не применяется —
  // у Figma нет text-Variables, а TextStyles по природе семантичны.
  var textTokens = [];
  if (snapshot) {
    for (var t = 0; t < snapshot.tokens.length; t++) {
      var typoTok = snapshot.tokens[t];
      if (typoTok.category !== 'typography') continue;
      // Типографика всегда из TextStyles — text-Variables в Figma не существуют.
      // tokenSource фильтр игнорируется для text-токенов.
      if (typoTok.kind !== 'textStyles') continue;
      textTokens.push(typoTok);
    }
  }

  if (textTokens.length > 0) {
    // Индекс scanResult.texts по nodeId — чтобы достать componentName для текущей violation.
    var textByNodeId: { [nodeId: string]: ScannedText } = {};
    for (var txi = 0; txi < scanResult.texts.length; txi++) {
      textByNodeId[scanResult.texts[txi].nodeId] = scanResult.texts[txi];
    }

    for (var ti = 0; ti < violations.length; ti++) {
      if (violations[ti].type === 'missing_text_style' && violations[ti].suggestedTokenId === null) {
        // Собираем топ-5 ближайших текстовых стилей по fontSize
        var violFontSize = parseFloat(violations[ti].currentValue);
        if (isNaN(violFontSize)) continue;

        var scoredText = [];
        for (var tt = 0; tt < textTokens.length; tt++) {
          var tokenFontSize = parseFloat(textTokens[tt].value);
          if (isNaN(tokenFontSize)) continue;
          var d = Math.abs(violFontSize - tokenFontSize);
          scoredText.push({ token: textTokens[tt], dist: d });
        }
        scoredText.sort(function(a, b){ return a.dist - b.dist; });
        // Ф.17.4: топ-5 + component-aware narrowing (текстовый индекс через boundStyleId).
        var textCompName = textByNodeId[violations[ti].nodeId] !== undefined
          ? textByNodeId[violations[ti].nodeId].componentName
          : undefined;
        var topText = pickTopCandidates(scoredText, scanResult, textCompName);

        if (topText.length > 0) {
          var bestT = topText[0].token;
          violations[ti].suggestedToken = bestT.name;
          violations[ti].suggestedTokenId = bestT.id;
          violations[ti].message = 'Текст ' + violFontSize + 'px без стиля. Ближайший: ' + bestT.name;
          violations[ti].candidates = topText.map(function(s){
            return { id: s.token.id, name: s.token.name, value: s.token.value, kind: s.token.kind };
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Ф.18a (шаг 18.10): priority override от эталона
  //
  // Эталон работает как PRIORITY OVERRIDE, а не замена. Если example !== null
  // и у нарушения есть слот эталона соответствующего slotKind — берём
  // токен слота первым кандидатом и заполняем suggestedToken / exampleSlot.
  // Старая логика выше (hex-расстояние, similar / detached / fontSize
  // ranking) уже отработала и осталась fallback'ом для непокрытых slotKind.
  // -------------------------------------------------------------------------

  if (example !== null) {
    // Индексы ScannedColor / ScannedText по nodeId — нужны inferViolationRole
    // (paintTarget / nodeType для color, defensive undefined для остальных).
    const colorByNodeId: { [nodeId: string]: ScannedColor } = {};
    for (let i = 0; i < scanResult.colors.length; i++) {
      colorByNodeId[scanResult.colors[i].nodeId] = scanResult.colors[i];
    }
    const textByNodeIdForOverride: { [nodeId: string]: ScannedText } = {};
    for (let i = 0; i < scanResult.texts.length; i++) {
      textByNodeIdForOverride[scanResult.texts[i].nodeId] = scanResult.texts[i];
    }

    for (let i = 0; i < violations.length; i++) {
      const v = violations[i];
      let scanned: ScannedColor | ScannedText | undefined;
      if (v.type === 'missing_text_style' || v.type === 'nonstandard_font_size') {
        scanned = textByNodeIdForOverride[v.nodeId];
      } else {
        scanned = colorByNodeId[v.nodeId];
      }
      applyExampleOverride(v, example, snapshot, scanned);
    }
  }

  // -------------------------------------------------------------------------
  // Шаг 4: подсчёт сводки
  // -------------------------------------------------------------------------

  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (let i = 0; i < violations.length; i++) {
    const sev: Severity = violations[i].severity;
    if (sev === 'critical') {
      criticalCount += 1;
    } else if (sev === 'warning') {
      warningCount += 1;
    } else {
      infoCount += 1;
    }
  }

  // -------------------------------------------------------------------------
  // Шаг 5: health score
  // -------------------------------------------------------------------------

  const totalNodes = scanResult.totalNodesScanned > 0 ? scanResult.totalNodesScanned : 1;
  const penalty = (criticalCount * 3 + warningCount * 1 + infoCount * 0.5) * 100 / totalNodes;
  const raw = 100 - penalty;
  const healthScore = Math.round(Math.min(100, Math.max(0, raw)));

  return {
    violations: violations,
    healthScore: healthScore,
    summary: {
      total: violations.length,
      critical: criticalCount,
      warning: warningCount,
      info: infoCount,
    },
  };
}
