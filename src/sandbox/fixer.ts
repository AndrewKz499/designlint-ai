import type { ViolationType } from '../shared/types';

/**
 * Применяет исправление к ноде: привязывает стиль или variable из дизайн-системы.
 * Возвращает true если исправление выполнено успешно, false если не удалось.
 *
 * @param nodeId       — ID ноды в Figma
 * @param tokenId      — ID стиля (Paint Style или Text Style) или Variable в Figma
 * @param violationType — тип нарушения, определяет способ исправления
 * @param field        — имя поля для spacing/radius нарушений (R2.A baseline Ф.18b.1
 *                       от 2026-05-10): paddingLeft, itemSpacing, cornerRadius,
 *                       topLeftRadius, ... UI извлекает из violationId и передаёт
 *                       явно; для color/text не требуется и игнорируется.
 */
export async function fixViolation(
  nodeId: string,
  tokenId: string,
  violationType: ViolationType,
  field?: string,
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

  // --- Ф.18b.1.5: spacing_off_scale — привязать FLOAT-variable к auto-layout полю ---
  if (violationType === 'spacing_off_scale') {
    // field обязателен (R2.A baseline Ф.18b.1): UI обязан передать имя поля,
    // извлечённое из violationId (формат `nodeId_spacing_off_scale:paddingLeft`)
    if (typeof field !== 'string' || field.length === 0) {
      return false;
    }

    // Spacing-variables — только через Variables API (стилей для numeric не существует)
    if (tokenId.indexOf('VariableID:') !== 0) {
      return false;
    }

    var spacingVariable = await figma.variables.getVariableByIdAsync(tokenId);
    if (spacingVariable === null) {
      return false;
    }
    if (spacingVariable.resolvedType !== 'FLOAT') {
      return false;
    }

    // Spacing применим только к auto-layout фреймам
    if (!('layoutMode' in node)) {
      return false;
    }
    var layoutNode = node as FrameNode;
    if (layoutNode.layoutMode === 'NONE') {
      return false;
    }

    // Whitelist допустимых spacing-полей (защита от мусора в field)
    if (
      field !== 'paddingLeft' &&
      field !== 'paddingRight' &&
      field !== 'paddingTop' &&
      field !== 'paddingBottom' &&
      field !== 'itemSpacing' &&
      field !== 'counterAxisSpacing'
    ) {
      return false;
    }

    // setBoundVariable(field, variable) — Plugin API метод для биндинга
    // числовых variable к полям ноды (см. plugin-api.d.ts:5672)
    try {
      (layoutNode as any).setBoundVariable(field, spacingVariable);
      return true;
    } catch (err) {
      return false;
    }
  }

  // --- Ф.18b.1.5: radius_off_scale — привязать FLOAT-variable к cornerRadius-полю ---
  if (violationType === 'radius_off_scale') {
    // field обязателен (R2.A baseline Ф.18b.1)
    if (typeof field !== 'string' || field.length === 0) {
      return false;
    }

    if (tokenId.indexOf('VariableID:') !== 0) {
      return false;
    }

    var radiusVariable = await figma.variables.getVariableByIdAsync(tokenId);
    if (radiusVariable === null) {
      return false;
    }
    if (radiusVariable.resolvedType !== 'FLOAT') {
      return false;
    }

    // Все типы нод с радиусом имеют свойство cornerRadius
    if (!('cornerRadius' in node)) {
      return false;
    }
    var radiusNode = node as any;

    // Whitelist значений: 'cornerRadius' для uniform → биндим все 4 угла,
    // одиночные углы — биндим по одному
    if (field === 'cornerRadius') {
      // VariableBindableNodeField не содержит 'cornerRadius', поэтому
      // uniform-радиус реализуется через одновременный биндинг четырёх углов
      try {
        radiusNode.setBoundVariable('topLeftRadius', radiusVariable);
        radiusNode.setBoundVariable('topRightRadius', radiusVariable);
        radiusNode.setBoundVariable('bottomLeftRadius', radiusVariable);
        radiusNode.setBoundVariable('bottomRightRadius', radiusVariable);
        return true;
      } catch (err) {
        return false;
      }
    }

    if (
      field !== 'topLeftRadius' &&
      field !== 'topRightRadius' &&
      field !== 'bottomLeftRadius' &&
      field !== 'bottomRightRadius'
    ) {
      return false;
    }

    try {
      radiusNode.setBoundVariable(field, radiusVariable);
      return true;
    } catch (err) {
      return false;
    }
  }

  // TODO: nonstandard_font_size still not supported in v1.0 — text-style cannot
  // be applied as size-only, known limitation. Pending design decision on
  // partial text-style fix (size only without family/weight/lineHeight).
  return false;
}
