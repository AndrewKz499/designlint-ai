import type { Token, TokenCategory, ReferenceSnapshot, SnapshotSource, SnapshotValidationIssue } from '../shared/types';

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/** Конвертирует цвет из формата Figma (r, g, b: 0–1) в "#RRGGBB" (uppercase) */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (val: number): string =>
    Math.round(val * 255).toString(16).padStart(2, '0').toUpperCase();
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Простой детерминированный хэш строки (djb2).
 * Используется для определения изменений снепшота между сканами.
 */
function computeHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Определяет категорию FLOAT-переменной по её имени.
 * Если имя содержит 'radius' или 'corner' → 'radius', иначе → 'spacing'.
 */
function floatCategory(name: string): TokenCategory {
  const lower = name.toLowerCase();
  if (lower.indexOf('radius') !== -1 || lower.indexOf('corner') !== -1) {
    return 'radius';
  }
  return 'spacing';
}

/**
 * Проверяет, является ли значение переменной цветовым объектом {r, g, b}.
 * Figma возвращает VariableValue, который может быть числом, строкой,
 * булевым, объектом цвета или алиасом переменной.
 */
function isRGBColor(val: unknown): val is { r: number; g: number; b: number } {
  if (typeof val !== 'object' || val === null) return false;
  const c = val as Record<string, unknown>;
  return typeof c['r'] === 'number' && typeof c['g'] === 'number' && typeof c['b'] === 'number';
}

// ---------------------------------------------------------------------------
// Публичные функции
// ---------------------------------------------------------------------------

/**
 * Обнаруживает все источники токенов дизайн-системы в текущем Figma-файле:
 * коллекции переменных и локальные стили (цветовые и текстовые).
 */
export async function discoverSources(): Promise<SnapshotSource[]> {
  const sources: SnapshotSource[] = [];

  // --- Коллекции переменных (Variables) ---
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    sources.push({
      name: collection.name,
      type: 'variables',
      tokenCount: collection.variableIds.length,
      enabled: true,
    });
  }

  // --- Локальные цветовые стили (Paint Styles) ---
  const paintStyles = await figma.getLocalPaintStylesAsync();
  if (paintStyles.length > 0) {
    sources.push({
      name: 'Local Paint Styles',
      type: 'local-styles',
      tokenCount: paintStyles.length,
      enabled: true,
    });
  }

  // --- Локальные текстовые стили (Text Styles) ---
  const textStyles = await figma.getLocalTextStylesAsync();
  if (textStyles.length > 0) {
    sources.push({
      name: 'Local Text Styles',
      type: 'local-styles',
      tokenCount: textStyles.length,
      enabled: true,
    });
  }

  return sources;
}

/**
 * Собирает токены из включённых источников и строит ReferenceSnapshot —
 * эталонный снепшот дизайн-системы для последующего сравнения.
 *
 * @param enabledSources — список имён источников, выбранных пользователем
 */
