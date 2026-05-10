import type {
  Token,
  TokenCategory,
  ReferenceSnapshot,
  SnapshotSource,
  SnapshotValidationIssue,
  SelectedSource,
} from '../shared/types';
import { setSelectedSource } from './sourcePreferences';

// Локальный formatter notify-сообщения о потере доступа к библиотеке.
// Импорт всего UI-словаря из shared/strings раздувает sandbox bundle
// (объектный экспорт не tree-shake'ится), поэтому одну строку держим тут.
// При расхождении со shared/strings.ts.UI.libraryUnavailable — синхронизировать вручную.
function libraryUnavailableNotify(name: string): string {
  return `Library "${name}" is unavailable. Switched to Local.`;
}

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
// Discover
// ---------------------------------------------------------------------------

/** Результат discoverSources — формат, который sandbox шлёт в UI как `sources-discovered`. */
export interface DiscoverResult {
  libraries: { key: string; name: string; tokenCount: number }[];
  hasLocalStyles: boolean;
  hasLocalVariables: boolean;
}

/**
 * Обнаруживает все источники токенов:
 *  - подключённые library variable collections (через teamLibrary API)
 *  - локальные variables, paint styles, text styles
 *
 * Любая ошибка teamLibrary API (нет доступа, network) → libraries: []
 * с фолбэком на локальные флаги. Каждая коллекция учитывается отдельно
 * (ошибка одной → пропускаем её, остальные сохраняем).
 */
export async function discoverSources(): Promise<DiscoverResult> {
  const libraries: { key: string; name: string; tokenCount: number }[] = [];

  // TEMP: remove in Ф.16.7
  console.log('[Ф.16.6.5 discoverSources] api check', JSON.stringify({
    hasTeamLibrary: typeof figma.teamLibrary,
    hasGetMethod: typeof figma.teamLibrary?.getAvailableLibraryVariableCollectionsAsync,
    figmaVersion: figma.apiVersion ?? 'unknown',
  }));

  // --- Library variable collections (teamLibrary) ---
  try {
    const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    // TEMP: remove in Ф.16.7
    console.log('[Ф.16.6.5 discoverSources] teamLibrary returned', JSON.stringify({
      count: collections?.length,
      items: collections?.map((c) => ({ key: c.key, name: c.name, libraryName: c.libraryName })),
    }));
    for (let i = 0; i < collections.length; i++) {
      const c = collections[i];
      // tokenCount = 0 (точное число доступно после buildSnapshot через
      // snapshot.tokens.length). Двойной вызов getVariablesInLibraryCollectionAsync
      // в discover + build удваивает рейт teamLibrary API — избегаем.
      libraries.push({
        key: c.key,
        name: c.libraryName + ' / ' + c.name,
        tokenCount: 0,
      });
    }
  } catch (e) {
    // teamLibrary целиком недоступен (нет permission, offline) → libraries: [].
    // TEMP: remove in Ф.16.7
    const err = e as { message?: string; name?: string; code?: string; stack?: string };
    console.log('[Ф.16.6.5 discoverSources] teamLibrary threw', JSON.stringify({
      message: err?.message,
      name: err?.name,
      code: err?.code,
      stack: err?.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : undefined,
    }));
  }

  // TEMP: remove in Ф.16.7
  // Probe для library styles listing API. На момент Ф.16.6.5 в @figma/plugin-typings
  // методов вида getAvailableLibraryStylesAsync / getAvailableLibraryPaintStylesAsync
  // нет — Plugin API поддерживает teamLibrary только для variables.
  // Делаем runtime-probe на случай, если рантайм Figma уже опередил типы.
  try {
    const tl = figma.teamLibrary as unknown as Record<string, unknown>;
    const probeKeys = [
      'getAvailableLibraryStylesAsync',
      'getAvailableLibraryPaintStylesAsync',
      'getAvailableLibraryTextStylesAsync',
      'getAvailableLibraryEffectStylesAsync',
    ];
    const present: string[] = [];
    for (let i = 0; i < probeKeys.length; i++) {
      if (typeof tl[probeKeys[i]] === 'function') present.push(probeKeys[i]);
    }
    if (present.length === 0) {
      console.log('[Ф.16.6.5 discoverSources] No styles listing API in current typings/runtime', {
        probedKeys: probeKeys,
      });
    } else {
      console.log('[Ф.16.6.5 discoverSources] Found undocumented styles listing API at runtime', {
        present,
      });
      for (let i = 0; i < present.length; i++) {
        const fnName = present[i];
        try {
          const fn = tl[fnName] as () => Promise<unknown[]>;
          const res = await fn.call(figma.teamLibrary);
          console.log('[Ф.16.6.5 discoverSources] ' + fnName + ' returned', {
            count: Array.isArray(res) ? res.length : 'not-array',
            sample: Array.isArray(res) ? res.slice(0, 3) : res,
          });
        } catch (probeErr) {
          const pe = probeErr as { message?: string };
          console.log('[Ф.16.6.5 discoverSources] ' + fnName + ' threw', {
            message: pe && pe.message ? pe.message : String(probeErr),
          });
        }
      }
    }
  } catch (e) {
    // TEMP: remove in Ф.16.7
    const err = e as { message?: string; name?: string; code?: string; stack?: string };
    console.log('[Ф.16.6.5 discoverSources] styles probe outer error', JSON.stringify({
      message: err?.message,
      name: err?.name,
      code: err?.code,
      stack: err?.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : undefined,
    }));
  }

  // --- Локальные источники (best-effort флаги для UI). ---
  let hasLocalVariables = false;
  let hasLocalStyles = false;
  try {
    const lc = await figma.variables.getLocalVariableCollectionsAsync();
    for (let i = 0; i < lc.length; i++) {
      if (lc[i].variableIds.length > 0) { hasLocalVariables = true; break; }
    }
  } catch { /* noop */ }
  try {
    const ps = await figma.getLocalPaintStylesAsync();
    if (ps.length > 0) hasLocalStyles = true;
  } catch { /* noop */ }
  if (!hasLocalStyles) {
    try {
      const ts = await figma.getLocalTextStylesAsync();
      if (ts.length > 0) hasLocalStyles = true;
    } catch { /* noop */ }
  }

  const result = { libraries, hasLocalStyles, hasLocalVariables };
  // TEMP: remove in Ф.16.7
  console.log('[Ф.16.6.5 discoverSources] returning', JSON.stringify({
    librariesCount: result.libraries?.length,
    libraries: result.libraries?.map((l) => ({ key: l.key, name: l.name })),
    hasLocalStyles: result.hasLocalStyles,
    hasLocalVariables: result.hasLocalVariables,
  }));
  return result;
}

