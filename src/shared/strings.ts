// Единый словарь пользовательских строк UI.
// Правило: ни один компонент не показывает строку напрямую — только через этот словарь.

import type { ViolationType } from './types';

// ─── Категории нарушений ─────────────────────────────────────────────────────
export type Category = 'colors' | 'typography' | 'layout';

export const CATEGORY_META: Record<Category, { emoji: string; label: string }> = {
  colors:     { emoji: '🎨', label: 'Цвета' },
  typography: { emoji: '✏️', label: 'Шрифты' },
  layout:     { emoji: '📐', label: 'Макет' },
};

export const VIOLATION_CATEGORY: Record<ViolationType, Category> = {
  hardcoded_color:       'colors',
  detached_style:        'colors',
  similar_to_token:      'colors',
  missing_text_style:    'typography',
  nonstandard_font_size: 'typography',
  spacing_off_scale:     'layout',
};

// ─── Заголовки нарушений на языке дизайнера ──────────────────────────────────
export const VIOLATION_TITLE: Record<ViolationType, string> = {
  hardcoded_color:       'Цвет не из системы',
  detached_style:        'Отвязанный цвет',
  similar_to_token:      'Почти как токен',
  missing_text_style:    'Шрифт без стиля',
  nonstandard_font_size: 'Размер вне шкалы',
  spacing_off_scale:     'Отступ вне шкалы',
};

export const VIOLATION_HINT: Record<ViolationType, string> = {
  hardcoded_color:       'Этот цвет задан вручную. В системе есть подходящий токен.',
  detached_style:        'Стиль был привязан, но отвязался. Верните привязку.',
  similar_to_token:      'Цвет очень близок к токену — лучше использовать его.',
  missing_text_style:    'Текст без стиля: при изменении типографики придётся править вручную.',
  nonstandard_font_size: 'Размер шрифта не из типографической шкалы.',
  spacing_off_scale:     'Отступ не укладывается в шаг сетки.',
};

// ─── Источники дизайн-системы ────────────────────────────────────────────────
export const SOURCE_LABEL = {
  paintStyles: 'Цвета (стили)',
  textStyles:  'Шрифты (стили)',
  variables:   'Переменные',
  jsonTokens:  'Подключённые JSON-файлы',
};

// ─── Режимы области сканирования ─────────────────────────────────────────────
export const SCOPE_LABEL = {
  selection: 'Выделение',
  section:   'Section',
  topFrames: 'Фреймы страницы',
  page:      'Вся страница',
};

// ─── Приоритеты (под Фазу 10) ────────────────────────────────────────────────
export const PRIORITY_META = {
  critical:  { emoji: '🔴', label: 'Критично' },
  important: { emoji: '🟡', label: 'Важно' },
  minor:     { emoji: '⚪', label: 'Мелочь' },
};

// ─── Ключевые строки экранов ─────────────────────────────────────────────────
export const UI = {
  startTitle:       'Проверить макет на соответствие дизайн-системе',
  startCta:         'Проверить выделение',
  startCtaEmpty:    'Выделите фрейм или Section',
  sourcesToggle:    'Источники дизайн-системы',
  rescanSources:    'Пересканировать источники',

  progressLabel:    (done: number, total: number) => `Проверено ${done} из ${total}`,
  scanningIdle:     'Сканирование...',
  scanningWithCount: (n: number) => `Проверено ${n} элементов...`,

  dashErrorsTitle:  (count: number) => `Выявленные ошибки: ${count}`,
  dashAreasTitle:   'Области проверки',
  dashScoreLabel:   'Оценка макета',
  dashContextBadge: (name: string, count: number) => `Проверено: ${name} · ${count} элементов`,
  dashAiFixAll:     '✨ Исправить всё с помощью AI',
  dashFixAll:       'Исправить все',
  dashReviewOne:    'Исправить по очереди',
  dashRescan:       'Сканировать заново',
  dashEmpty:        'Всё в порядке. Макет соответствует системе.',

  reviewTitle:      'Проверить и исправить',
  reviewFix:        'Исправить',
  reviewSkip:       'Пропустить',
  reviewIgnore:     'Скрыть',
  reviewBack:       '← Назад',
  reviewDone:       'Готово',
  reviewCurrent:    'Сейчас',
  reviewSuggested:  'Рекомендуется',

  scopeTitle:       'Область проверки',
  searchingSources: 'Ищем источники…',
  sdSpacingLabel:   'Отступы',
  sdRadiusLabel:    'Скругления',

  errNoSelection:   'Выделите фрейм или Section, чтобы начать проверку.',
  errNoTokens:      'В файле нет стилей и Variables. Добавьте цветовые стили или опубликуйте библиотеку, чтобы плагин мог сравнивать макет с системой.',
  errNoAiKey:       'Для AI-объяснений нужен ключ Google Gemini. Добавьте его в Настройках или выключите тоггл «Использовать AI» там же.',

  reportTitle:        'Готово',
  reportFixedLabel:   (fixed: number, total: number) => `Исправлено ${fixed} из ${total}`,
  reportDurationLabel: (min: number, sec: number) =>
    min > 0 ? `Время: ${min} мин ${sec} с` : `Время: ${sec} с`,
  reportScopeLabel:   (label: string) => `Область: ${label}`,
  reportCheckAgain:   'Проверить ещё',
  reportClearMarkers: 'Убрать маркеры с холста',
  reportMarkersCleared: 'Маркеры убраны',

  // О плагине
  aboutTitle:       'О плагине',
  aboutDescription: 'Аудит дизайн-систем в Figma на языке дизайнера',
  aboutVersion:     'Версия 0.12.1',
  aboutFeedback:    'Обратная связь',

  aiToggleLabel: 'Использовать AI для объяснений',
  aiToggleHint:  'Когда выключено — плагин работает только на правилах без запросов к Gemini',

  settingsRemoveKey:  'Удалить ключ',
  settingsKeyRemoved: 'Ключ удалён',
};
