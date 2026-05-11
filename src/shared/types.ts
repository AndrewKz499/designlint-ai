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
  /** ID переменной, если fill привязан через boundVariables.color. null, если привязки нет или fill — solid color/Style */
  boundVariableId: string | null;
  /** Name of nearest INSTANCE/COMPONENT containing this node (for component-aware AI narrowing in Ф.17). Optional for backward compat with pre-Ф.17 snapshots. */
  componentName?: string;
  /**
   * Ф.18a (шаг 18.13): тип ноды Figma, в которой обнаружен цвет.
   * Используется детектором Multi-slot ranking для классификации `SlotRole`
   * (TEXT → 'text', RECTANGLE/FRAME → 'background' и т.п.).
   */
  nodeType: SceneNode['type'];
  /**
   * Ф.18a (шаг 18.13): где именно в ноде применён цвет — заливка или обводка.
   * Используется детектором Multi-slot ranking для отделения 'border' от
   * 'background' при одинаковом nodeType (например, RECTANGLE с fill vs stroke).
   */
  paintTarget: 'fill' | 'stroke';
}

/** Источник, используемый для аудита — Styles, Variables или оба */
export type TokenSource = 'styles' | 'variables' | 'both';

/** Политика отбора токенов: только семантические (алиасные) или вся библиотека */
export type TokenPolicy = 'semantic-only' | 'all-tokens';

/**
 * Ф.18b (шаг 1.1): найденное значение spacing в Figma-файле.
 * Собирается scanner'ом только для auto-layout фреймов (`layoutMode !== 'NONE'`).
 * Поле `field` различает 6 видов spacing-значений в одной ноде — это позволяет
 * детектору создавать независимые `Violation` для каждого поля
 * (id содержит `field` через `makeViolationId`).
 */
export interface ScannedSpacing {
  /** ID ноды в Figma */
  nodeId: string;
  /** Имя ноды */
  nodeName: string;
  pageId: string;
  pageName: string;
  /** Числовое значение spacing в пикселях */
  value: number;
  /** Какое именно поле auto-layout ноды содержит это значение */
  field:
    | 'paddingLeft'
    | 'paddingRight'
    | 'paddingTop'
    | 'paddingBottom'
    | 'itemSpacing'
    | 'counterAxisSpacing';
  /** ID привязанной variable; null если значение задано напрямую (hardcoded) */
  boundVariableId: string | null;
  /** Name of nearest INSTANCE/COMPONENT containing this node (for component-aware AI narrowing). */
  componentName?: string;
}

/**
 * Ф.18b (шаг 1.1): найденное значение cornerRadius в Figma-файле.
 * Собирается scanner'ом для нод со свойством `cornerRadius`. Если у ноды
 * все четыре угла одинаковы — одна запись с `corner: 'uniform'`. Если
 * `cornerRadius === figma.mixed` — четыре отдельные записи по углам.
 * Фильтр `value > 0` (R7.C) — нули в scanner не записываются.
 */
export interface ScannedRadius {
  /** ID ноды в Figma */
  nodeId: string;
  /** Имя ноды */
  nodeName: string;
  pageId: string;
  pageName: string;
  /** Числовое значение radius в пикселях */
  value: number;
  /** Какой угол описывает запись; 'uniform' — единое значение для всех четырёх углов */
  corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'uniform';
  /** ID привязанной variable; null если значение задано напрямую (hardcoded) */
  boundVariableId: string | null;
  /** Name of nearest INSTANCE/COMPONENT containing this node (for component-aware AI narrowing). */
  componentName?: string;
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
  /** Name of nearest INSTANCE/COMPONENT containing this node (for component-aware AI narrowing in Ф.17). Optional for backward compat with pre-Ф.17 snapshots. */
  componentName?: string;
}

