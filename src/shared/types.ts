/** Найденный цвет в Figma-файле */
export interface ScannedColor {
  /** ID ноды в Figma */
  nodeId: string;
  /** Имя ноды */
  nodeName: string;
  pageId: string;
  pageName: string;
  /** Цвет в формате #RRGGBB */
  hex: string;
  /** Прозрачность от 0 до 1 */
  opacity: number;
  /** ID привязанного стиля; null если цвет задан напрямую (hardcoded) */
  boundStyleId: string | null;
  /** Имя привязанного стиля; null если hardcoded */
  boundStyleName: string | null;
}

/** Найденный текстовый элемент в Figma-файле */
export interface ScannedText {
  /** ID ноды в Figma */
  nodeId: string;
  /** Имя ноды */
  nodeName: string;
  pageId: string;
  pageName: string;
  /** Размер шрифта; -1 если в ноде смешаны разные значения (mixed) */
  fontSize: number;
  /** Семейство шрифта; "Mixed" если в ноде смешаны разные значения */
  fontFamily: string;
  fontWeight: string;
  /** Высота строки в пикселях; null если не задана явно */
  lineHeight: number | null;
  /** ID привязанного текстового стиля; null если параметры заданы напрямую */
  boundStyleId: string | null;
  /** Имя привязанного текстового стиля; null если hardcoded */
  boundStyleName: string | null;
}

/** Итоговый результат сканирования Figma-файла */
export interface ScanResult {
  colors: ScannedColor[];
  texts: ScannedText[];
  /** Общее количество просканированных нод */
  totalNodesScanned: number;
  /** Длительность сканирования в миллисекундах */
  scanDurationMs: number;
  /** Количество просканированных страниц */
  pagesScanned: number;
  /** Что именно было проверено — для отображения в UI-чипе */
  scopeLabel: string;
  /** Область сканирования (режим, выбранный пользователем) */
  scope: ScanScope;
}

/** Категория токена дизайн-системы */
export type TokenCategory = 'color' | 'typography' | 'spacing' | 'radius' | 'effect';

/** Один токен дизайн-системы (стиль или переменная из Figma) */
export interface Token {
  /** ID стиля или переменной в Figma */
  id: string;
  /** Имя токена, например "Primary/Blue" */
  name: string;
  category: TokenCategory;
  /**
   * Строковое представление значения:
   * - цвет: "#1A73E8"
   * - типографика: "16px/Inter/Bold"
   * - spacing/radius: "8"
   */
  value: string;
  /** Источник токена, например "Local Paint Styles" или "Variables/Colors" */
  source: string;
  kind: 'paintStyles' | 'textStyles' | 'variables';
}

/** Обнаруженный источник токенов дизайн-системы в Figma-файле */
export interface SnapshotSource {
  /** Отображаемое имя источника, например "Local Paint Styles" */
  name: string;
  type: 'variables' | 'local-styles';
  /** Категория источника для UI */
  kind: 'paintStyles' | 'textStyles' | 'variables';
  /** Количество токенов в этом источнике */
  tokenCount: number;
  /** Включён ли источник в сканирование (по умолчанию true) */
  enabled: boolean;
}

/** Проблема, обнаруженная при валидации эталонного снепшота дизайн-системы */
export interface SnapshotValidationIssue {
  /**
   * Тип проблемы:
   * - 'orphan-token' — токен не привязан ни к одной ноде
   * - 'duplicate-name' — несколько токенов с одинаковым именем
   * - 'empty-value' — токен с пустым значением
   */
  type: 'orphan-token' | 'duplicate-name' | 'empty-value';
  message: string;
  /** ID токена с проблемой; null если проблема не привязана к конкретному токену */
  tokenId: string | null;
}

