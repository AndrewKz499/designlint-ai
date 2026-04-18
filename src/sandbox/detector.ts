import type { ScanResult, ReferenceSnapshot, Violation, DetectionResult, Severity } from '../shared/types';

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

// ---------------------------------------------------------------------------
// Основная функция
// ---------------------------------------------------------------------------

/**
 * Запускает аудит файла на соответствие дизайн-системе.
 * Использует результат сканирования нод и (если есть) эталонный снепшот.
 */
export function runDetection(
  scanResult: ScanResult,
  snapshot: ReferenceSnapshot | null,
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
      if (snapshot.tokens[i].category === 'color') {
        colorTokens.push(snapshot.tokens[i]);
      }
    }

    // --- Уточнение цветовых нарушений ---
    for (let i = 0; i < scanResult.colors.length; i++) {
      const color = scanResult.colors[i];
      if (color.boundStyleId !== null) continue;

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
      // Если точного и похожего совпадения нет — собираем топ-3 по манхэттенской дистанции
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
        var top = scored.slice(0, 3);

        if (top.length > 0) {
          var best = top[0].token;
          violations[existingIndex].suggestedToken = best.name;
          violations[existingIndex].suggestedTokenId = best.id;
          violations[existingIndex].message = 'Цвет ' + color.hex + ' задан напрямую. Ближайший токен: ' + best.name;
          violations[existingIndex].candidates = top.map(function(s){
            return { id: s.token.id, name: s.token.name, value: s.token.value };
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
  var textTokens = [];
  if (snapshot) {
    for (var t = 0; t < snapshot.tokens.length; t++) {
      if (snapshot.tokens[t].category === 'typography') {
        textTokens.push(snapshot.tokens[t]);
      }
    }
  }

  if (textTokens.length > 0) {
    for (var ti = 0; ti < violations.length; ti++) {
      if (violations[ti].type === 'missing_text_style' && violations[ti].suggestedTokenId === null) {
        // Собираем топ-3 ближайших текстовых стилей по fontSize
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
        var topText = scoredText.slice(0, 3);

        if (topText.length > 0) {
          var bestT = topText[0].token;
          violations[ti].suggestedToken = bestT.name;
          violations[ti].suggestedTokenId = bestT.id;
          violations[ti].message = 'Текст ' + violFontSize + 'px без стиля. Ближайший: ' + bestT.name;
          violations[ti].candidates = topText.map(function(s){
            return { id: s.token.id, name: s.token.name, value: s.token.value };
          });
        }
      }
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
