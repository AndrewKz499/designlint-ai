import type { Example, ExampleScope, ExampleSlot, SlotRole } from '../shared/types';

// ---------------------------------------------------------------------------
// exampleParser — парсер «эталона в кадре» (ADR-002, шаг 18.3 Ф.18a).
//
// Чистая функция: берёт `nodeId` + `ExampleScope`, обходит дерево по
// правилам выбранного scope и собирает уникальные слоты использования
// токенов (variables / styles). Не подключается к message-handler,
// clientStorage, UI — это сделают шаги 18.4-18.6 / 18.8.
//
// NOTE: 'not-published' is reserved for Ф.18b (R6 deferred).
// In Ф.18a unpublished components are parsed as regular ones.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Конвертирует цвет Figma (0..1) в "#RRGGBB" uppercase. */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (val: number): string =>
    Math.round(val * 255).toString(16).padStart(2, '0').toUpperCase();
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Резолвит имя variable. Возвращает fallback `Unnamed token (#${hex})`,
 * если variable не найден — гарантирует не-null `tokenName` (см. types.ts:275).
 */
async function resolveVariableName(id: string, fallbackHex: string): Promise<string> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (variable !== null && variable.name !== '') return variable.name;
  } catch {
    /* noop */
  }
  return 'Unnamed token (' + fallbackHex + ')';
}

/**
 * Резолвит имя стиля. Возвращает fallback `Unnamed token (#${hex})`,
 * если стиль не найден.
 */
async function resolveStyleName(id: string, fallbackHex: string): Promise<string> {
  try {
    const style = await figma.getStyleByIdAsync(id);
    if (style !== null && style.name !== '') return style.name;
  } catch {
    /* noop */
  }
  return 'Unnamed token (' + fallbackHex + ')';
}

/**
 * Добавляет слот в массив с дедупом по композитному ключу
 * `tokenId|slotKind|role|spacingField`. Идемпотентно.
 *
 * Ф.18a (шаг 18.13.2): ключ был расширен с `tokenId` до `tokenId|slotKind|role`,
 * чтобы один и тот же tokenId, использованный в разных семантических ролях
 * (например, Brand/Primary как fill background И как stroke border), создавал
 * два **разных** слота — это разная семантика, нужная детектору для матчинга
 * по `role`. Без расширения multi-slot ranking терял бы border-вариант.
 *
 * Ф.18b.1.4.D1 (B1, 2026-05-10): четвёртый сегмент `spacingField` — для
 * spacing-слотов один и тот же tokenId, привязанный к разным полям эталона
 * (paddingLeft vs paddingTop), должен оставаться двумя слотами с разным
 * `spacingField`. Для color/text-style/radius slotKind поле всегда undefined —
 * сегмент сериализуется как пустая строка `''` (НЕ `'undefined'`: implicit
 * toString сломал бы дедуп).
 *
 * `seenKeys` мутируется и должен жить в пределах одной сборки `Example`.
 */
function pushUniqueSlot(slots: ExampleSlot[], seenKeys: Set<string>, slot: ExampleSlot): void {
  const key = slot.tokenId + '|' + slot.slotKind + '|' + slot.role + '|' + (slot.spacingField !== undefined ? slot.spacingField : '');
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  slots.push(slot);
}