// ---------------------------------------------------------------------------
// Build snapshot
// ---------------------------------------------------------------------------

/**
 * Рекурсивно разрешает алиасы переменной до raw-цвета.
 * Защита от циклов: глубина не более 5 уровней.
 * Возвращает null, если алиас не резолвится (битая ссылка / цикл).
 */
async function resolveAlias(
  value: VariableValue,
  depth: number = 0,
): Promise<RGB | RGBA | null> {
  if (depth > 5) return null;

  if (isRGBColor(value)) return value as RGB | RGBA;

  if (typeof value === 'object' && value !== null && 'type' in value && (value as { type: string }).type === 'VARIABLE_ALIAS') {
    try {
      const target = await figma.variables.getVariableByIdAsync((value as { id: string }).id);
      if (!target) return null;
      const targetModeValues = Object.values(target.valuesByMode);
      if (targetModeValues.length === 0) return null;
      return await resolveAlias(targetModeValues[0], depth + 1);
    } catch {
      return null;
    }
  }

  return null;
}

const IMPORT_BATCH_SIZE = 20;
const IMPORT_BATCH_DELAY_MS = 50;

/**
 * Маппит импортированную Variable → Token.
 * Возвращает null, если variable не удалось обработать (нерезолвимый алиас, не COLOR/FLOAT).
 */
async function variableToToken(
  variable: Variable,
  sourceName: string,
  libraryName: string | undefined,
): Promise<Token | null> {
  if (variable.resolvedType === 'COLOR') {
    const modeValues = Object.values(variable.valuesByMode);
    if (modeValues.length === 0) return null;
    const raw = modeValues[0];
    const isAlias =
      typeof raw === 'object' &&
      raw !== null &&
      'type' in raw &&
      (raw as { type: string }).type === 'VARIABLE_ALIAS';
    const resolved = await resolveAlias(raw);
    if (!resolved) return null;
    return {
      id: variable.id,
      name: variable.name,
      category: 'color',
      value: rgbToHex(resolved.r, resolved.g, resolved.b),
      source: sourceName,
      kind: 'variables',
      isSemantic: isAlias,
      libraryName,
    };
  }
  if (variable.resolvedType === 'FLOAT') {
    const modeValues = Object.values(variable.valuesByMode);
    if (modeValues.length === 0) return null;
    const raw = modeValues[0];
    if (typeof raw !== 'number') return null;
    return {
      id: variable.id,
      name: variable.name,
      category: floatCategory(variable.name),
      value: String(raw),
      source: sourceName,
      kind: 'variables',
      libraryName,
    };
  }
  return null;
}

/**
 * Собирает токены из локальных variables + локальных Paint/Text Styles.
 * Возвращает токены и список SnapshotSource'ов с метаданными.
 */
