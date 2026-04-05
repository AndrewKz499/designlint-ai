import type { Violation } from '../shared/types';

const MARKER_NAME = 'DesignLint Marker';
const GROUP_NAME = 'DesignLint Markers';
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
 * Удаляет все маркеры DesignLint со всех страниц документа.
 * Ищет группу 'DesignLint Markers' и одиночные 'DesignLint Marker' (обратная совместимость).
 */
export async function clearMarkers(): Promise<void> {
  const pages = figma.root.children;
  for (let i = 0; i < pages.length; i++) {
    await pages[i].loadAsync();

    const found: SceneNode[] = [];
    // Группа (новый формат)
    findByName(pages[i], GROUP_NAME, found);
    // Одиночные маркеры (старый формат, обратная совместимость)
    findByName(pages[i], MARKER_NAME, found);

    for (let j = 0; j < found.length; j++) {
      found[j].remove();
    }
  }
}
