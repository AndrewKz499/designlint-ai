import type { Violation } from '../shared/types';

const MARKER_NAME = 'DesignLint Marker';
const MAX_MARKERS = 50;

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/** Рекурсивно собирает все ноды с заданным именем в поддереве */
function findByName(node: BaseNode, name: string, result: SceneNode[]): void {
  if ('name' in node && node.name === name && node !== figma.root) {
    result.push(node as SceneNode);
  }
  if ('children' in node) {
    const children = (node as ChildrenMixin).children;
    for (let i = 0; i < children.length; i++) {
      findByName(children[i], name, result);
    }
  }
}

/** Возвращает RGB-цвет маркера по severity нарушения */
function markerColor(severity: Violation['severity']): RGB {
  if (severity === 'critical') {
    return { r: 1, g: 0.2, b: 0.2 };
  }
  if (severity === 'warning') {
    return { r: 1, g: 0.65, b: 0 };
  }
  return { r: 0.6, g: 0.6, b: 0.6 };
}

// ---------------------------------------------------------------------------
// Публичные функции
// ---------------------------------------------------------------------------

/**
 * Переключает камеру Figma к указанной ноде:
 * переходит на нужную страницу, выделяет и центрирует ноду во вьюпорте.
 */
export async function navigateToNode(nodeId: string, pageId: string): Promise<void> {
  // Находим страницу
  let targetPage: PageNode | null = null;
  const pages = figma.root.children;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].id === pageId) {
      targetPage = pages[i];
      break;
    }
  }

  if (targetPage === null) {
    figma.notify('Страница не найдена');
    return;
  }

  await figma.setCurrentPageAsync(targetPage);

  // Находим ноду
  const node = figma.getNodeById(nodeId);
  if (node === null) {
    figma.notify('Элемент не найден');
    return;
  }

  // Перемещаем камеру и выделяем ноду
  figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  figma.currentPage.selection = [node as SceneNode];
}

/**
 * Создаёт цветные маркеры (эллипсы 8×8) рядом с нодами-нарушителями.
 * Сначала удаляет старые маркеры. Обрабатывает не более MAX_MARKERS нарушений.
 */
export async function createMarkers(violations: Violation[]): Promise<void> {
  await clearMarkers();

  const limit = violations.length < MAX_MARKERS ? violations.length : MAX_MARKERS;

  for (let i = 0; i < limit; i++) {
    const violation = violations[i];

    const node = figma.getNodeById(violation.nodeId);
    if (node === null) continue;
    if (!('absoluteBoundingBox' in node)) continue;

    const bbox = (node as SceneNode & { absoluteBoundingBox: Rect }).absoluteBoundingBox;
    if (bbox === null) continue;

    const ellipse = figma.createEllipse();
    ellipse.x = bbox.x - 12;
    ellipse.y = bbox.y;
    ellipse.resize(8, 8);
    ellipse.name = MARKER_NAME;
    ellipse.locked = true;
    ellipse.fills = [{ type: 'SOLID', color: markerColor(violation.severity) }];

    // Добавляем маркер на текущую страницу — она уже загружена (мы только что сканировали)
    // Если нода на другой странице, маркер всё равно попадёт на текущую
    figma.currentPage.appendChild(ellipse);
  }
}

/**
 * Удаляет все маркеры DesignLint со всех страниц документа.
 */
export async function clearMarkers(): Promise<void> {
  const pages = figma.root.children;
  for (let i = 0; i < pages.length; i++) {
    await pages[i].loadAsync();
    const found: SceneNode[] = [];
    findByName(pages[i], MARKER_NAME, found);
    for (let j = 0; j < found.length; j++) {
      found[j].remove();
    }
  }
}