async function buildLocalTokens(): Promise<{ tokens: Token[]; sources: SnapshotSource[] }> {
  const tokens: Token[] = [];
  const sources: SnapshotSource[] = [];

  // Локальные коллекции переменных
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  for (let i = 0; i < localCollections.length; i++) {
    const collection = localCollections[i];
    let count = 0;
    for (let j = 0; j < collection.variableIds.length; j++) {
      const variable = await figma.variables.getVariableByIdAsync(collection.variableIds[j]);
      if (variable === null) continue;
      const token = await variableToToken(variable, collection.name, undefined);
      if (token === null) continue;
      tokens.push(token);
      count++;
    }
    if (count > 0) {
      sources.push({
        name: collection.name,
        type: 'variables',
        kind: 'variables',
        tokenCount: count,
        enabled: true,
      });
    }
  }

  // Локальные Paint Styles
  const paintStyles = await figma.getLocalPaintStylesAsync();
  let paintCount = 0;
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
      kind: 'paintStyles',
    });
    paintCount++;
  }
  if (paintCount > 0) {
    sources.push({
      name: 'Local Paint Styles',
      type: 'local-styles',
      kind: 'paintStyles',
      tokenCount: paintCount,
      enabled: true,
    });
  }

  // Локальные Text Styles
  const textStyles = await figma.getLocalTextStylesAsync();
  let textCount = 0;
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
      kind: 'textStyles',
    });
    textCount++;
  }
  if (textCount > 0) {
    sources.push({
      name: 'Local Text Styles',
      type: 'local-styles',
      kind: 'textStyles',
      tokenCount: textCount,
      enabled: true,
    });
  }

  return { tokens, sources };
}

/**
 * Импортирует переменные одной выбранной library collection и маппит в Token[].
 * Шлёт UI прогресс `ds-scan-progress` каждые IMPORT_BATCH_SIZE импортов.
 *
 * При reject `getVariablesInLibraryCollectionAsync` (потеря доступа):
 *   - `figma.notify` с UI.libraryUnavailable
 *   - persisted selectedSource → { type: 'local' }
 *   - sandbox шлёт UI 'library-unavailable' { libraryName, libraryKey }
 *   - возвращает null → caller рекурсивно вызывает buildSnapshot({ type: 'local' }).
 */
async function buildLibraryTokens(
  libraryKey: string,
): Promise<{ tokens: Token[]; sources: SnapshotSource[]; libraryName: string } | null> {
  // Получаем имя библиотеки из discover (best-effort) — иначе fallback на ключ.
  let libraryName = libraryKey;
  try {
    const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (let i = 0; i < collections.length; i++) {
      if (collections[i].key === libraryKey) {
        libraryName = collections[i].libraryName + ' / ' + collections[i].name;
        break;
      }
    }
  } catch {
    /* fall through — будем использовать ключ как имя при notify */
  }

  let libVars: LibraryVariable[];
  try {
    libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libraryKey);
  } catch {
    // Permission lost: fallback на Local + notify + persisted update + UI message.
    try {
      figma.notify(libraryUnavailableNotify(libraryName));
    } catch {
      /* noop */
    }
    try {
      await setSelectedSource({ type: 'local' });
    } catch {
      /* noop — clientStorage упал, но ход скана важнее */
    }
    try {
      figma.ui.postMessage({
        type: 'library-unavailable',
        data: { libraryName, libraryKey },
      });
    } catch {
      /* noop */
    }
    return null;
  }

  const tokens: Token[] = [];
  const total = libVars.length;
  let current = 0;

  // Сразу шлём первый прогресс — UI знает total.
  try {
    figma.ui.postMessage({ type: 'ds-scan-progress', data: { current: 0, total, stage: '' } });
  } catch {
    /* noop */
  }

  for (let i = 0; i < libVars.length; i++) {
    const libVar = libVars[i];
    try {
      const variable = await figma.variables.importVariableByKeyAsync(libVar.key);
      const token = await variableToToken(variable, libraryName, libraryName);
      if (token !== null) tokens.push(token);
    } catch {
      // Пропускаем единичную переменную, продолжаем batch.
    }
    current++;

    // Прогресс + дыхание для rate limit между batch'ами.
    if (current % IMPORT_BATCH_SIZE === 0 || current === total) {
      try {
        figma.ui.postMessage({ type: 'ds-scan-progress', data: { current, total, stage: '' } });
      } catch {
        /* noop */
      }
      if (current < total) {
        await new Promise<void>((r) => setTimeout(r, IMPORT_BATCH_DELAY_MS));
      }
    }
  }

  const sources: SnapshotSource[] = tokens.length > 0
    ? [{
        name: libraryName,
        type: 'library-variables',
        kind: 'variables',
        tokenCount: tokens.length,
        enabled: true,
        libraryName,
        libraryKey,
      }]
    : [];

  return { tokens, sources, libraryName };
}