/** Итоговый результат сканирования Figma-файла */
export interface ScanResult {
  colors: ScannedColor[];
  texts: ScannedText[];
  /**
   * Ф.18b (шаг 1.1): найденные spacing-значения. Обязательное поле (R1.A,
   * закрыто PO 2026-05-10): `ScanResult` не сериализуется в `clientStorage`,
   * миграция не требуется, контракт чище. Scanner всегда инициализирует
   * пустым массивом.
   */
  spacings: ScannedSpacing[];
  /**
   * Ф.18b (шаг 1.1): найденные cornerRadius-значения. Обязательное поле (R1.A,
   * закрыто PO 2026-05-10): `ScanResult` не сериализуется в `clientStorage`,
   * миграция не требуется, контракт чище. Scanner всегда инициализирует
   * пустым массивом.
   */
  radii: ScannedRadius[];
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
  /**
   * Ф.17.3: индекс «имя компонента → набор tokenId, реально использованных
   * внутри этого компонента». Собирается scanner'ом за один проход дерева
   * параллельно с walkNode. Используется детектором в Ф.17.4 для component-aware
   * narrowing топ-5 кандидатов и UI в Ф.17.5 для обогащения AI-prompt.
   *
   * Сериализуемый формат (plain object вместо Map<string, Set<string>>) —
   * проходит structuredClone границы sandbox/UI без потерь.
   *
   * Опциональное поле для backward compat: старый ScanResult без него парсится
   * нормально (поле undefined). Узлы без componentContext в индекс не попадают —
   * детектор фоллбэчится на полную палитру.
   */
  componentTokenIndex?: { [componentName: string]: string[] };
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
  /** true если переменная была VARIABLE_ALIAS хотя бы в одном mode. undefined для Styles. */
  isSemantic?: boolean;
  /**
   * Имя библиотеки, из которой импортирован токен (если применимо).
   * Используется AI prompt и потенциально для UI-бейджа в v1.1.
   * undefined для локальных Styles/Variables — backward-compat.
   */
  libraryName?: string;
}

/**
 * Single-select источник токенов для сборки эталонного снепшота.
 * Phase Ф.16.6.5 — пользователь на Home выбирает либо одну подключённую
 * библиотеку (через teamLibrary API), либо локальные variables/styles.
 */
export type SelectedSource =
  | { type: 'local' }
  | { type: 'library'; libraryKey: string };

/** Обнаруженный источник токенов дизайн-системы в Figma-файле */
export interface SnapshotSource {
  /** Отображаемое имя источника, например "Local Paint Styles" */
  name: string;
  type: 'variables' | 'local-styles' | 'library-variables' | 'library-styles';
  /** Категория источника для UI */
  kind: 'paintStyles' | 'textStyles' | 'variables';
  /** Количество токенов в этом источнике */
  tokenCount: number;
  /** Включён ли источник в сканирование (по умолчанию true) */
  enabled: boolean;
  /** Имя библиотеки (только для type: 'library-variables' | 'library-styles') */
  libraryName?: string;
  /** Ключ библиотеки teamLibrary (только для type: 'library-variables' | 'library-styles') */
  libraryKey?: string;
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
  /**
   * Источник, по которому был построен snapshot (Ф.16.6.5).
   * Используется isSnapshotStale() для авто-rebuild при смене selectedSource.
   * undefined у старых snapshot'ов до Ф.16.6.5 → считается stale → rebuild.
   */
  selectedSource?: SelectedSource;
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
  | 'spacing_off_scale'
  /** Ф.18b (шаг 1.1, R-spacing.4): cornerRadius не входит в radius-шкалу снепшота */
  | 'radius_off_scale';

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
  /**
   * Ф.18a (R7): слот эталона, в котором использован тот же токен.
   * Проставляется детектором, если кандидат-победитель совпал со слотом
   * текущего `Example`. UI использует поле для секции «From example»
   * в SelectField и для AI-prompt в Ф.18b. Опционально — для нарушений
   * без выбранного эталона или вне match со слотами поле undefined.
   */
  exampleSlot?: ExampleSlot;
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
  /** Количество нарушений, исправленных через Fix (не Skip/Ignore) */
  fixedCount: number;
  /** Количество нарушений на старте аудита */
  totalBefore: number;
  /** Имя области, где работали (из ScanResult.scopeLabel) */
  scopeLabel: string;
}

// --- Ф.18a: Verification example flow («эталон в кадре», ADR-002) ---

