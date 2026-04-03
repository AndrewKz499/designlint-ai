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
  | { type: 'scan-complete'; data: ScanResult };