/**
 * Ф.18a (шаг 18.13.2): вычисляет семантическую `SlotRole` слота эталона.
 *
 * Чистая функция, вызывается из каждого `collectXxxSlot`. Контракт R-13.2:
 * primary-сигнал — `node.type` и `paintTarget`, secondary — substring-эвристика
 * по `tokenName` (case-insensitive). См. шаг 18.13.2 step-документа.
 *
 * Приоритет правил (первое подходящее срабатывает):
 *  1. `slotKind === 'text-style'`        → 'text'        (типографика по определению).
 *  2. `paintTarget === 'stroke'`         → 'border'      (Q-microsoft).
 *  3. `node.type === 'TEXT'` + `'fill'`  → 'text'        (E2: цвет fill на TextNode — цвет ТЕКСТА).
 *  3a. `slotKind === 'spacing'`        → 'spacing'      (Ф.18b.1.4: единая роль).
 *  3b. `slotKind === 'radius'`         → 'radius'       (Ф.18b.1.4: единая роль).
 *      Правила 3a/3b добавлены в Ф.18b.1.4 (2026-05-11): для slotKind='spacing'/'radius'
 *      фиксируем единые роли 'spacing'/'radius' соответственно (см. R-spacing.1,
 *      R-spacing.3 baseline step-документа Ф.18b Шаг 1). Substring-эвристика
 *      по tokenName на них НЕ применяется: подстроки 'gap'/'padding' не должны
 *      разбивать роль на варианты.
 *  4. Substring по tokenName (case-insensitive):
 *       contains 'background' → 'background'
 *       contains 'icon'       → 'icon'
 *       contains 'shadow'     → 'shadow'
 *       contains 'stroke' | 'border' → 'border' (страховка к правилу 2).
 *       contains 'text'       → 'text'   (страховка для `Text/Primary` на shape-узле).
 *  5. Shape-узел + slotKind='fill' → 'background' (E3: Frame-as-icon → background по умолчанию).
 *  6. default                       → 'unknown'.
 *
 * `paintTarget` — `null` для не-paint слотов (text-style, radius, spacing),
 * `'fill'` или `'stroke'` для color-слотов.
 *
 * `tokenName` — `null` или пустая строка → правило 4 пропускается, идём дальше.
 */
function inferRole(
  node: SceneNode,
  slotKind: ExampleSlot['slotKind'],
  paintTarget: 'fill' | 'stroke' | null,
  tokenName: string | null,
): SlotRole {
  // Правило 1.
  if (slotKind === 'text-style') return 'text';

  // Правило 2.
  if (paintTarget === 'stroke') return 'border';

  // Правило 3.
  if (node.type === 'TEXT' && slotKind === 'fill') return 'text';

  // Правила 3a/3b (Ф.18b.1.4): фиксируем единые роли для spacing/radius
  // ДО substring-эвристики, чтобы 'gap'/'padding' не порождали варианты ролей.
  if (slotKind === 'spacing') return 'spacing';
  if (slotKind === 'radius') return 'radius';

  // Правило 4: substring-эвристика по tokenName.
  if (tokenName !== null && tokenName !== '') {
    const lower = tokenName.toLowerCase();
    if (lower.indexOf('background') !== -1) return 'background';
    if (lower.indexOf('icon') !== -1) return 'icon';
    if (lower.indexOf('shadow') !== -1) return 'shadow';
    if (lower.indexOf('stroke') !== -1 || lower.indexOf('border') !== -1) return 'border';
    if (lower.indexOf('text') !== -1) return 'text';
  }

  // Правило 5: shape-узел с fill → background по умолчанию (E3).
  if (slotKind === 'fill') {
    const t = node.type;
    if (
      t === 'RECTANGLE' ||
      t === 'FRAME' ||
      t === 'COMPONENT' ||
      t === 'INSTANCE' ||
      t === 'GROUP' ||
      t === 'VECTOR' ||
      t === 'ELLIPSE' ||
      t === 'POLYGON' ||
      t === 'STAR' ||
      t === 'LINE'
    ) {
      return 'background';
    }
  }

  // Правило 6: default.
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Извлечение токенов из одного узла
// ---------------------------------------------------------------------------

/**
 * Собирает color-слоты из fills узла. Учитывает оба источника:
 * variable (`fill.boundVariables.color`) и paintStyle (`node.fillStyleId`).
 * Solid-only — gradient/image игнорируются (вне scope Ф.18a).
 */
async function collectFillSlots(
  node: SceneNode,
  slots: ExampleSlot[],
  seenIds: Set<string>,
): Promise<void> {
  if (!('fills' in node)) return;
  if (node.fills === figma.mixed) return;
  const fills = node.fills as ReadonlyArray<Paint>;

  // Через boundVariables на каждом fill.
  for (let i = 0; i < fills.length; i++) {
    const fill = fills[i];
    if (fill.type !== 'SOLID') continue;
    const variableId = fill.boundVariables?.color?.id;
    if (variableId === undefined || variableId === '') continue;
    const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
    const tokenName = await resolveVariableName(variableId, hex);
    pushUniqueSlot(slots, seenIds, {
      tokenId: variableId,
      tokenName,
      hexInTheme: hex,
      slotKind: 'fill',
      role: inferRole(node, 'fill', 'fill', tokenName),
    });
  }

  // Через fillStyleId на узле.
  if ('fillStyleId' in node) {
    const styleId = (node as { fillStyleId: string | symbol }).fillStyleId;
    if (typeof styleId === 'string' && styleId !== '') {
      // Берём hex из первого SOLID fill для отображения.
      let hex = '';
      for (let i = 0; i < fills.length; i++) {
        if (fills[i].type === 'SOLID') {
          const c = (fills[i] as SolidPaint).color;
          hex = rgbToHex(c.r, c.g, c.b);
          break;
        }
      }
      const tokenName = await resolveStyleName(styleId, hex);
      pushUniqueSlot(slots, seenIds, {
        tokenId: styleId,
        tokenName,
        hexInTheme: hex,
        slotKind: 'fill',
        role: inferRole(node, 'fill', 'fill', tokenName),
      });
    }
  }
}

/**
 * Собирает color-слоты из strokes узла. Symmetric to collectFillSlots,
 * но slot.slotKind остаётся 'fill' (наш ExampleSlot не различает stroke
 * и fill — это цвет в теме, важен сам tokenId).
 */
async function collectStrokeSlots(
  node: SceneNode,
  slots: ExampleSlot[],
  seenIds: Set<string>,
): Promise<void> {
  if (!('strokes' in node)) return;
  const strokesRaw = (node as { strokes: ReadonlyArray<Paint> | symbol }).strokes;
  if (strokesRaw === figma.mixed) return;
  const strokes = strokesRaw as ReadonlyArray<Paint>;

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];
    if (stroke.type !== 'SOLID') continue;
    const variableId = stroke.boundVariables?.color?.id;
    if (variableId === undefined || variableId === '') continue;
    const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
    const tokenName = await resolveVariableName(variableId, hex);
    pushUniqueSlot(slots, seenIds, {
      tokenId: variableId,
      tokenName,
      hexInTheme: hex,
      slotKind: 'fill',
      role: inferRole(node, 'fill', 'stroke', tokenName),
    });
  }

  if ('strokeStyleId' in node) {
    const styleId = (node as { strokeStyleId: string | symbol }).strokeStyleId;
    if (typeof styleId === 'string' && styleId !== '') {
      let hex = '';
      for (let i = 0; i < strokes.length; i++) {
        if (strokes[i].type === 'SOLID') {
          const c = (strokes[i] as SolidPaint).color;
          hex = rgbToHex(c.r, c.g, c.b);
          break;
        }
      }
      const tokenName = await resolveStyleName(styleId, hex);
      pushUniqueSlot(slots, seenIds, {
        tokenId: styleId,
        tokenName,
        hexInTheme: hex,
        slotKind: 'fill',
        role: inferRole(node, 'fill', 'stroke', tokenName),
      });
    }
  }
}