/**
 * Режим выбора эталонного узла на холсте (E2/E3 в макете PO).
 * - 'selection' — текущий `figma.currentPage.selection[0]` (любой SceneNode);
 * - 'section'   — узел типа SECTION;
 * - 'component' — узел типа COMPONENT/COMPONENT_SET/INSTANCE;
 * - 'layout'    — frame с autolayout (в Ф.18a — заглушка, парсинг отложен в Ф.18b).
 */
export type ExampleScope = 'selection' | 'section' | 'component' | 'layout';

/**
 * Один слот эталона — один «использованный токен» в его дереве.
 * Структура минимальна и фиксирована ADR-002 / шагом 18.2:
 * - tokenId / tokenName  — ссылка на токен (Style ID или Variable ID),
 *   tokenName=null невозможен по контракту: parser в Ф.18a подставляет
 *   fallback `"Unnamed token (#${hex})"` для unpublished components (R6).
 * - hexInTheme — резолвленное значение в текущей теме эталона (для color-слотов).
 *   В Ф.18a это первый mode коллекции (как в designSystemParser:255).
 *   В Ф.18b при включении R4 это станет результатом `resolveForConsumer(node)`.
 *   Для не-color slotKind поле содержит сериализованное значение слота
 *   (например, "16" для spacing, "8" для radius, "16/Inter/Bold" для typography).
 * - slotKind  — категория слота, совпадает с `TokenCategory` за вычетом
 *   'effect' (effects не поддерживаются Ф.18a) и с уточнением 'text-style'
 *   (имя соответствует FigmaPaintStyle/TextStyle, не категории токена).
 */
export interface ExampleSlot {
  tokenId: string;
  tokenName: string;
  hexInTheme: string;
  slotKind: 'fill' | 'text-style' | 'spacing' | 'radius';
  /**
   * Ф.18a (шаг 18.13): семантическая роль слота в эталоне (background / text /
   * icon / border / shadow / unknown). Используется детектором Multi-slot ranking
   * для приоритетного матчинга нарушений: цвет на TEXT-ноде матчится со слотами
   * role='text', цвет на stroke — со слотами role='border' и т.д.
   *
   * Обязательное поле в типе — миграция старых example из clientStorage будет
   * в шаге 18.13.5 через `?? 'unknown'` при чтении.
   */
  role: SlotRole;
  /**
   * Для slotKind='spacing': имя поля Figma-нода, к которому токен привязан
   * в эталоне. Используется `findExampleSlot` как secondary-matcher для точности
   * подбора. R-spacing.1-revisit, B1 baseline 2026-05-10. Для color/text/radius — undefined.
   */
  spacingField?: 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom' | 'itemSpacing' | 'counterAxisSpacing';
}

/**
 * Ф.18a (шаг 18.13): семантическая роль слота эталона.
 * Определяется парсером (`src/sandbox/exampleParser.ts`) по типу ноды
 * и paintTarget; используется детектором Multi-slot ranking как
 * приоритетный фильтр кандидатов.
 *
 * 'unknown' — fallback для слотов, чью роль парсер не смог определить
 * однозначно (а также для legacy-example, мигрируемых в 18.13.5).
 */
export type SlotRole =
  | 'background'
  | 'text'
  | 'icon'
  | 'border'
  | 'shadow'
  /** Ф.18b (шаг 1.1, R-spacing.1): единая роль для всех spacing-слотов (paddings + gaps). */
  | 'spacing'
  /** Ф.18b (шаг 1.1, R-spacing.3): единая роль для всех radius-слотов (uniform + угловые). */
  | 'radius'
  | 'unknown';

