import type { ScannedColor, ScannedText, ScanResult, ScanScope } from '../shared/types';

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
function resolveStyleName(styleId: string | symbol): string | null {
  if (typeof styleId !== 'string' || styleId === '') return null;
  return figma.getStyleById(styleId)?.name ?? null;
}

// ---------------------------------------------------------------------------
// Основная логика обхода
// ---------------------------------------------------------------------------

interface ScanAccumulator {
  colors: ScannedColor[];
  texts: ScannedText[];
  totalNodesScanned: number;
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
): void {
  // Пропускаем скрытые ноды вместе со всеми их потомками
  if (!node.visible) return;
  // Пропускаем маркеры, созданные самим плагином
  if (node.name === 'DesignLint Marker') return;
  // Служебные префиксы — пропускаем ноду и всё поддерево
  if (isIgnoredByPrefix(node.name)) return;

  acc.totalNodesScanned += 1;

  // --- Обработка заливок (fills) ---
  if ('fills' in node && node.fills !== figma.mixed) {
    // Текстовые ноды с привязанным текстовым стилем не проверяем по fills:
    // цвет текста является частью стиля и не является самостоятельным нарушением
    let skipFills = false;
    if (node.type === 'TEXT') {
      const tsId = (node as TextNode).textStyleId;
      if (typeof tsId === 'string' && tsId !== '') {
        skipFills = true;
      }
    }

    if (!skipFills) {
      const fills = node.fills as ReadonlyArray<Paint>;
      for (const fill of fills) {
        if (fill.type !== 'SOLID') continue;

        const { r, g, b } = fill.color;
        const opacity = fill.opacity !== undefined ? fill.opacity : 1;
        const styleId = 'fillStyleId' in node ? node.fillStyleId : '';
        const boundStyleId = typeof styleId === 'string' && styleId !== '' ? styleId : null;
        const boundStyleName = boundStyleId !== null ? resolveStyleName(boundStyleId) : null;

        acc.colors.push({
          nodeId: node.id,
          nodeName: node.name,
          pageId,
          pageName,
          hex: rgbToHex(r, g, b),
          opacity,
          boundStyleId,
          boundStyleName,
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
    const boundStyleName = boundStyleId !== null ? resolveStyleName(boundStyleId) : null;

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
    });
  }

  // --- Рекурсивный спуск в дочерние ноды ---
  if ('children' in node) {
    for (const child of node.children) {
      walkNode(child, pageId, pageName, acc);
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
    totalNodesScanned: 0,
  };

  var pagesScanned = 0;

  // Для режимов без перебора страниц — проверяем активную страницу на префикс
  if (scope !== 'page' && isIgnoredByPrefix(figma.currentPage.name)) {
    return {
      colors: [],
      texts: [],
      totalNodesScanned: 0,
      scanDurationMs: Date.now() - startTime,
      pagesScanned: 0,
      scopeLabel: figma.currentPage.name,
      scope,
    };
  }

  if (scope === 'page') {
    // Обход всех страниц документа (с пропуском служебных по префиксу)
    var pages = figma.root.children;
    for (var pi = 0; pi < pages.length; pi++) {
      var page = pages[pi];
      if (isIgnoredByPrefix(page.name)) continue;
      pagesScanned++;
      await (page as PageNode).loadAsync();
      var pageChildren = (page as PageNode).children;
      for (var ci = 0; ci < pageChildren.length; ci++) {
        walkNode(pageChildren[ci] as SceneNode, page.id, page.name, acc);
      }
      figma.ui.postMessage({
        type: 'scan-progress',
        data: { current: pi + 1, total: pages.length },
      });
    }
  } else if (scope === 'selection') {
    // Обход только выделенных нод и их детей
    pagesScanned = 1;
    var sel = figma.currentPage.selection;
    for (var si = 0; si < sel.length; si++) {
      walkNode(sel[si], figma.currentPage.id, figma.currentPage.name, acc);
    }
  } else if (scope === 'section') {
    // Все ноды типа SECTION на активной странице
    pagesScanned = 1;
    var allChildren = figma.currentPage.children;
    for (var ni = 0; ni < allChildren.length; ni++) {
      if (allChildren[ni].type === 'SECTION') {
        walkNode(allChildren[ni] as SceneNode, figma.currentPage.id, figma.currentPage.name, acc);
      }
    }
  } else if (scope === 'topFrames') {
    // Все FRAME верхнего уровня активной страницы
    pagesScanned = 1;
    var topChildren = figma.currentPage.children;
    for (var fi = 0; fi < topChildren.length; fi++) {
      if (topChildren[fi].type === 'FRAME') {
        walkNode(topChildren[fi] as SceneNode, figma.currentPage.id, figma.currentPage.name, acc);
      }
    }
  } else {
    // Fallback — обход всех страниц (с пропуском служебных по префиксу)
    var fbPages = figma.root.children;
    for (var fpi = 0; fpi < fbPages.length; fpi++) {
      var fbPage = fbPages[fpi];
      if (isIgnoredByPrefix(fbPage.name)) continue;
      pagesScanned++;
      await (fbPage as PageNode).loadAsync();
      var fbChildren = (fbPage as PageNode).children;
      for (var fci = 0; fci < fbChildren.length; fci++) {
        walkNode(fbChildren[fci] as SceneNode, fbPage.id, fbPage.name, acc);
      }
    }
  }

  const scanDurationMs = Math.round(Date.now() - startTime);

  var scopeLabel: string;
  if (scope === 'page') {
    scopeLabel = 'Весь документ';
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
  } else {
    scopeLabel = figma.currentPage.name;
  }

  return {
    colors: acc.colors,
    texts: acc.texts,
    totalNodesScanned: acc.totalNodesScanned,
    scanDurationMs,
    pagesScanned,
    scopeLabel,
    scope,
  };
}