/**
 * Собирает text-style слот для TEXT-нод. Только через `textStyleId`
 * — text-variable (TYPE_VARIABLE) в Plugin API на момент Ф.18a отсутствует.
 * `hexInTheme` для text-style — сериализованное значение `Npx/Family/Weight`,
 * не цвет (см. types.ts:280-281).
 */
async function collectTextStyleSlot(
  node: SceneNode,
  slots: ExampleSlot[],
  seenIds: Set<string>,
): Promise<void> {
  if (node.type !== 'TEXT') return;
  const textNode = node as TextNode;
  const styleId = textNode.textStyleId;
  if (typeof styleId !== 'string' || styleId === '') return;

  // Сериализуем шрифт как "16/Inter/Bold" (контракт types.ts:281).
  let serialized = '';
  if (textNode.fontSize !== figma.mixed && textNode.fontName !== figma.mixed) {
    const fontName = textNode.fontName as FontName;
    serialized = String(textNode.fontSize) + '/' + fontName.family + '/' + fontName.style;
  }
  const tokenName = await resolveStyleName(styleId, serialized);
  pushUniqueSlot(slots, seenIds, {
    tokenId: styleId,
    tokenName,
    hexInTheme: serialized,
    slotKind: 'text-style',
    role: inferRole(node, 'text-style', null, tokenName),
  });
}

