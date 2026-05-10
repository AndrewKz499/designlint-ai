import type { Violation } from '../shared/types';

const MARKER_NAME = 'DesignLint Marker';
const GROUP_NAME = 'DesignLint Markers';
const MAX_MARKERS = 50;


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
 * Создаёт цветные маркеры (эллипсы 8×8) рядом с нодами-нарушителями
 * и группирует их в папку 'DesignLint Markers'.
 * Сначала удаляет старые маркеры. Обрабатывает не более MAX_MARKERS нарушений.
 */
export async function createMarkers(violations: Violation[]): Promise<void> {
  await clearMarkers();

  const limit = violations.length < MAX_MARKERS ? violations.length : MAX_MARKERS;
  const markersCreated: SceneNode[] = [];
  const seen: Record<string, boolean> = {};

  for (let i = 0; i < limit; i++) {
    const violation = violations[i];

    // Один маркер на ноду — пропускаем дубликаты
    if (seen[violation.nodeId] === true) continue;
    seen[violation.nodeId] = true;

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
    ellipse.fills = [{ type: 'SOLID', color: { r: 1, g: 0.23, b: 0.19 } }];
    ellipse.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    ellipse.strokeWeight = 1.5;

    figma.currentPage.appendChild(ellipse);
    markersCreated.push(ellipse);
  }

  // Группируем все маркеры в одну папку для удобства управления
  if (markersCreated.length > 0) {
    const group = figma.group(markersCreated, figma.currentPage);
    group.name = GROUP_NAME;
    group.locked = true;
  }
}

/**
 * Удаляет все маркеры DesignLint с активной страницы.
 *
 * Маркеры создаются текущей версией плагина строго как top-level дети
 * figma.currentPage (см. createMarkers → figma.group(..., figma.currentPage)),
 * поэтому полный рекурсивный обход всего дерева документа не нужен.
 *
 * Ранее clearMarkers загружал loadAsync() все страницы файла и рекурсивно
 * обходил каждое поддерево — это давало >60 секунд на больших файлах при
 * любом скане (включая selection из 1 элемента), потому что createMarkers
 * вызывается из start-scan безусловно. См. баг 8.
 */
export async function clearMarkers(): Promise<void> {
  const children = figma.currentPage.children;
  // Идём с конца — remove() меняет порядок, безопаснее
  for (let i = children.length - 1; i >= 0; i--) {
    const node = children[i];
    if (node.name === GROUP_NAME || node.name === MARKER_NAME) {
      try {
        node.remove();
      } catch (e) {
        // Нода могла быть удалена каскадно — это нормально, продолжаем.
      }
    }
  }
}