/**
 * Эталон («Example»), собранный парсером из выбранного на холсте узла.
 *
 * Решения по полям (фиксируется здесь, чтобы будущие шаги Ф.18a/b не гадали):
 * - `id` — стабильный идентификатор записи в clientStorage. В Ф.18a генерируется
 *   как `${exampleNodeId}:${createdAt}`; используется UI как React key и для
 *   будущей multi-example модели (v1.1, R2).
 * - `scope` — режим выбора (см. ExampleScope), нужен UI для отображения чипа
 *   и аналитики «какой режим заходит лучше».
 * - `nodeId` / `pageId` — глобальные ссылки на узел эталона (R7). Sandbox
 *   достаёт узел через `figma.getNodeByIdAsync(nodeId)` независимо от текущей
 *   страницы; при удалении узла handler `get-example` возвращает null и сбрасывает
 *   stale-ключ.
 * - `name` — имя узла, для чипа `Example: <имя> ✕` в Header (шаг 18.8).
 * - `slots` — собранные слоты эталона; основной payload для детектора.
 * - `resolvedVariableModes` — снимок `node.resolvedVariableModes` на момент парсинга.
 *   В Ф.18a НЕ используется логикой (R4 отложена), но сохраняется в данных,
 *   чтобы Ф.18b мог включить темизацию без повторного парсинга. Опционально,
 *   т.к. для нод без variable-привязок Figma возвращает пустой объект.
 * - `createdAt` — `Date.now()` на момент парсинга, для UI-отображения «обновлён …»
 *   и для cache invalidation в будущем.
 *
 * Сериализуется через JSON.stringify в clientStorage (ключ 'example-current').
 */
export interface Example {
  id: string;
  scope: ExampleScope;
  nodeId: string;
  pageId: string;
  name: string;
  slots: ExampleSlot[];
  resolvedVariableModes?: { [collectionId: string]: string };
  createdAt: number;
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
  /**
   * UI запрашивает запуск сканирования.
   *
   * Ф.18a (шаг 18.10): добавлено поле `example`. Если пользователь подтвердил
   * выбор эталона на экране VerificationExample (Confirm) — UI передаёт
   * текущий `Example`, и детектор использует `example.slots` как priority
   * override при подборе `suggestedToken`. Если Skip или эталон не выбран —
   * UI шлёт `null`, детектор работает по старой логике hex-расстояния.
   * Поле опциональное для backward compat — sandbox считает отсутствие
   * эквивалентным `null`.
   */
  | {
      type: 'start-scan';
      data?: {
        scope?: ScanScope;
        tokenSource?: TokenSource;
        tokenPolicy?: TokenPolicy;
        example?: Example | null;
      };
    }
  /** Промежуточный прогресс сканирования: sandbox → UI */
  | { type: 'scan-progress'; data: { current: number; total: number } }
  /** Сканирование завершено, данные готовы: sandbox → UI */
  | { type: 'scan-complete'; data: ScanResult }

  // --- Mode 0: работа с эталонным снепшотом дизайн-системы ---