/**
 * Собирает radius-слоты — только если cornerRadius привязан к variable.
 * `hexInTheme` для radius — строковое значение в px (например, "8").
 * Для нод со смешанным radius (`figma.mixed` на cornerRadius) проверяем
 * каждый из четырёх углов отдельно.
 */
async function collectRadiusSlots(
  node: SceneNode,
  slots: ExampleSlot[],
  seenIds: Set<string>,
): Promise<void> {
  if (!('boundVariables' in node)) return;
  const bound = (node as { boundVariables?: Record<string, { id: string } | undefined> }).boundVariables;
  if (bound === undefined) return;

  const radiusFields = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
  for (let i = 0; i < radiusFields.length; i++) {
    const field = radiusFields[i];
    const binding = bound[field];
    if (binding === undefined || binding === null) continue;
    const variableId = binding.id;
    if (variableId === '') continue;

    // Текущее числовое значение этого угла.
    const valueRaw = (node as unknown as Record<string, unknown>)[field];
    const valueStr = typeof valueRaw === 'number' ? String(valueRaw) : '';
    const tokenName = await resolveVariableName(variableId, valueStr);
    pushUniqueSlot(slots, seenIds, {
      tokenId: variableId,
      tokenName,
      hexInTheme: valueStr,
      slotKind: 'radius',
      role: inferRole(node, 'radius', null, tokenName),
    });
  }
}

/**
 * Собирает spacing-слоты: itemSpacing и padding-* с auto-layout фреймов.
 * Бьём по `boundVariables` — без variable-привязки spacing не считается
 * слотом (хардкод вне эталона, см. шаг 18.3 контекст).
 */
async function collectLayoutSlots(
  node: SceneNode,
  slots: ExampleSlot[],
  seenIds: Set<string>,
): Promise<void> {
  if (!('boundVariables' in node)) return;
  const bound = (node as { boundVariables?: Record<string, { id: string } | undefined> }).boundVariables;
  if (bound === undefined) return;

  // Ф.18b.1.4.D1 (B1, 2026-05-10): типизируем поле как union из ExampleSlot
  // — это позволяет пробрасывать его в slot.spacingField без приведений.
  const layoutFields: Array<NonNullable<ExampleSlot['spacingField']>> = [
    'itemSpacing',
    'counterAxisSpacing',
    'paddingLeft',
    'paddingRight',
    'paddingTop',
    'paddingBottom',
  ];
  for (let i = 0; i < layoutFields.length; i++) {
    const field = layoutFields[i];
    const binding = bound[field];
    if (binding === undefined || binding === null) continue;
    const variableId = binding.id;
    if (variableId === '') continue;

    const valueRaw = (node as unknown as Record<string, unknown>)[field];
    const valueStr = typeof valueRaw === 'number' ? String(valueRaw) : '';
    const tokenName = await resolveVariableName(variableId, valueStr);
    pushUniqueSlot(slots, seenIds, {
      tokenId: variableId,
      tokenName,
      hexInTheme: valueStr,
      slotKind: 'spacing',
      role: inferRole(node, 'spacing', null, tokenName),
      spacingField: field,
    });
  }
}

/**
 * Универсальный сборщик слотов с одного узла: fills + strokes + text-style + radius.
 * Layout-слоты опциональны — добавляются только в scope='layout' и для контейнеров
 * с auto-layout внутри других scope.
 */
async function collectNodeSlots(
  node: SceneNode,
  slots: ExampleSlot[],
  seenIds: Set<string>,
  options: { includeLayout: boolean },
): Promise<void> {
  await collectFillSlots(node, slots, seenIds);
  await collectStrokeSlots(node, slots, seenIds);
  await collectTextStyleSlot(node, slots, seenIds);
  await collectRadiusSlots(node, slots, seenIds);
  if (options.includeLayout) {
    await collectLayoutSlots(node, slots, seenIds);
  }
}

