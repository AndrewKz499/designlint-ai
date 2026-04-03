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
}

/** Обнаруженный источник токенов дизайн-системы в Figma-файле */
export interface SnapshotSource {
  /** Отображаемое имя источника, например "Local Paint Styles" */
  name: string;
  type: 'variables' | 'local-styles';
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
  | { type: 'start-scan' }
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
  | { type: 'ds-scan-complete'; data: { snapshot: ReferenceSnapshot } };
