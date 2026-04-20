import type { ViolationType } from '../shared/types';

/**
 * Применяет исправление к ноде: привязывает стиль из дизайн-системы.
 * Возвращает true если исправление выполнено успешно, false если не удалось.
 *
 * @param nodeId       — ID ноды в Figma
 * @param tokenId      — ID стиля (Paint Style или Text Style) в Figma
 * @param violationType — тип нарушения, определяет способ исправления
 */
export async function fixViolation(
  nodeId: string,
  tokenId: string,
  violationType: ViolationType,
): Promise<boolean> {
  // Находим ноду
  const node = figma.getNodeById(nodeId);
  if (node === null) return false;

  // --- Цветовые нарушения: привязать Paint Style или Variable ---
  if (
    violationType === 'hardcoded_color' ||
    violationType === 'detached_style' ||
    violationType === 'similar_to_token'
  ) {
    // Ветка Variable (ID начинается с "VariableID:")
    if (tokenId.indexOf('VariableID:') === 0) {
      var variable = await figma.variables.getVariableByIdAsync(tokenId);
      if (!variable) return false;
      // Проверка что нода поддерживает fills
      var fillsNode = node as any;
      if (!fillsNode.fills || !Array.isArray(fillsNode.fills) || fillsNode.fills.length === 0) return false;
      // Клонируем массив fills и привязываем первый fill к Variable
      var fills = fillsNode.fills.slice();
      var firstFill = Object.assign({}, fills[0]);
      firstFill = figma.variables.setBoundVariableForPaint(firstFill, 'color', variable);
      fills[0] = firstFill;
      fillsNode.fills = fills;
      return true;
    }

    // Ветка Style (tokenId = "S:..." или обычный Style ID)
    var style = await figma.getStyleByIdAsync(tokenId);
    if (!style) return false;

    // Проверяем, что у ноды есть свойство fillStyleId
    if (!('fillStyleId' in node)) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node as any).fillStyleId = tokenId;
    return true;
  }

  // --- Текстовое нарушение: привязать Text Style ---
  if (violationType === 'missing_text_style') {
    const style = await figma.getStyleByIdAsync(tokenId);
    if (style === null) return false;

    if (node.type !== 'TEXT') return false;
    const textNode = node as TextNode;

    // Загружаем шрифт перед установкой стиля (необходимо для редактирования TextNode)
    // fontName может быть figma.mixed — загружаем только если это конкретный FontName
    if (textNode.fontName !== figma.mixed) {
      await figma.loadFontAsync(textNode.fontName as FontName);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node as any).textStyleId = tokenId;
    return true;
  }

  // Типы nonstandard_font_size и spacing_off_scale не поддаются автоисправлению
  return false;
}