/**
 * Рекурсивно обходит дерево, собирая слоты со всех потомков.
 * Не пропускает скрытые узлы намеренно: эталон может содержать
 * скрытые состояния (hover/focus) с уникальными токенами.
 *
 * Опциональные лимиты (`maxDepth` / `maxCount`) — анти-DoS защита для
 * `parseSelection` (см. шаг 18.12 Ф.18a). При достижении лимита обход
 * прекращается БЕЗ ошибки: уже собранные слоты возвращаются как есть.
 * Для `parseSection` / `parseComponent` лимиты не передаются — там
 * рекурсия охватывает заведомо большое дерево по дизайну.
 *
 * Депт-фёрст порядок: сначала сам узел, затем дети по порядку. Эта
 * последовательность важна для эвристики «первый по slotKind» в детекторе.
 */
async function walkAndCollect(
  node: SceneNode,
  slots: ExampleSlot[],
  seenIds: Set<string>,
  options?: { maxDepth: number; maxCount: number },
  state?: { count: number; depth: number },
): Promise<void> {
  // Инициализируем счётчик при первом вызове.
  const localState = state ?? { count: 0, depth: 0 };

  // Лимит по количеству узлов: проверяем ДО collectNodeSlots, чтобы
  // не превысить и не запустить лишние async-операции.
  if (options !== undefined && localState.count >= options.maxCount) return;
  localState.count += 1;

  await collectNodeSlots(node, slots, seenIds, { includeLayout: true });

  if ('children' in node) {
    // Лимит по глубине: дети текущего узла будут на (depth + 1).
    if (options !== undefined && localState.depth + 1 > options.maxDepth) return;
    const children = node.children;
    const childState = options !== undefined
      ? { count: localState.count, depth: localState.depth + 1 }
      : localState;
    for (let i = 0; i < children.length; i++) {
      // Прервать обход детей, если лимит уже достигнут (после предыдущего ребёнка).
      if (options !== undefined && childState.count >= options.maxCount) break;
      await walkAndCollect(children[i] as SceneNode, slots, seenIds, options, childState);
    }
    // Пробрасываем обновлённый count обратно в родительский state, чтобы
    // братья текущего узла учитывали уже потраченный бюджет.
    if (options !== undefined) {
      localState.count = childState.count;
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot resolvedVariableModes (R4 задел на Ф.18b)
// ---------------------------------------------------------------------------

/**
 * Безопасно достаёт `resolvedVariableModes` с узла — поле появилось в Plugin API
 * не сразу и для нод без variable-привязок Figma может вернуть пустой объект
 * или undefined. В Ф.18a сохраняем как есть, в Ф.18b будет использовано
 * для темо-aware резолва (R4).
 */
function snapshotResolvedModes(node: SceneNode): { [collectionId: string]: string } | undefined {
  const raw = (node as unknown as { resolvedVariableModes?: Record<string, string> }).resolvedVariableModes;
  if (raw === undefined || raw === null) return undefined;
  // Копируем в plain object, чтобы не держать ссылку на live Figma-объект.
  const out: { [collectionId: string]: string } = {};
  for (const key in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = raw[key];
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Парсит эталон из узла Figma в зависимости от выбранного scope.
 *
 * Семантика scope:
 *  - 'selection' — узел = nodeId. Собирает токены ИМЕННО этого узла И
 *    всех его потомков рекурсивно (depth ≤ 5, count ≤ 50). Это полный
 *    «портрет» узла-эталона, включая иконки и тексты внутри.
 *    Изменено в 18.12: ранее собирал только сам узел.
 *  - 'section'   — рекурсивный обход всей секции без лимитов.
 *  - 'component' — рекурсивный обход компонента / default-варианта без лимитов.
 *  - 'layout'    — только layout/radius binding'и самого узла, без рекурсии.
 *
 * Возвращает `Example` при успехе или `{ error }` с одним из кодов:
 *  - 'no-selection'    — узел не найден ИЛИ scope не подходит к типу узла;
 *  - 'no-tokens-found' — узел распарсен, но ни одного слота не собрано;
 *  - 'not-published'   — НЕ возвращается в Ф.18a (зарезервирован для Ф.18b).
 *
 * NOTE: 'not-published' is reserved for Ф.18b (R6 deferred).
 * In Ф.18a unpublished components are parsed as regular ones.
 */
export async function parseExample(
  nodeId: string,
  scope: ExampleScope,
): Promise<Example | { error: 'no-selection' | 'not-published' | 'no-tokens-found' }> {
  // Резолв узла глобально — узел может быть на другой странице (R7 ADR-002).
  let node: BaseNode | null = null;
  try {
    node = await figma.getNodeByIdAsync(nodeId);
  } catch {
    return { error: 'no-selection' };
  }
  if (node === null) return { error: 'no-selection' };
  if (node.type === 'DOCUMENT' || node.type === 'PAGE') return { error: 'no-selection' };

  const sceneNode = node as SceneNode;
  const slots: ExampleSlot[] = [];
  const seenIds = new Set<string>();

  if (scope === 'selection') {
    // Scope `selection`: «полный портрет» узла-эталона — токены самого узла
    // И всех его потомков рекурсивно. Typography в кнопках/чипах/иконках
    // живёт на дочерних TEXT-нодах, поэтому без обхода поддерева text-style
    // слотов было бы не собрать (см. 18.12 Ф.18a).
    //
    // Анти-DoS лимиты: depth ≤ 5, count ≤ 50. Один пользовательский узел —
    // это обычно компонент с 5-15 детьми, лимит покрывает ~99% реальных
    // эталонов. При достижении — обход останавливается без ошибки.
    await walkAndCollect(sceneNode, slots, seenIds, { maxDepth: 5, maxCount: 50 });
  } else if (scope === 'section') {
    // Scope `section`: ожидается SectionNode. Собираем уникальные слоты со всех
    // потомков рекурсивно.
    if (sceneNode.type !== 'SECTION') return { error: 'no-selection' };
    await walkAndCollect(sceneNode, slots, seenIds);
  } else if (scope === 'component') {
    // Scope `component`: ожидается COMPONENT / COMPONENT_SET / INSTANCE.
    // Для COMPONENT_SET берём default variant (defaultVariant), не все варианты —
    // иначе слоты дублируются и теряется «канонический» набор токенов компонента.
    if (
      sceneNode.type !== 'COMPONENT' &&
      sceneNode.type !== 'COMPONENT_SET' &&
      sceneNode.type !== 'INSTANCE'
    ) {
      return { error: 'no-selection' };
    }
    if (sceneNode.type === 'COMPONENT_SET') {
      const set = sceneNode as ComponentSetNode;
      const defaultVariant = set.defaultVariant;
      if (defaultVariant !== null) {
        await walkAndCollect(defaultVariant as SceneNode, slots, seenIds);
      } else {
        // Fallback: первый ребёнок (на случай отсутствия defaultVariant в API).
        const children = set.children;
        if (children.length > 0) {
          await walkAndCollect(children[0] as SceneNode, slots, seenIds);
        }
      }
    } else {
      await walkAndCollect(sceneNode, slots, seenIds);
    }
  } else if (scope === 'layout') {
    // Scope `layout`: контейнер с auto-layout (FrameNode или совместимый).
    // Собираем layout-специфичные variable-binding'и (itemSpacing, padding,
    // counterAxisSpacing) и заодно radius — т.к. концептуально оба относятся
    // к «структурным» токенам layout. Без рекурсии по детям.
    if (
      !('layoutMode' in sceneNode) ||
      (sceneNode as { layoutMode?: string }).layoutMode === 'NONE' ||
      (sceneNode as { layoutMode?: string }).layoutMode === undefined
    ) {
      return { error: 'no-selection' };
    }
    await collectLayoutSlots(sceneNode, slots, seenIds);
    await collectRadiusSlots(sceneNode, slots, seenIds);
  } else {
    // Defensive: TS не пропустит, но рантайм-страховка.
    return { error: 'no-selection' };
  }

  if (slots.length === 0) return { error: 'no-tokens-found' };

  const createdAt = Date.now();
  // pageId — для R7 (sandbox достаёт узел через getNodeByIdAsync независимо
  // от текущей страницы; pageId хранится для UI-чипа и аналитики).
  let pageId = '';
  let cursor: BaseNode | null = sceneNode;
  while (cursor !== null) {
    if (cursor.type === 'PAGE') {
      pageId = cursor.id;
      break;
    }
    cursor = cursor.parent;
  }

  return {
    id: sceneNode.id + ':' + String(createdAt),
    scope,
    nodeId: sceneNode.id,
    pageId,
    name: sceneNode.name,
    slots,
    resolvedVariableModes: snapshotResolvedModes(sceneNode),
    createdAt,
  };
}