  /** UI запрашивает у sandbox сохранённый снепшот */
  | { type: 'get-snapshot' }
  /** Sandbox возвращает снепшот (или null если не сохранён) и флаг актуальности */
  | { type: 'snapshot-loaded'; data: { snapshot: ReferenceSnapshot | null; isStale: boolean } }
  /**
   * UI просит sandbox найти все источники дизайн-системы в файле.
   * Phase Ф.16.6.5: ответ — `sources-discovered` (новый формат с library variables).
   * Старый ответ `ds-sources-found` оставлен в типах для backward compat,
   * но обработчик его больше не отправляет.
   */
  | { type: 'discover-sources' }
  /**
   * Sandbox возвращает список обнаруженных источников (новый формат, Ф.16.6.5).
   * libraries — массив подключённых через teamLibrary библиотек.
   * hasLocalStyles / hasLocalVariables — флаги для UI «есть ли локальные источники».
   */
  | {
      type: 'sources-discovered';
      data: {
        libraries: { key: string; name: string; tokenCount: number }[];
        hasLocalStyles: boolean;
        hasLocalVariables: boolean;
      };
    }
  /** UI запрашивает persisted selectedSource (single-select модель Ф.16.6.5) */
  | { type: 'get-selected-source' }
  /** Sandbox возвращает persisted selectedSource (default { type: 'local' } при ошибке/отсутствии) */
  | { type: 'selected-source-loaded'; data: { source: SelectedSource } }
  /** UI просит sandbox сохранить новый selectedSource в clientStorage */
  | { type: 'set-selected-source'; data: { source: SelectedSource } }
  /** Sandbox подтверждает сохранение (success) или сообщает об ошибке (error) */
  | { type: 'set-selected-source-done'; data: { success: boolean; error?: string } }
  /**
   * Sandbox уведомляет UI о потере доступа к выбранной библиотеке.
   * Одностороннее сообщение: UI обновляет state radio на Local, без ответа sandbox.
   */
  | { type: 'library-unavailable'; data: { libraryName: string; libraryKey: string } }
  /**
   * @deprecated с Ф.16.6.5 — заменено на `sources-discovered` с другой структурой.
   * Оставлено в типах ради backward compat пока UI не мигрирует (Трек B).
   */
  | { type: 'ds-sources-found'; data: { sources: SnapshotSource[] } }
  /**
   * UI подтверждает запуск сканирования.
   * Ф.16.6.5: `enabledSources` опционален — sandbox читает persisted selectedSource
   * как single source of truth и игнорирует это поле.
   */
  | { type: 'ds-scan-confirmed'; data: { enabledSources?: string[] } }
  /**
   * Sandbox сообщает прогресс сборки snapshot.
   * Ф.16.6.5: новый формат `{ current, total }` для batch-импорта library variables.
   * Поле `stage` — старое поле, оставлено обязательным для backward compat пока
   * UI не мигрировал в Треке B. Sandbox шлёт пустую строку, если этап не имеет имени.
   */
  | { type: 'ds-scan-progress'; data: { current: number; total: number; stage: string } }
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
  | {
      type: 'fix-violation';
      data: {
        nodeId: string;
        tokenId: string;
        violationType: ViolationType;
        /**
         * Имя поля для spacing/radius нарушений (paddingLeft, itemSpacing,
         * cornerRadius, topLeftRadius, ...). Извлекается UI из violationId
         * и передаётся в fixer. R2.A baseline Ф.18b.1 от 2026-05-10.
         */
        field?: string;
      };
    }
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

  // --- Ф.18a: Verification example flow («эталон в кадре», ADR-002) ---

  /**
   * UI запускает парсинг эталона из текущего selection.
   * scope — режим выбора (E2/E3 макета). В Ф.18a 'layout' возвращает ошибку
   * 'no-tokens-found' (заглушка, см. шаг 18.6).
   */
  | { type: 'parse-example'; data: { scope: ExampleScope } }
  /**
   * Sandbox шлёт промежуточный прогресс рекурсивного обхода узла.
   * `current` / `total` — обработанные / ожидаемые ноды; UI рисует Spinner.
   */
  | { type: 'parse-example-progress'; data: { current: number; total: number } }
  /**
   * Sandbox возвращает результат парсинга. В catch-ветке handler шлёт
   * `example: null` + `error` (см. шаг 18.4 — три кода ошибки).
   * - 'no-selection'    — selection пуст или больше одного узла;
   * - 'not-published'   — узел требует teamLibrary, но недоступен (отложено R6);
   * - 'no-tokens-found' — узел распарсен, но слотов 0 (или scope='layout' в Ф.18a).
   */
  | {
      type: 'parse-example-result';
      data: {
        example: Example | null;
        error?: 'no-selection' | 'not-published' | 'no-tokens-found';
      };
    }
  /**
   * UI просит sandbox удалить текущий эталон (клик по ✕ на чипе или
   * по «Add another example» — UX перезаписи в Ф.18a, см. ADR-002 / R7).
   * Ответ — `example-loaded` с example=null.
   */
  | { type: 'clear-example' }
  /**
   * UI запрашивает persisted example из clientStorage (вызывается при mount App).
   * Sandbox валидирует через `figma.getNodeByIdAsync(nodeId)`: если узел
   * удалён — возвращает null и удаляет stale-ключ.
   */
  | { type: 'get-example' }
  /**
   * Sandbox возвращает текущий example (или null после clear / stale).
   * Используется и как ответ на `get-example`, и как подтверждение `clear-example`.
   */
  | { type: 'example-loaded'; data: { example: Example | null } }

  /** UI просит sandbox изменить размер окна плагина */
  | { type: 'resize'; data: { width: number; height: number } };
