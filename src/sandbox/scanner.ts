import type { ScannedColor, ScannedText, ScanResult } from '../shared/types';

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

  acc.totalNodesScanned += 1;

  // --- Обработка заливок (fills) ---
  if ('fills' in node && node.fills !== figma.mixed) {
    const fills = node.fills as ReadonlyArray<Paint>;
    for (const fill of fills) {
      if (fill.type !== 'SOLID') continue;

      const { r, g, b } = fill.color;
      const opacity = fill.opacity ?? 1;
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
 * Сканирует весь Figma-документ: обходит все страницы и все ноды на каждой из них.
 * Отправляет прогресс в UI после завершения каждой страницы.
 * Возвращает ScanResult с найденными цветами, текстами и статистикой.
 */
export async function scanDocument(): Promise<ScanResult> {
  const startTime = Date.now();

  const pages = figma.root.children; // PageNode[]
  const totalPages = pages.length;

  const acc: ScanAccumulator = {
    colors: [],
    texts: [],
    totalNodesScanned: 0,
  };

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];

    // Загружаем страницу перед обходом (необходимо для неактивных страниц)
    await page.loadAsync();

    for (const node of page.children) {
      walkNode(node, page.id, page.name, acc);
    }

    // Отправляем прогресс в UI
    figma.ui.postMessage({
      type: 'scan-progress',
      data: { current: i + 1, total: totalPages },
    });
  }

  const scanDurationMs = Math.round(Date.now() - startTime);

  return {
    colors: acc.colors,
    texts: acc.texts,
    totalNodesScanned: acc.totalNodesScanned,
    scanDurationMs,
    pagesScanned: totalPages,
  };
}
