import type {
  ScannedColor,
  ScannedRadius,
  ScannedSpacing,
  ScannedText,
  ScanResult,
  ScanScope,
} from '../shared/types';

// Ноды с такими префиксами в имени полностью исключаются из
// сканирования вместе со всеми детьми (типичные префиксы для
// черновиков и служебных слоёв).
const IGNORED_PREFIXES = ['_', '//', 'draft/'];

function isIgnoredByPrefix(name: string): boolean {
  for (var pi = 0; pi < IGNORED_PREFIXES.length; pi++) {
    if (name.indexOf(IGNORED_PREFIXES[pi]) === 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/** Конвертирует цвет из формата Figma (r, g, b: 0–1) в строку "#RRGGBB" (uppercase) */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (val: number): string =>
    Math.round(val * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Извлекает имя стиля по его ID.
 * Возвращает null, если ID пустой или стиль не найден.
 */
function resolveStyleName(styleId: string | symbol, styleNames: { [id: string]: string }): string | null {
  if (typeof styleId !== 'string' || styleId === '') return null;
  var name = styleNames[styleId];
  if (typeof name === 'string') return name;
  return null;
}

// ---------------------------------------------------------------------------
// Основная логика обхода
// ---------------------------------------------------------------------------

interface ScanAccumulator {
  colors: ScannedColor[];
  texts: ScannedText[];
  spacings: ScannedSpacing[];
  radii: ScannedRadius[];
  totalNodesScanned: number;
  /**
   * IDs локальных Style-узлов, помеченных как `remote === true` (Ф.16.6.5).
   * Пассивный сбор для будущего v1.1: «library styles listing» через
   * импорт Plugin API не поддерживается, но remote=true можно обнаружить
   * на уровне referencing-нод. В v1.0 поле собирается, но не используется.
   */
  remoteStyleIds: Set<string>;
  /**
   * Ф.17.3: индекс «имя компонента → Set<tokenId>».
   * Внутри scanner используем Map<string, Set<string>> для дедупликации.
   * При выходе из scanDocument сериализуем в plain object для границы sandbox/UI
   * (см. ScanResult.componentTokenIndex).
   *
   * Узлы вне компонента (componentContext === undefined) в индекс не попадают —
   * это намеренно: для них детектор использует fallback на полную палитру (Ф.17.4).
   * Хардкод (нет boundVariableId/boundStyleId) тоже не попадает — естественно,
   * так как добавляем только при наличии id.
   */
  componentTokenIndex: Map<string, Set<string>>;
}

/**
 * Ф.17.3: добавляет tokenId в Set текущего компонента.
 * No-op, если componentName или tokenId пусты — это валидный случай
 * (узел вне компонента или хардкод-узел).
 */
function recordComponentToken(
  index: Map<string, Set<string>>,
  componentName: string | undefined,
  tokenId: string | null,
): void {
  if (componentName === undefined || componentName === '') return;
  if (tokenId === null || tokenId === '') return;
  let set = index.get(componentName);
  if (set === undefined) {
    set = new Set<string>();
    index.set(componentName, set);
  }
  set.add(tokenId);
}

/**
 * Рекурсивно обходит дерево нод, начиная с node.
 * Собирает цвета из fills и параметры текстовых нод.
 */
function walkNode(
  node: SceneNode,
  pageId: string,
  pageName: string,
  acc: ScanAccumulator,
  styleNames: { [id: string]: string },
  componentContext?: string,
): void {
  // Пропускаем скрытые ноды вместе со всеми их потомками
  if (!node.visible) return;
  // Пропускаем маркеры, созданные самим плагином
  if (node.name === 'DesignLint Marker') return;
  // Служебные префиксы — пропускаем ноду и всё поддерево
  if (isIgnoredByPrefix(node.name)) return;

  acc.totalNodesScanned += 1;
  if (acc.totalNodesScanned % 200 === 0) {
    figma.ui.postMessage({ type: 'scan-progress', data: { current: acc.totalNodesScanned, total: 0 } });
  }

  // Ф.17.1: обновляем component context перед обходом детей.
  // Q1.edge PO — ближайший снизу (Card → Avatar → Image ⇒ 'Avatar').
  let nextContext = componentContext;
  if (node.type === 'INSTANCE') {
    // mainComponent может быть null (detached) — fallback на node.name.
    const mainName = node.mainComponent ? node.mainComponent.name : '';
    const candidate = mainName !== '' ? mainName : node.name;
    if (candidate !== '') nextContext = candidate;
  } else if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    if (node.name !== '') nextContext = node.name;
  }

  // --- Обработка заливок (fills) ---
  if ('fills' in node && node.fills !== figma.mixed) {
    const fills = node.fills as ReadonlyArray<Paint>;
    for (const fill of fills) {
      if (fill.type !== 'SOLID') continue;

      const { r, g, b } = fill.color;
      const opacity = fill.opacity !== undefined ? fill.opacity : 1;
      const styleId = 'fillStyleId' in node ? node.fillStyleId : '';
      const boundStyleId = typeof styleId === 'string' && styleId !== '' ? styleId : null;
      const boundStyleName = boundStyleId !== null ? resolveStyleName(boundStyleId, styleNames) : null;
      const boundVariableId = fill.boundVariables?.color?.id ?? null;

      // Ф.16.6.5: пассивный сбор remote (library) styleIds — без сетевых вызовов.
      // Если styleId есть, но в локальном словаре styleNames его нет —
      // значит стиль импортирован из подключённой библиотеки (remote=true).
      if (boundStyleId !== null && boundStyleName === null) {
        acc.remoteStyleIds.add(boundStyleId);
      }

      // Ф.17.3: индекс «компонент → токены». Добавляем оба возможных id —
      // через variable или через style. Set дедуплицирует естественно.
      // Хардкод (оба null) сюда не попадает — recordComponentToken это no-op.
      recordComponentToken(acc.componentTokenIndex, nextContext, boundVariableId);
      recordComponentToken(acc.componentTokenIndex, nextContext, boundStyleId);

      acc.colors.push({
        nodeId: node.id,
        nodeName: node.name,
        pageId,
        pageName,
        hex: rgbToHex(r, g, b),
        opacity,
        boundStyleId,
        boundStyleName,
        boundVariableId,
        componentName: nextContext,
        // Ф.18a (18.13.3): поля для Multi-slot ranking. nodeType — тип ноды Figma,
        // paintTarget — заливка или обводка. Scanner сейчас сканирует только fills
        // (блока сбора strokes нет), поэтому paintTarget здесь всегда 'fill'.
        // Если в Ф.18b добавится сбор strokes — `paintTarget: 'stroke'` будет
        // заполняться в новом блоке.
        nodeType: node.type,
        paintTarget: 'fill',
      });
    }
  }

  // --- Обработка spacing (Ф.18b шаг 1.2) ---
  // Собираем только для auto-layout-фреймов (layoutMode !== 'NONE').
  // padding-поля — числовые per-frame, figma.mixed на них не приходит.
  // itemSpacing теоретически может быть mixed → guard через typeof === 'number'.
  // counterAxisSpacing существует физически на любом frame, но Figma учитывает
  // его только при layoutWrap === 'WRAP'. Без этого guard'а получим запись 0/null
  // от ноды, где поле игнорируется.
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    const spacingFields: Array<ScannedSpacing['field']> = [
      'paddingLeft',
      'paddingRight',
      'paddingTop',
      'paddingBottom',
      'itemSpacing',
    ];
    for (let sfi = 0; sfi < spacingFields.length; sfi++) {
      const field = spacingFields[sfi];
      const raw = (node as unknown as { [k: string]: unknown })[field];
      if (typeof raw !== 'number') continue;
      const boundVariableId =
        (node.boundVariables as { [k: string]: { id?: string } | undefined } | undefined)?.[field]
          ?.id ?? null;
      recordComponentToken(acc.componentTokenIndex, nextContext, boundVariableId);
      acc.spacings.push({
        nodeId: node.id,
        nodeName: node.name,
        pageId,
        pageName,
        value: raw,
        field,
        boundVariableId,
        componentName: nextContext,
      });
    }
    // counterAxisSpacing — только при WRAP.
    if (
      'counterAxisSpacing' in node &&
      'layoutWrap' in node &&
      (node as { layoutWrap?: string }).layoutWrap === 'WRAP'
    ) {
      const rawCounter = (node as unknown as { counterAxisSpacing?: unknown }).counterAxisSpacing;
      if (typeof rawCounter === 'number') {
        const boundVariableId =
          (node.boundVariables as { counterAxisSpacing?: { id?: string } } | undefined)
            ?.counterAxisSpacing?.id ?? null;
        recordComponentToken(acc.componentTokenIndex, nextContext, boundVariableId);
        acc.spacings.push({
          nodeId: node.id,
          nodeName: node.name,
          pageId,
          pageName,
          value: rawCounter,
          field: 'counterAxisSpacing',
          boundVariableId,
          componentName: nextContext,
        });
      }
    }
  }

  // --- Обработка cornerRadius (Ф.18b шаг 1.2) ---
  // R7.C (PO 2026-05-10): значения 0 в scanner не записываем — это фильтрует
  // мусор от ELLIPSE/POLYGON и нод без скруглений (95% кейсов). Цена —
  // нарушение «должен быть привязан к Radius/None=0» не фиксируется в v1.0.
  if ('cornerRadius' in node) {
    const cornerRadius = (node as unknown as { cornerRadius: unknown }).cornerRadius;
    if (cornerRadius === figma.mixed) {
      // Mixed: четыре отдельные записи. Индивидуальные поля живут на
      // RectangleCornerMixin (не у всех нод с cornerRadius есть, например, у
      // STAR/POLYGON их нет) — поэтому проверяем 'topLeftRadius' in node.
      const cornerFields: Array<{ field: string; corner: ScannedRadius['corner'] }> = [
        { field: 'topLeftRadius', corner: 'topLeft' },
        { field: 'topRightRadius', corner: 'topRight' },
        { field: 'bottomLeftRadius', corner: 'bottomLeft' },
        { field: 'bottomRightRadius', corner: 'bottomRight' },
      ];
      for (let cfi = 0; cfi < cornerFields.length; cfi++) {
        const { field, corner } = cornerFields[cfi];
        if (!(field in node)) continue;
        const raw = (node as unknown as { [k: string]: unknown })[field];
        if (typeof raw !== 'number') continue;
        if (raw === 0) continue; // R7.C
        const boundVariableId =
          (node.boundVariables as { [k: string]: { id?: string } | undefined } | undefined)?.[field]
            ?.id ?? null;
        recordComponentToken(acc.componentTokenIndex, nextContext, boundVariableId);
        acc.radii.push({
          nodeId: node.id,
          nodeName: node.name,
          pageId,
          pageName,
          value: raw,
          corner,
          boundVariableId,
          componentName: nextContext,
        });
      }
    } else if (typeof cornerRadius === 'number') {
      if (cornerRadius !== 0) {
        // R7.C
        // На uniform cornerRadius binding в Figma всё равно живёт на индивидуальных
        // углах (topLeftRadius/...), поэтому пробуем достать id оттуда; иначе null.
        const bv = node.boundVariables as
          | { [k: string]: { id?: string } | undefined }
          | undefined;
        const boundVariableId =
          bv?.topLeftRadius?.id ??
          bv?.topRightRadius?.id ??
          bv?.bottomLeftRadius?.id ??
          bv?.bottomRightRadius?.id ??
          null;
        recordComponentToken(acc.componentTokenIndex, nextContext, boundVariableId);
        acc.radii.push({
          nodeId: node.id,
          nodeName: node.name,
          pageId,
          pageName,
          value: cornerRadius,
          corner: 'uniform',
          boundVariableId,
          componentName: nextContext,
        });
      }
    }
  }

  // --- Обработка текстовых нод ---
  if (node.type === 'TEXT') {
    // fontSize: figma.mixed кодируется как -1
    const fontSize =
      node.fontSize === figma.mixed ? -1 : (node.fontSize as number);

    // fontName: figma.mixed → family/style = "Mixed"
    const fontName =
      node.fontName === figma.mixed
        ? { family: 'Mixed', style: 'Mixed' }
        : (node.fontName as FontName);

    // lineHeight: берём числовое значение только для PIXELS, иначе null
    const lh = node.lineHeight === figma.mixed ? null : (node.lineHeight as LineHeight);
    const lineHeight =
      lh !== null && lh.unit === 'PIXELS' ? lh.value : null;

    // Привязанный текстовый стиль
    const textStyleId = node.textStyleId;
    const boundStyleId =
      typeof textStyleId === 'string' && textStyleId !== '' ? textStyleId : null;
    const boundStyleName = boundStyleId !== null ? resolveStyleName(boundStyleId, styleNames) : null;

    // Ф.16.6.5: пассивный сбор remote text styleIds.
    if (boundStyleId !== null && boundStyleName === null) {
      acc.remoteStyleIds.add(boundStyleId);
    }

    // Ф.17.3: индекс «компонент → токены» для текстовых нод.
    // Для текста токеном считается boundStyleId (variable text-style в Figma не существует).
    recordComponentToken(acc.componentTokenIndex, nextContext, boundStyleId);

    acc.texts.push({
      nodeId: node.id,
      nodeName: node.name,
      pageId,
      pageName,
      fontSize,
      fontFamily: fontName.family,
      fontWeight: fontName.style,
      lineHeight,
      boundStyleId,
      boundStyleName,
      componentName: nextContext,
    });
  }

  // --- Рекурсивный спуск в дочерние ноды ---
  if ('children' in node) {
    for (const child of node.children) {
      walkNode(child, pageId, pageName, acc, styleNames, nextContext);
    }
  }
}

// ---------------------------------------------------------------------------
// Публичная функция
// ---------------------------------------------------------------------------

/**
 * Сканирует Figma-документ в соответствии с выбранной областью scope.
 * Возвращает ScanResult с найденными цветами, текстами и статистикой.
 */
export async function scanDocument(scope: ScanScope): Promise<ScanResult> {
  const startTime = Date.now();

  const acc: ScanAccumulator = {
    colors: [],
    texts: [],
    spacings: [],
    radii: [],
    totalNodesScanned: 0,
    remoteStyleIds: new Set<string>(),
    componentTokenIndex: new Map<string, Set<string>>(),
  };

  var pagesScanned = 0;

  // Предзагрузка имён стилей — чтобы не вызывать getStyleById внутри walkNode
  var styleNames: { [id: string]: string } = {};
  var paintStyles = await figma.getLocalPaintStylesAsync();
  for (var psi = 0; psi < paintStyles.length; psi++) {
    styleNames[paintStyles[psi].id] = paintStyles[psi].name;
  }
  var textStyles = await figma.getLocalTextStylesAsync();
  for (var tsi = 0; tsi < textStyles.length; tsi++) {
    styleNames[textStyles[tsi].id] = textStyles[tsi].name;
  }

  // Для режимов без перебора страниц — проверяем активную страницу на префикс
  if (scope !== 'page' && isIgnoredByPrefix(figma.currentPage.name)) {
    return {
      colors: [],
      texts: [],
      spacings: [],
      radii: [],
      totalNodesScanned: 0,
      scanDurationMs: Date.now() - startTime,
      pagesScanned: 0,
      scopeLabel: figma.currentPage.name,
      scope,
    };
  }

  if (scope === 'page') {
    // Обход всех нод активной страницы
    pagesScanned = 1;
    var pageChildren = figma.currentPage.children;
    for (var ci = 0; ci < pageChildren.length; ci++) {
      walkNode(pageChildren[ci] as SceneNode, figma.currentPage.id, figma.currentPage.name, acc, styleNames);
    }
  } else if (scope === 'selection') {
    // Обход только выделенных нод и их детей
    pagesScanned = 1;
    var sel = figma.currentPage.selection;
    for (var si = 0; si < sel.length; si++) {
      walkNode(sel[si], figma.currentPage.id, figma.currentPage.name, acc, styleNames);
    }
  } else if (scope === 'section') {
    // Все ноды типа SECTION на активной странице
    pagesScanned = 1;
    var allChildren = figma.currentPage.children;
    for (var ni = 0; ni < allChildren.length; ni++) {
      if (allChildren[ni].type === 'SECTION') {
        walkNode(allChildren[ni] as SceneNode, figma.currentPage.id, figma.currentPage.name, acc, styleNames);
      }
    }
  } else if (scope === 'topFrames') {
    // Все FRAME верхнего уровня активной страницы
    pagesScanned = 1;
    var topChildren = figma.currentPage.children;
    for (var fi = 0; fi < topChildren.length; fi++) {
      if (topChildren[fi].type === 'FRAME') {
        walkNode(topChildren[fi] as SceneNode, figma.currentPage.id, figma.currentPage.name, acc, styleNames);
      }
    }
  }

  const scanDurationMs = Math.round(Date.now() - startTime);

  var scopeLabel: string = figma.currentPage.name;
  if (scope === 'page') {
    scopeLabel = figma.currentPage.name;
  } else if (scope === 'selection') {
    var selNodes = figma.currentPage.selection;
    if (selNodes.length === 0) {
      scopeLabel = 'Выделение (пусто)';
    } else if (selNodes.length === 1) {
      scopeLabel = selNodes[0].name;
    } else {
      scopeLabel = 'Выделение (' + selNodes.length + ')';
    }
  } else if (scope === 'section') {
    var sects = figma.currentPage.children.filter(function (n) {
      return n.type === 'SECTION';
    });
    if (sects.length === 1) {
      scopeLabel = sects[0].name;
    } else {
      scopeLabel = 'Sections (' + sects.length + ')';
    }
  } else if (scope === 'topFrames') {
    var frs = figma.currentPage.children.filter(function (n) {
      return n.type === 'FRAME';
    });
    scopeLabel = 'Фреймы страницы (' + frs.length + ')';
  }

  // Ф.17.3: сериализуем Map<string, Set<string>> в plain object {name: string[]}
  // для границы sandbox/UI (structuredClone в Figma postMessage не передаёт Map/Set
  // надёжно). Опускаем поле, если индекс пуст — backward compat и нулевой оверхед
  // на скан без компонентов.
  let componentTokenIndex: { [componentName: string]: string[] } | undefined;
  if (acc.componentTokenIndex.size > 0) {
    componentTokenIndex = {};
    acc.componentTokenIndex.forEach(function (set, name) {
      const arr: string[] = [];
      set.forEach(function (id) { arr.push(id); });
      (componentTokenIndex as { [k: string]: string[] })[name] = arr;
    });
  }

  return {
    colors: acc.colors,
    texts: acc.texts,
    spacings: acc.spacings,
    radii: acc.radii,
    totalNodesScanned: acc.totalNodesScanned,
    scanDurationMs,
    pagesScanned,
    scopeLabel,
    scope,
    componentTokenIndex,
  };
}