/** Итоговый снепшот дизайн-системы — эталон для сравнения при сканировании */
export interface ReferenceSnapshot {
  tokens: Token[];
  sources: SnapshotSource[];
  /** Шкалы числовых значений, извлечённые из токенов */
  scales: {
    /** Сетка отступов, например [4, 8, 12, 16, 24, 32] */
    spacingScale: number[];
    radiusScale: number[];
    fontSizes: number[];
  };
  validation: {
    issues: SnapshotValidationIssue[];
    /** Общее количество токенов на момент валидации */
    totalTokens: number;
  };
  /** Временная метка создания снепшота (Date.now()) */
  createdAt: number;
  /** Хэш содержимого для определения изменений с момента последнего скана */
  hash: string;
}

// Область сканирования: что обходит scanner
export type ScanScope =
  | 'selection'   // только выделенные ноды и их дети
  | 'section'     // все SECTION-ноды активной страницы
  | 'topFrames'   // все frame верхнего уровня активной страницы
  | 'page';       // вся активная страница целиком

/** Тип нарушения, обнаруженного в Figma-файле */
export type ViolationType =
  /** Цвет задан напрямую, нет привязки к стилю или токену */
  | 'hardcoded_color'
  /** Текст без привязанного текстового стиля */
  | 'missing_text_style'
  /** Значение совпадает с токеном, но стиль не привязан */
  | 'detached_style'
  /** Значение похоже на токен (дельта ≤5 в RGB) */
  | 'similar_to_token'
  /** Размер шрифта не соответствует шкале из снепшота */
  | 'nonstandard_font_size'
  /** Spacing не кратен базовой шкале из снепшота */
  | 'spacing_off_scale';

/** Серьёзность нарушения */
export type Severity = 'critical' | 'warning' | 'info';

/** Одно нарушение, обнаруженное при аудите */
export interface Violation {
  /** Уникальный ID, например nodeId + '_' + type */
  id: string;
  type: ViolationType;
  severity: Severity;
  nodeId: string;
  nodeName: string;
  pageId: string;
  pageName: string;
  /** Человекочитаемое описание, например "Цвет #3366CC задан напрямую, не привязан к стилю" */
  message: string;
  /** Текущее значение в ноде, например "#3366CC" или "15px" */
  currentValue: string;
  /** Рекомендованный токен, например "Primary/Blue"; null если подходящего нет */
  suggestedToken: string | null;
  /** ID стиля Figma для применения через Fix; null если рекомендации нет */
  suggestedTokenId: string | null;
  /** Топ-N ближайших токенов-кандидатов для Combobox (включая suggestedTokenId как первый) */
  candidates?: Array<{ id: string; name: string; value: string; kind: 'paintStyles' | 'textStyles' | 'variables' }>;
}

/** Итог проверки файла на соответствие дизайн-системе */
export interface DetectionResult {
  violations: Violation[];
  /** Оценка качества файла от 0 до 100 */
  healthScore: number;
  /** Сводка по количеству нарушений */
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
}

/** Метрики для финального экрана «Готово» */
export interface ReportMetrics {
  /** Health score на момент старта аудита (до первого Fix) */
  scoreBefore: number;
  /** Health score на момент показа отчёта */
  scoreAfter: number;
  /** Количество нарушений, исправленных через Fix (не Skip/Ignore) */
  fixedCount: number;
  /** Количество нарушений на старте аудита */
  totalBefore: number;
  /** Количество нарушений, оставшихся в файле */
  totalAfter: number;
  /** Длительность сессии в миллисекундах (от первого взаимодействия до финала) */
  durationMs: number;
  /** Имя области, где работали (из ScanResult.scopeLabel) */
  scopeLabel: string;
}

/**
 * Union type всех сообщений, передаваемых между sandbox (code.ts) и UI через postMessage.
 * Каждое сообщение идентифицируется полем type.
 */