export async function buildSnapshot(enabledSources: string[]): Promise<ReferenceSnapshot> {
  const tokens: Token[] = [];

  // --- Токены из коллекций переменных ---
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];

    // Пропускаем коллекции, не выбранные пользователем
    if (enabledSources.indexOf(collection.name) === -1) continue;

    for (let j = 0; j < collection.variableIds.length; j++) {
      const variable = await figma.variables.getVariableByIdAsync(collection.variableIds[j]);

      // Переменная могла быть удалена между вызовами
      if (variable === null) continue;

      let category: TokenCategory;
      let value: string;

      if (variable.resolvedType === 'COLOR') {
        category = 'color';
        // Берём значение из первого режима коллекции
        const modeValues = Object.values(variable.valuesByMode);
        if (modeValues.length === 0) continue;
        const raw = modeValues[0];
        if (!isRGBColor(raw)) continue; // алиас или неожиданный формат
        value = rgbToHex(raw.r, raw.g, raw.b);

      } else if (variable.resolvedType === 'FLOAT') {
        category = floatCategory(variable.name);
        const modeValues = Object.values(variable.valuesByMode);
        if (modeValues.length === 0) continue;
        const raw = modeValues[0];
        if (typeof raw !== 'number') continue;
        value = String(raw);

      } else {
        // STRING и BOOLEAN токены не обрабатываем
        continue;
      }

      tokens.push({
        id: variable.id,
        name: variable.name,
        category,
        value,
        source: collection.name,
      });
    }
  }

  // --- Токены из локальных цветовых стилей ---
  if (enabledSources.indexOf('Local Paint Styles') !== -1) {
    const paintStyles = await figma.getLocalPaintStylesAsync();
    for (let i = 0; i < paintStyles.length; i++) {
      const style = paintStyles[i];
      if (style.paints.length === 0) continue;
      const paint = style.paints[0];
      if (paint.type !== 'SOLID') continue;
      const { r, g, b } = paint.color;
      tokens.push({
        id: style.id,
        name: style.name,
        category: 'color',
        value: rgbToHex(r, g, b),
        source: 'Local Paint Styles',
      });
    }
  }

  // --- Токены из локальных текстовых стилей ---
  if (enabledSources.indexOf('Local Text Styles') !== -1) {
    const textStyles = await figma.getLocalTextStylesAsync();
    for (let i = 0; i < textStyles.length; i++) {
      const style = textStyles[i];
      const fontSize = typeof style.fontSize === 'number' ? style.fontSize : 0;
      const family = style.fontName.family;
      const weight = style.fontName.style;
      tokens.push({
        id: style.id,
        name: style.name,
        category: 'typography',
        value: fontSize + 'px/' + family + '/' + weight,
        source: 'Local Text Styles',
      });
    }
  }

  // --- Построение шкал из числовых токенов ---
  const spacingValues: number[] = [];
  const radiusValues: number[] = [];
  const fontSizeValues: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.category === 'spacing') {
      const n = parseFloat(token.value);
      if (!isNaN(n) && spacingValues.indexOf(n) === -1) spacingValues.push(n);
    } else if (token.category === 'radius') {
      const n = parseFloat(token.value);
      if (!isNaN(n) && radiusValues.indexOf(n) === -1) radiusValues.push(n);
    } else if (token.category === 'typography') {
      // Извлекаем fontSize из строки вида "16px/Inter/Bold"
      const n = parseFloat(token.value);
      if (!isNaN(n) && fontSizeValues.indexOf(n) === -1) fontSizeValues.push(n);
    }
  }

  spacingValues.sort((a, b) => a - b);
  radiusValues.sort((a, b) => a - b);
  fontSizeValues.sort((a, b) => a - b);

  // --- Валидация снепшота ---
  const issues: SnapshotValidationIssue[] = [];

  // Проверка на пустые значения
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value === '') {
      issues.push({
        type: 'empty-value',
        message: 'Токен "' + tokens[i].name + '" имеет пустое значение',
        tokenId: tokens[i].id,
      });
    }
  }

  // Проверка на дублирующиеся имена
  const seenNames: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (seenNames[token.name] !== undefined) {
      issues.push({
        type: 'duplicate-name',
        message: 'Дублирующееся имя токена: "' + token.name + '"',
        tokenId: token.id,
      });
    } else {
      seenNames[token.name] = token.id;
    }
  }

  // --- Сборка снапшота источников для поля sources ---
  const sourceMap: Record<string, number> = {};
  for (let i = 0; i < tokens.length; i++) {
    const src = tokens[i].source;
    sourceMap[src] = (sourceMap[src] || 0) + 1;
  }
  const sources: SnapshotSource[] = Object.keys(sourceMap).map((name) => ({
    name,
    type: (name === 'Local Paint Styles' || name === 'Local Text Styles')
      ? 'local-styles'
      : 'variables',
    tokenCount: sourceMap[name],
    enabled: true,
  }));

  // --- Хэш для отслеживания изменений ---
  const hashInput = tokens.map((t) => t.id + ':' + t.value).join('|');
  const hash = computeHash(hashInput);

  return {
    tokens,
    sources,
    scales: {
      spacingScale: spacingValues,
      radiusScale: radiusValues,
      fontSizes: fontSizeValues,
    },
    validation: {
      issues,
      totalTokens: tokens.length,
    },
    createdAt: Date.now(),
    hash,
  };
}

// ---------------------------------------------------------------------------
// Работа с clientStorage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'designlint-snapshot';
const MAX_ISSUES = 20;

/**
 * Сохраняет снепшот в clientStorage.
 * Перед сохранением обрезает список проблем валидации до MAX_ISSUES записей,
 * чтобы не превысить квоту хранилища.
 */
export async function saveSnapshot(snapshot: ReferenceSnapshot): Promise<void> {
  const toSave: ReferenceSnapshot = {
    tokens: snapshot.tokens,
    sources: snapshot.sources,
    scales: snapshot.scales,
    validation: {
      issues: snapshot.validation.issues.slice(0, MAX_ISSUES),
      totalTokens: snapshot.validation.totalTokens,
    },
    createdAt: snapshot.createdAt,
    hash: snapshot.hash,
  };
  await figma.clientStorage.setAsync(STORAGE_KEY, toSave);
}

/**
 * Загружает снепшот из clientStorage.
 * Возвращает null если данных нет (первый запуск или хранилище очищено).
 */
export async function loadSnapshot(): Promise<ReferenceSnapshot | null> {
  const data = await figma.clientStorage.getAsync(STORAGE_KEY);
  if (data === undefined || data === null) return null;
  return data as ReferenceSnapshot;
}

/**
 * Быстро проверяет, устарел ли снепшот.
 * Считает текущее суммарное количество токенов (переменные + стили)
 * и сравнивает с snapshot.validation.totalTokens.
 * Возвращает true если количество изменилось — снепшот нужно пересобрать.
 */
export async function isSnapshotStale(snapshot: ReferenceSnapshot): Promise<boolean> {
  let currentCount = 0;

  // Переменные: суммируем variableIds всех коллекций
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (let i = 0; i < collections.length; i++) {
    currentCount += collections[i].variableIds.length;
  }

  // Локальные цветовые стили
  const paintStyles = await figma.getLocalPaintStylesAsync();
  currentCount += paintStyles.length;

  // Локальные текстовые стили
  const textStyles = await figma.getLocalTextStylesAsync();
  currentCount += textStyles.length;

  return currentCount !== snapshot.validation.totalTokens;
}