/**
 * Собирает ReferenceSnapshot по выбранному источнику (single-select Ф.16.6.5).
 *
 * При selectedSource.type === 'library':
 *   - импортируем переменные одной library collection с batch-прогрессом.
 *   - при потере доступа: fallback на { type: 'local' } через рекурсию.
 *
 * При selectedSource.type === 'local':
 *   - читаем локальные variables + paint/text styles.
 */
export async function buildSnapshot(selectedSource: SelectedSource): Promise<ReferenceSnapshot> {
  let tokens: Token[] = [];
  let sources: SnapshotSource[] = [];
  let effectiveSource: SelectedSource = selectedSource;

  if (selectedSource.type === 'library') {
    const result = await buildLibraryTokens(selectedSource.libraryKey);
    if (result === null) {
      // Permission lost → fallback на local. Рекурсия с уже обновлённым persisted state.
      effectiveSource = { type: 'local' };
      const local = await buildLocalTokens();
      tokens = local.tokens;
      sources = local.sources;
    } else {
      tokens = result.tokens;
      sources = result.sources;
    }
  } else {
    const local = await buildLocalTokens();
    tokens = local.tokens;
    sources = local.sources;
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
      const n = parseFloat(token.value);
      if (!isNaN(n) && fontSizeValues.indexOf(n) === -1) fontSizeValues.push(n);
    }
  }

  spacingValues.sort((a, b) => a - b);
  radiusValues.sort((a, b) => a - b);
  fontSizeValues.sort((a, b) => a - b);

  // --- Валидация снепшота ---
  const issues: SnapshotValidationIssue[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value === '') {
      issues.push({
        type: 'empty-value',
        message: 'Токен "' + tokens[i].name + '" имеет пустое значение',
        tokenId: tokens[i].id,
      });
    }
  }
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
    selectedSource: effectiveSource,
  };
}

// ---------------------------------------------------------------------------
// Работа с clientStorage (snapshot)
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
    selectedSource: snapshot.selectedSource,
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
 * Сравнивает два SelectedSource на эквивалентность.
 * undefined у одного из аргументов → не равны (старый snapshot без metadata).
 */
function selectedSourceEqual(a: SelectedSource | undefined, b: SelectedSource | undefined): boolean {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'library' && b.type === 'library') {
    return a.libraryKey === b.libraryKey;
  }
  return true; // оба 'local'
}

/**
 * Проверяет, устарел ли снепшот относительно текущего persisted selectedSource.
 *
 * Stale если:
 *  - snapshot.selectedSource отсутствует (старый формат до Ф.16.6.5) → rebuild
 *  - snapshot.selectedSource ≠ currentSelectedSource → rebuild
 *  - изменилось количество локальных токенов (для local source)
 *  - изменилось количество library variable collections (новая коллекция)
 */
export async function isSnapshotStale(
  snapshot: ReferenceSnapshot,
  currentSelectedSource: SelectedSource,
): Promise<boolean> {
  // 1. Старый snapshot без selectedSource метаданных — всегда stale.
  if (!snapshot.selectedSource) return true;

  // 2. Источник изменился — stale.
  if (!selectedSourceEqual(snapshot.selectedSource, currentSelectedSource)) return true;

  // 3. Количество library collections — учитываем, чтобы при подключении новой
  //    предложить пересборку (даже если та же library выбрана).
  try {
    const libCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    // Был ли выбранный library key в текущем списке?
    if (snapshot.selectedSource.type === 'library') {
      let found = false;
      for (let i = 0; i < libCollections.length; i++) {
        if (libCollections[i].key === snapshot.selectedSource.libraryKey) {
          found = true;
          break;
        }
      }
      // Если не нашёлся — библиотека отключена → stale.
      if (!found) return true;
    }
  } catch {
    // teamLibrary недоступен — не считаем stale по этой причине.
  }

  // 4. Для local source — сверяем количество локальных токенов.
  if (currentSelectedSource.type === 'local') {
    let currentCount = 0;
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      for (let i = 0; i < collections.length; i++) {
        currentCount += collections[i].variableIds.length;
      }
    } catch {
      /* noop */
    }
    try {
      const paintStyles = await figma.getLocalPaintStylesAsync();
      currentCount += paintStyles.length;
    } catch {
      /* noop */
    }
    try {
      const textStyles = await figma.getLocalTextStylesAsync();
      currentCount += textStyles.length;
    } catch {
      /* noop */
    }
    if (currentCount !== snapshot.validation.totalTokens) return true;
  }

  return false;
}