export type PluginMessage =
  /** Проверка связи: sandbox → UI или UI → sandbox */
  | { type: 'ping' }
  /** Ответ на ping */
  | { type: 'pong' }
  /** UI запрашивает запуск сканирования */
  | { type: 'start-scan'; data?: { scope?: ScanScope } }
  /** Промежуточный прогресс сканирования: sandbox → UI */
  | { type: 'scan-progress'; data: { current: number; total: number } }
  /** Сканирование завершено, данные готовы: sandbox → UI */
  | { type: 'scan-complete'; data: ScanResult }

  // --- Mode 0: работа с эталонным снепшотом дизайн-системы ---

  /** UI запрашивает у sandbox сохранённый снепшот */
  | { type: 'get-snapshot' }
  /** Sandbox возвращает снепшот (или null если не сохранён) и флаг актуальности */
  | { type: 'snapshot-loaded'; data: { snapshot: ReferenceSnapshot | null; isStale: boolean } }
  /** UI просит sandbox найти все источники дизайн-системы в файле */
  | { type: 'discover-sources' }
  /** Sandbox возвращает список обнаруженных источников */
  | { type: 'ds-sources-found'; data: { sources: SnapshotSource[] } }
  /** UI подтверждает запуск сканирования с выбранными источниками */
  | { type: 'ds-scan-confirmed'; data: { enabledSources: string[] } }
  /** Sandbox сообщает текущий этап сканирования: sandbox → UI */
  | { type: 'ds-scan-progress'; data: { stage: string } }
  /** Sandbox завершил сканирование и возвращает готовый снепшот */
  | { type: 'ds-scan-complete'; data: { snapshot: ReferenceSnapshot } }

  // --- Mode 1: аудит файла ---

  /** Sandbox завершил аудит и возвращает результат с нарушениями */
  | { type: 'detection-complete'; data: DetectionResult }
  /** Sandbox сообщает об ошибке сканирования (например, нет выделения) */
  | { type: 'scan-error'; data: { code: 'no-selection' | 'no-tokens' | 'no-ai-key' } }

  // --- Навигация и маркеры на холсте ---

  /** UI просит sandbox переместить камеру к указанной ноде */
  | { type: 'navigate-to-node'; data: { nodeId: string; pageId: string } }
  /** UI просит sandbox создать маркеры на холсте для переданных нарушений */
  | { type: 'create-markers'; data: { violations: Violation[] } }
  /** UI просит sandbox удалить все маркеры с холста */
  | { type: 'clear-markers' }

  // --- Review & Fix: пошаговое исправление нарушений ---

  /** UI просит sandbox применить токен/стиль к ноде */
  | { type: 'fix-violation'; data: { nodeId: string; tokenId: string; violationType: ViolationType } }
  /** Sandbox отвечает: исправление выполнено или не удалось */
  | { type: 'fix-complete'; data: { nodeId: string; success: boolean } }
  /** UI просит sandbox экспортировать PNG-превью ноды */
  | { type: 'request-preview'; data: { nodeId: string; tag?: 'before' | 'after' } }
  /** Sandbox возвращает PNG как base64 (без префикса data:image/png;base64,); null если экспорт не удался */
  | { type: 'preview-ready'; data: { nodeId: string; pngBase64: string | null; error?: string; tag?: 'before' | 'after' } }
  /** UI сообщает: пользователь нажал Ignore — скрыть нарушение до следующего скана */
  | { type: 'ignore-violation'; data: { violationId: string } }

  // --- API-ключ ---

  /** UI запрашивает API-ключ из clientStorage */
  | { type: 'get-api-key' }
  /** Sandbox возвращает API-ключ (или null если не задан) */
  | { type: 'api-key-response'; data: { key: string | null } }
  /** UI сохраняет API-ключ в clientStorage */
  | { type: 'set-api-key'; data: { key: string } }
  /** Sandbox подтверждает сохранение ключа */
  | { type: 'set-api-key-done' }
  /** UI запрашивает флаг включённости AI */
  | { type: 'get-ai-enabled' }
  /** Sandbox возвращает флаг (по умолчанию true) */
  | { type: 'ai-enabled-response'; data: { enabled: boolean } }
  /** UI сохраняет флаг включённости AI */
  | { type: 'set-ai-enabled'; data: { enabled: boolean } }
  /** Sandbox подтверждает сохранение флага */
  | { type: 'set-ai-enabled-done' }
  /** UI просит sandbox изменить размер окна плагина */
  | { type: 'resize'; data: { width: number; height: number } };
