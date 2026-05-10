# Ф.18 — Verification Example Flow

> Дата разведки: 2026-05-10. Lead Architect.
> Источники: 14 скринов в чате PO с Координатором (по описанию), `src/shared/types.ts`, `src/sandbox/{code,scanner,detector,designSystemParser,fixer}.ts`, `src/ui/{App,components/*}.tsx`, snapshot-документы `context/scout/F17-ai-contract-snapshot.md` и `context/scout/F18-state-of-ui-snapshot.md`.
> Контекст: PO решил делать новые макеты сейчас, без релиза v1.0 на старом флоу. Ф.17.12 урезана до двух мини-шагов (search-фильтр сделан, console.log cleanup ждёт). Старая ментальная модель «hex → ближайший токен» заменяется на «эталон в кадре».

---

## 0. Развилки для PO (требуют решения ДО старта Ф.18)

Эти развилки не могу закрыть сам — они меняют объём v1.0/v1.1 либо публичный контракт. Каждая помечена триггером эскалации.

### Развилка R1 — «Fix all»: безопасность массового apply

**Триггер:** влияет на объём v1.0 и на UX-обязательства плагина.

**Контекст:** на скринах PO есть кнопка «Fix all», которая применяет токен ко всем нарушениям из выбранного эталона за один клик. В коде уже есть `handleBulkFix` (`src/ui/App.tsx:187-209`), но он шлёт N независимых `fix-violation` без объединения в одну undo-группу: `figma.commitUndo` вызывается ВНУТРИ обработчика `fix-violation` в sandbox перед каждой мутацией (`src/sandbox/code.ts:261`). Результат — N undo-шагов на N нод, не один.

**Варианты:**
- **R1.A — Bulk-undo:** новый тип `bulk-fix-violation` с массивом, sandbox делает один `figma.commitUndo` перед циклом. Один Cmd+Z откатывает всё.
- **R1.B — Превью + подтверждение:** показать диалог «Apply to N nodes? Preview shows 3/N» → клик подтверждает, дальше как R1.A.
- **R1.C — Оставить как сейчас:** N отдельных undo-шагов, без диалога. Минимальный объём, но непривычный UX.

**Вопрос PO:** какой вариант для v1.0? Bulk-undo (R1.A) обязателен или допустимо C? Превью (R1.B) — must-have или v1.1?

**Моя рекомендация:** R1.A для v1.0 (атомарность undo — обязательная гарантия плагина). R1.B — в v1.1.

---

### Развилка R2 — Множественные эталоны: arbitration

**Триггер:** меняет объём v1.0/v1.1 и алгоритм детектора.

**Контекст:** на скринах кнопка «Добавить пример» — поддержка нескольких эталонов одновременно. Если эталон A говорит «синий = Blue/9», эталон B говорит «синий = Brand/Primary», какой выигрывает.

**Варианты:**
- **R2.A — Один эталон в v1.0, множественные в v1.1.** UI показывает кнопку «+», но в v1.0 она disabled с тултипом «Coming soon».
- **R2.B — Объединение по union (multiple sources of truth):** все токены из всех эталонов попадают в кандидаты. При конфликте — берём ближайший к hex текущей ноды. Простой, но не решает «Brand/Primary vs Blue/9».
- **R2.C — Приоритет по порядку добавления:** первый эталон выигрывает, второй дополняет недостающие категории. Прозрачно для юзера, но требует UI «перетащить чтобы изменить приоритет».
- **R2.D — Per-violation выбор источника:** в search-секции токены из эталона A и эталона B показаны как две группы.

**Вопрос PO:** v1.0 — один эталон или несколько?

**Моя рекомендация:** R2.A. Множественные эталоны — отдельная история (R2.B/C/D — материал для v1.1 после фидбэка).

---

### Развилка R3 — Старый флоу: feature-flag или удаление

**Триггер:** меняет публичный контракт plugin storage и объём миграции.

**Контекст:** PO ранее ответил «полностью отключается». В коде сейчас `Home` управляет `tokenSource: TokenSource` и `tokenPolicy: TokenPolicy`, в `clientStorage` сохраняется `selectedSource` (`{ type: 'local' } | { type: 'library'; libraryKey }`). При полном отключении: `tokenSource`/`tokenPolicy` уходят, `selectedSource` остаётся (нужен для импорта токенов из библиотеки), но смысл меняется — он больше не «scope аудита», а «пул токенов, из которого тянем имена для эталона».

**Варианты:**
- **R3.A — Полное удаление:** `Home` переписывается с нуля, `currentView='mode0'` уходит, заменяется на `currentView='example'`. `tokenSource`/`tokenPolicy` удаляются из всех типов и кода. **Один атомарный коммит ломает миграцию** — у юзеров с persisted state «Local + variables + semantic-only» новый флоу запросит выбрать эталон.
- **R3.B — Feature-flag в plugin manifest:** скрытый ключ `useExampleMode` в `clientStorage`. Можно переключаться между двумя флоу. Удваивает QA-нагрузку.
- **R3.C — Удаление, но с миграцией snapshot:** старый `ReferenceSnapshot` (575 токенов) переиспользуется как «pool of tokens for example matching». Имя коллекции остаётся.

**Вопрос PO:** R3.A (полное удаление) подтверждается? Готовы потерять старый флоу одним коммитом, без отката?

**Моя рекомендация:** R3.C — удаляем флоу, но snapshot/`selectedSource` оставляем как «token pool». Новый эталон + старый pool = меньше кода удалить, новый детектор имеет полный список имён токенов для матчинга по varId.

---

### Развилка R4 — Темы Light/Dark в v1.0

**Триггер:** меняет объём v1.0 и контракт `Token`.

**Контекст:** PO ранее зафиксировал «AI должен учитывать тёмную и светлую темы». 575 color-токенов в JSON у PO имеют **одинаковые varId, разные hex** в Light/Dark — это семантические темо-зависимые переменные через Figma Variables (`valuesByMode`). В текущем коде `variableToToken` (`src/sandbox/designSystemParser.ts:255-273`) берёт **первый mode** через `Object.values(variable.valuesByMode)[0]` — это значит, что Token хранит hex одной темы и не знает о второй.

**Plugin API подтверждение** (проверено по `node_modules/@figma/plugin-typings/plugin-api.d.ts`):
- `node.resolvedVariableModes` (строка 5738) — собрание `{collectionId: modeId}` на узле, наследуется от родителя.
- `Variable.resolveForConsumer(node)` (строки 10296+) — корректно резолвит variable на конкретном узле с учётом всей цепочки mode/alias.
- `collection.modes[].modeId` — список доступных тем коллекции.
- В коде `valuesByMode` уже используется (parser строки 231/255/277) — но без учёта consumer-узла, значит «тема эталона» нигде не считывается.

**В Plugin API доступ к теме узла есть.** Гипотеза подтверждена — отдельный шаг разведки Plugin API не нужен.

**Варианты:**
- **R4.A — Темы в v1.0:** при выборе эталона sandbox читает `resolvedVariableModes` узла → запоминает {collectionId: modeId} как «тема эталона» → при детекте использует `variable.resolveForConsumer(exampleNode)` для каждого токена. Token расширяется полем `valuesByMode: { [modeId: string]: string }` или новое сообщение `resolveTokenInExampleContext`.
- **R4.B — Темы в v1.1:** v1.0 берёт первый mode (как сейчас), warning «Detected dark theme — light recommendations may apply». В v1.1 — полная поддержка.
- **R4.C — Только Light в v1.0:** документируем «v1.0 supports light theme only», в Settings — пока без выбора. В v1.1 — multi-theme.

**Вопрос PO:** v1.0 — с темами (R4.A) или без (R4.B/C)?

**Моя рекомендация:** R4.A. Без тем «эталон в кадре» теряет половину ценности — юзер выбрал dark-фрейм, плагин советует светлые токены. Технически дорого (расширение Token + новый шаг детектора), но «эталон» как фича без этого недоделан.

---

### Развилка R5 — Library styles hint (Ф.17.9): остаётся или решается эталоном

**Триггер:** влияет на объём v1.0.

**Контекст:** Ф.17.9 ввела LIBRARY_HINT в `ReportView.tsx:23` — Plugin API в library-режиме отдаёт только Variables, не Styles. Юзер в library-режиме не видит paint Styles в search.

В новой ментальной модели «эталон в кадре» юзер выбирает фрейм/компонент, sandbox разбирает его palette напрямую через `node.fills`/`node.fillStyleId` — **без зависимости от teamLibrary API**. Если ноды эталона привязаны к library Styles (а не Variables), их `fillStyleId` известен runtime, имя стиля — через `figma.getStyleByIdAsync(styleId)`. Library Styles становятся доступны без teamLibrary API.

**Варианты:**
- **R5.A — Hint удаляется в Ф.18:** в новом флоу проблема не возникает, library styles достаются через эталон. v1.0 публикуется без warning.
- **R5.B — Hint остаётся как fallback:** если эталон не выбран, search показывает hint. Не теряем UX-страховку.

**Вопрос PO:** удаляем LIBRARY_HINT и сценарий «search без эталона»?

**Моя рекомендация:** R5.A. В новом флоу search без эталона не существует — у нас один экран VerificationExample, и без эталона нет аудита.

---

### Развилка R6 — Code Connect components ошибка (на скрине PO)

**Триггер:** меняет требования к эталону. Влияет на объём v1.0.

**Контекст:** на скрине PO видна ошибка про «Code Connect components». В Plugin API `importComponentByKeyAsync` (типы строки 1580-1582) и `importComponentSetByKeyAsync` (строки 1584-1586) — работают **только для опубликованных компонентов**. Если юзер выбрал эталоном неопубликованный COMPONENT (просто local component), эталон будет работать (через `figma.currentPage.selection`), но **library matching через teamLibrary не подцепится** — components-as-tokens нельзя импортировать.

**Варианты:**
- **R6.A — Эталон только из опубликованных компонентов:** требуем published. Если selection — local component, ошибка «Publish this component to use as example».
- **R6.B — Эталон из любого узла, включая неопубликованные:** разбираем `node.fills` напрямую без teamLibrary. Имена токенов из эталона + любые другие токены из подключённых библиотек идут в pool.
- **R6.C — Эталон только из FRAME/SECTION:** не COMPONENT/INSTANCE, а просто Frame с примером. Тогда вопрос published не возникает.

**Вопрос PO:** что значит ошибка «Code Connect» на скрине? Это требование к эталону (R6.A) или просто warning, что компонент не code-connected?

**Моя рекомендация:** Не могу решить без скриншота. PO нужно прислать скрин этой ошибки и контекст: при каком действии она появилась.

---

### Развилка R7 — Multi-page и Code Connect

**Триггер:** влияет на UX и тех. долг.

**Контекст:** в текущем коде `figma.currentPage.selection` (sandbox/code.ts:30, scanner.ts:276). При выборе эталона на странице A и сканировании страницы B — текущая модель не знает, что delegated. Также если эталон и сканируемые узлы лежат в РАЗНЫХ страницах с РАЗНЫМИ `resolvedVariableModes`.

**Варианты:**
- **R7.A — Эталон и аудит на одной странице:** заблокировать смену страницы между выбором эталона и сканом.
- **R7.B — Эталон по nodeId глобально:** хранить `exampleNodeId` + `examplePageId`. При сканировании sandbox через `figma.getNodeByIdAsync(exampleNodeId)` достаёт узел и его resolvedVariableModes — независимо от текущей страницы.

**Вопрос PO:** v1.0 — эталон и аудит на одной странице (R7.A) или глобально (R7.B)?

**Моя рекомендация:** R7.B (глобально). Технически просто — node id переживает page switch. UX — естественнее.

---

### Сводка развилок

| ID | Тема | Моя рекомендация | Объём при моей рекомендации |
|---|---|---|---|
| R1 | Fix all undo-группа | R1.A bulk-undo | M |
| R2 | Множественные эталоны | R2.A v1.1 | XS (disabled-кнопка) |
| R3 | Старый флоу | R3.C удаляем флоу, snapshot живёт | M |
| R4 | Темы Light/Dark | R4.A v1.0 | L |
| R5 | LIBRARY_HINT | R5.A удаляем | XS |
| R6 | Code Connect ошибка | требуется скрин | ? |
| R7 | Глобальный эталон по id | R7.B | S |

**До получения ответов PO Ф.18 не стартует.** Минимум R3, R4, R6 блокируют составление шагов.

---

## 1. Концепция Ф.18 в одном абзаце

Юзер выбирает на холсте эталонный фрейм, компонент или layout, плагин читает `node.fills` / `node.textStyleId` / `node.fontSize` всех потомков и собирает **palette эталона** — набор `{tokenName, varId | styleId, hexInExampleTheme}`. Дальше при сканировании выделения детектор сравнивает текущие значения нод **не с полным `snapshot.tokens`** (как в Ф.17), а с **palette эталона**: «синяя плашка примера = Blue/9 → найди все плашки скана с похожим синим, предложи Blue/9». `componentTokenIndex` (Ф.17.4) переиспользуется в обратную сторону — теперь это **palette одного эталона**, а не «все токены всех компонентов». Старая логика hex-расстояния по полному snapshot становится **fallback второго уровня** (если hex ноды не похож ни на один токен эталона), но в v1.0 fallback может быть выключен (R3 — финальное решение PO). AI prompt получает не просто `componentName` + 20 имён, а **целевой токен эталона** и просит объяснить «почему этот hex стоит привязать к этому токену в контексте этой темы».

---

## 2. Полный список новых/изменённых экранов

> Состояние машины меняется. Текущая ось `View = 'mode0' | 'scanner' | 'review' | 'settings'` расширяется новым state `'example'`. После решений R3 и R7 — финализируется.

### Экран E1 — Главный экран (Library content / Source of truth / Token policy)

- **State:** `currentView = 'home'` (бывший `'mode0'`).
- **Компонент:** `Home.tsx` — переписывается. Текущий код Home сохраняет radio Connected/Local + Source of truth (Variables/Styles/Both) + Token policy (All/Semantic).
- **Что на экране:** три раздела (по описанию PO): «Library content», «Source of truth», «Token policy». Кнопка «Continue» вместо текущего «Scan». При R3.C блок Source of truth/Token policy остаётся, но смысл меняется — это «pool of tokens for matching».
- **Зависит от:** `discover-sources` (есть), `selectedSource` в `clientStorage` (есть). Новых протокольных сообщений не нужно.
- **Расхождение с текущим кодом:** в `Home.tsx` сейчас 5 секций (Library content, Source of truth, Token policy, scanning step, ready step). После Ф.18 — 3 секции, scanning/ready переезжают в E2.

### Экран E2 — Verification example: выбор эталона (табы Selection / Section / Component / Layout)

- **State:** новый `currentView = 'example'`. Заменяет `currentView = 'scanner'` (status='idle').
- **Компонент:** новый `VerificationExample.tsx`.
- **Что на экране:** 4 таба-радио (или Tabs из дизайн-системы — пока такого компонента нет). По выбору таба меняется prompt:
  - **Selection** — «Select reference frame in Figma and click Parse». При пустом selection — disabled с подсказкой.
  - **Section** — «Choose a section as reference».
  - **Component** — «Choose a component». Edge case R6.
  - **Layout** — «Use a layout/grid as reference» (нужна расшифровка от PO — что такое Layout в его модели).
- **Чип `Example: Button ✕`** появляется ВВЕРХУ когда эталон уже выбран (перед табами).
- **Зависит от:** новые сообщения `parse-example`, `parse-example-result`. Новые типы `Example`, `ExampleScope`, `ExampleTokens`.
- **Прецедент в коде:** `ReadyToScan.tsx` — компонент с radio для scope-выбора (`page` / `selection` / `section` / `topFrames`). Это структурно близко, но семантика другая (scope = что сканировать), для example — что является эталоном.

### Экран E3 — Парсинг эталона результат (Цвета: N / Шрифты: M)

- **State:** `currentView = 'example'`, sub-step `parsed` (или новое поле `exampleParseStatus`).
- **Компонент:** тот же `VerificationExample.tsx`, режим «эталон распарсен».
- **Что на экране:** список «Цвета: 5» с раскрытием → токены с чек-боксами (включить/исключить из эталона), «Шрифты: 3» аналогично, кнопка «Add another example» (R2 — disabled в v1.0), «Continue».
- **Зависит от:** `parse-example-result` от sandbox.
- **Чип `Example: Button ✕`** — на этом экране показывает имя только что распарсенного.

### Экран E4 — Audit Areas (Dashboard)

- **State:** `currentView = 'scanner'`, status='done'.
- **Компонент:** `Dashboard.tsx` — частично переписывается.
- **Что на экране:** заголовок «Audit areas» + чип `Example: Button ✕` (при выбранном эталоне), категории нарушений с чек-боксами (как сейчас), 3 CTA: «Fix all», «Review one by one», «Rescan».
- **Что меняется vs текущий Dashboard:** добавляется чип эталона в шапку. Кнопка «Fix all» меняет UX — превью + bulk-undo (R1).
- **Зависит от:** `detection-complete` (есть), новый `bulk-fix-violation` (R1.A).

### Экран E5 — Review one by one

- **State:** `currentView = 'review'`.
- **Компонент:** `ReportView.tsx` — переписывается частично.
- **Что меняется:**
  - Чип `Example: Button ✕` в шапке.
  - SelectField (текущий «AI suggestion») меняет источник: secция «From example» (top-N токенов из эталона) + «Search all tokens» (старый pool).
  - AI prompt меняет шаблон: вместо «Component context: X. Tokens used: ...» → «This violation is in context of example «Button». In example, this slot uses token «Brand/Primary» (current theme: Dark). Explain why...».
- **Зависит от:** новый AI prompt template, расширение `Violation` (новое поле `exampleSlot?: { tokenId, tokenName, hexInTheme }`).

### Экран E6 — Done / final

- **State:** `currentView = 'review'`, total === 0 (как сейчас).
- **Компонент:** `Done.tsx` — без изменений.

### Экран E7 — Code Connect ошибка (R6)

- **State:** `currentView = 'example'`, sub-step `parse-error`.
- **Компонент:** `ErrorCard` (есть в коде).
- **Что на экране:** «This component is not published / not code-connected. Publish to use as reference» (точный текст после R6).
- **Зависит от:** новый код ошибки в `parse-example-result.error`.

### Экран E8 — Settings

- **State:** `currentView = 'settings'` — без изменений.

---

## 3. Изменения в данных и типах

### Новые типы (гипотезы — финал после R-ответов)

```ts
// src/shared/types.ts — добавления

export type ExampleScope = 'selection' | 'section' | 'component' | 'layout';

export interface ExampleSlot {
  /** ID ноды-источника внутри эталона (для AI context) */
  sourceNodeId: string;
  /** ID токена эталона: VariableID или Style ID */
  tokenId: string;
  /** Имя токена */
  tokenName: string;
  /** Hex значения в текущей теме эталона (для R4) */
  hexInExampleTheme: string;
  /** Тип слота: 'fill' | 'text-style' | 'spacing' | 'radius' */
  slotKind: 'fill' | 'text-style' | 'spacing' | 'radius';
  /** Категория для группировки в UI (Цвета/Шрифты) */
  category: 'color' | 'typography' | 'spacing' | 'radius';
  /** Юзер исключил этот слот из эталона через чек-бокс */
  excluded: boolean;
}

export interface Example {
  /** ID узла-эталона (живёт между сменой страниц при R7.B) */
  exampleNodeId: string;
  /** Page id для navigateToNode */
  examplePageId: string;
  /** Имя эталона для чипа `Example: Button ✕` */
  name: string;
  /** Scope из табов */
  scope: ExampleScope;
  /** Токены, найденные в эталоне */
  slots: ExampleSlot[];
  /** Тема эталона: { collectionId: modeId } для R4 */
  resolvedVariableModes: { [collectionId: string]: string };
  /** ts создания */
  createdAt: number;
}

// Расширения существующих:
export interface Violation {
  // ...существующие поля
  /** Ф.18: на какой слот эталона ссылается это нарушение, если матчинг состоялся */
  exampleSlot?: { tokenId: string; tokenName: string; hexInTheme: string; slotKind: ExampleSlot['slotKind'] };
}

export interface Token {
  // ...существующие
  /** Ф.18 R4: значения по mode для multi-theme. Заполняется только при R4.A. */
  valuesByMode?: { [modeId: string]: string };
}
```

### Новые `PluginMessage` (UI ↔ sandbox)

```
| { type: 'parse-example'; data: { scope: ExampleScope } }
| { type: 'parse-example-progress'; data: { current: number; total: number } }
| { type: 'parse-example-result'; data: { example: Example | null; error?: 'no-selection' | 'not-published' | 'no-tokens-found' } }
| { type: 'clear-example' }
| { type: 'get-example' }
| { type: 'example-loaded'; data: { example: Example | null } }
| { type: 'bulk-fix-violation'; data: { fixes: Array<{ nodeId: string; tokenId: string; violationType: ViolationType }> } }
| { type: 'bulk-fix-complete'; data: { successCount: number; failedNodeIds: string[] } }
```

**Симметрия catch:** для каждого нового handler в sandbox обязательно отвечать в обе ветки. Это закреплённый принцип.

### Новые методы

- `src/sandbox/exampleParser.ts` (новый файл) — `parseExample(scope, currentSelection): Promise<Example>`. Внутри: рекурсивный обход узла эталона, сбор всех `boundVariableId`, `fillStyleId`, `textStyleId`, `boundVariables.color`. Для каждого получаем `resolveForConsumer(node)` для hex в текущей теме.
- `src/sandbox/detector.ts` — новая функция `runDetectionWithExample(scanResult, snapshot, example): DetectionResult`. Отличается от `runDetection` тем, что candidates берутся **из `example.slots`**, а не из `snapshot.tokens` целиком. Старая `runDetection` остаётся как fallback или удаляется (R3).
- `src/ui/aiClient.ts` — без изменений (контракт `callGemini` стабилен). Меняется только prompt в `ReportView.tsx`.

### `clientStorage`-ключи

- `'example-current'` — новый ключ. Хранит `Example` JSON. Live между запусками плагина.
- `'google-api-key'`, `'ai-enabled'`, `'selected-source'` — без изменений.

### Удаляемое

- При R3.C: `tokenSource` и `tokenPolicy` остаются в коде Home, но детектор их игнорирует. Минимум удалений.
- При R3.A: удаляются полностью из `start-scan`, `runDetection`, `Home`, `App`. Большой объём.

---

## 4. Изменения в логике детектора

**Текущий путь** (`src/sandbox/detector.ts:67-366`):
1. Hardcoded color → violation без рекомендации.
2. Если есть snapshot → ищем exact match (detached_style), потом similar_to_token (delta ≤5), потом топ-5 по манхэттенской дистанции.
3. `pickTopCandidates` (строки 40-57) — component-aware narrowing через `componentTokenIndex`. Fallback на полную палитру при <2 кандидатах.

**Новый путь с эталоном:**
1. Эталон распарсен → `example.slots: ExampleSlot[]` (палитра + типографика + spacing).
2. Hardcoded color на ноде N → ищем в `example.slots` ближайший слот `kind='fill'`. Дистанция считается по hex (как сейчас).
3. **Ранжирование меняется:** не «топ-5 ближайших токенов из всей палитры», а «слоты эталона, отсортированные по дистанции, лимит 5». Если эталон содержит 7 токенов — кандидатов будет ≤7, а не ≤575.
4. **Нет соответствия в эталоне** (дистанция ко всем слотам > порога) → fallback на старую логику hex по полному `snapshot.tokens`. **Решение по fallback — за PO** (R3).
5. `componentTokenIndex` Ф.17.4 удаляется или переиспользуется как «palette эталона» — Map<exampleScopeName, ExampleSlot[]>. Структура проще.

**Темы (R4.A):** при матчинге используется `slot.hexInExampleTheme`, не raw token value. Это позволяет dark эталону советовать dark токены.

**Старая логика:** функция `pickTopCandidates` либо удаляется (если нет fallback), либо остаётся как фоллбэк для случая «эталон есть, но не покрывает категорию» (например, эталон только цвета, а сканируем шрифты).

---

## 5. Темы Light/Dark — Plugin API подтверждение

**Гипотеза подтверждена.** В Plugin API:

- `node.resolvedVariableModes: { [collectionId: string]: string }` — снимок «какая тема активна на узле в его иерархии». Источник: `node_modules/@figma/plugin-typings/plugin-api.d.ts:5738`. Наследуется от родителя.
- `Variable.resolveForConsumer(node)` — корректно резолвит variable c учётом modes ноды-консьюмера. Источник: типы строки 10296-10395.
- `collection.modes: { modeId: string; name: string }[]` — список доступных тем коллекции.

**В коде сейчас:**
- `valuesByMode` используется в `designSystemParser.ts:231/255/277` через `Object.values()[0]` — берётся **первый mode**, не consumer-mode. То есть Token хранит hex одной (произвольной) темы. **Это работает для одно-mode коллекций и ломается для двух-mode.**

**Что надо для R4.A:**
1. В `parse-example` после получения узла-эталона: `const modes = node.resolvedVariableModes` — сохраняем в `Example.resolvedVariableModes`.
2. Для каждого слота с varId: `const variable = await figma.variables.getVariableByIdAsync(slot.tokenId)`; `slot.hexInExampleTheme = variable.resolveForConsumer(exampleNode)` (через rgbToHex). Для Style id — `getStyleByIdAsync(styleId).paints[0].color` (без mode — Style не темо-зависим).
3. При AI prompt — добавить «(theme: <modeName>)» для контекста.

**Объём:** не отдельный шаг разведки — закладывается в `parse-example`/детектор.

---

## 6. Атомарные шаги Ф.18

> Размеры: XS — < 30 строк, один файл. S — 30-100 строк, 1-2 файла. M — 100-250 строк, 3+ файла. L — 250+ или сложная развилка.
> Шаги в порядке исполнения. Зависимости явные.

### Шаг 18.0 — Скаут-уточнение R6 (Code Connect error)

**Цель:** Получить от PO скриншот ошибки про Code Connect и контекст её появления.

**Зачем:** Без этого нельзя сформулировать UX для E7 и решить, требовать published или нет.

**Действие:** `@lead-architect`: запросить у PO через `ask_user_input_v0` точный скриншот + сценарий: какой компонент выбран, какая кнопка нажата, какое сообщение в Figma notify. Или подтвердить, что R6.A (только published) принимается без скриншота.

**Критерий успеха:** Развилка R6 закрыта (R6.A или R6.B или R6.C), есть текст ошибки для `strings.ts`.

**Среда:** Claude Code в терминале.

**Исполнитель:** @lead-architect.

**Размер:** XS (диалог).

**Зависимости:** нет.

**Риск:** PO ответит «не помню, придумай сам» — тогда я выбираю R6.B (либеральный режим, предупреждение в UI).

---

### Шаг 18.1 — Зафиксировать ADR-002 «Verification example flow»

**Цель:** Создать ADR с зафиксированными решениями R1-R7 и принципом «эталон в кадре».

**Зачем:** Без письменной фиксации развилок R3 (полное удаление флоу), R4 (темы) команда забудет через 3 сессии.

**Действие:** `@release-scribe`: создать `context/architecture/adr-002-verification-example-flow.md`. Секции: Контекст (Ф.17 завершена, PO решил перепроектировать), Решение (новая ментальная модель), Альтернативы (отказались от severity-градации, отказались от full-text scanning), Последствия (удаляется tokenSource/tokenPolicy если R3.A), Связанные коммиты (заполняется по мере Ф.18).

**Критерий успеха:** Файл создан, все 7 развилок R1-R7 описаны с решениями PO.

**Среда:** Claude Code в терминале.

**Исполнитель:** @release-scribe → @lead-architect (ревью).

**Размер:** S.

**Зависимости:** R1-R7 закрыты (PO ответил).

**Риск:** ADR пишется до старта кода — есть риск, что в реализации что-то поменяется. Mitigation: блок «Последствия» — обновляется по мере Ф.18.

---

### Шаг 18.2 — Расширить `PluginMessage` под новые сообщения

**Цель:** Добавить в `src/shared/types.ts` типы `Example`, `ExampleSlot`, `ExampleScope` и сообщения `parse-example` / `parse-example-result` / `clear-example` / `get-example` / `example-loaded` / `bulk-fix-violation` / `bulk-fix-complete`.

**Зачем:** Контракт sandbox/UI — единственный источник истины. Все последующие шаги опираются на него.

**Действие:** `@backend`: расширить `src/shared/types.ts`. Не трогать обработчики, только типы. `tsc --noEmit` должен пройти после правки даже без обработчиков (новые msg.type не используются).

**Критерий успеха:** `tsc --noEmit` чисто. Diff в `src/shared/types.ts` ~ +60 строк. Никаких изменений в `src/sandbox/code.ts` и `src/ui/App.tsx` (они продолжают компилироваться, потому что новые типы — добавление, не модификация).

**Среда:** Claude Code в терминале.

**Исполнитель:** @backend → @qa (проверка `tsc --noEmit`).

**Размер:** S.

**Зависимости:** 18.1.

**Риск:** При R3.A (полное удаление tokenSource/tokenPolicy) — типы поломают `Home.tsx`. Mitigation: R3 решён ДО 18.2.

---

### Шаг 18.3 — Создать `src/sandbox/exampleParser.ts` (парсинг эталона)

**Цель:** Sandbox-функция `parseExample(scope: ExampleScope): Promise<Example>` — рекурсивно обходит выбранный узел, собирает все слоты с привязанными токенами.

**Зачем:** Это ядро новой логики — без неё нет «эталона в кадре».

**Действие:** `@backend`: создать новый файл `src/sandbox/exampleParser.ts`. Внутри: получить узел-эталон через `figma.currentPage.selection[0]` (валидация: не пусто, тип SceneNode). Рекурсивно (как `walkNode` в scanner.ts) собрать `boundVariableId` / `fillStyleId` / `textStyleId` / fontSize. Для каждого — резолв в `Token.name` через `getVariableByIdAsync`/`getStyleByIdAsync`. Сохранить `node.resolvedVariableModes`. Вернуть `Example`.

**Критерий успеха:** Файл создан. Юнит-тестируем не можем (нет тестового рантайма Figma). Скриншот: PO выбирает «Button» в Figma, в логе sandbox видна структура `Example` с правильными слотами. Сборка `dist/code.js` Δ ≤ +5 KB.

**Среда:** Claude Code в терминале + Figma desktop (PO для проверки).

**Исполнитель:** @backend → @qa.

**Размер:** M.

**Зависимости:** 18.2.

**Риски:**
- R6 не закрыт → не понятно, как обрабатывать неопубликованные. Mitigation: 18.0 первым.
- `resolveForConsumer` для library variable — может быть медленным. Mitigation: batching как в `buildLibraryTokens` (`designSystemParser.ts:450-472`).

---

### Шаг 18.4 — Handler `parse-example` в sandbox (`src/sandbox/code.ts`)

**Цель:** Добавить обработчик `if (msg.type === 'parse-example')` в `figma.ui.onmessage`. Симметрия catch обязательна.

**Зачем:** UI должен иметь возможность запросить парсинг эталона.

**Действие:** `@backend`: в `src/sandbox/code.ts` добавить handler. try-ветка: `parseExample(scope)` → `figma.ui.postMessage({ type: 'parse-example-result', data: { example } })`. catch-ветка: `figma.ui.postMessage({ type: 'parse-example-result', data: { example: null, error: ... } })`. Симметрия проверена в обе ветки.

**Критерий успеха:** Хендлер добавлен, симметрия в catch. `tsc --noEmit` чисто. Размер `dist/code.js` Δ ≤ +2 KB.

**Среда:** Claude Code в терминале.

**Исполнитель:** @backend → @qa (симметрия).

**Размер:** S.

**Зависимости:** 18.3.

**Риск:** забыть симметрию (прецедент 12.7.4.1). Mitigation: чеклист в `impact-map`.

---

### Шаг 18.5 — Handler `clear-example` + persist в clientStorage

**Цель:** Сохранять/загружать выбранный эталон между запусками плагина.

**Зачем:** PO ожидает, что чип «Example: Button ✕» остаётся после reopen плагина (как `selectedSource`).

**Действие:** `@backend`: добавить handler `parse-example` после успешного парсинга — `await figma.clientStorage.setAsync('example-current', JSON.stringify(example))`. Handler `clear-example` — `await figma.clientStorage.deleteAsync('example-current')`. Handler `get-example` — load + ответ `example-loaded`. Симметрия catch.

**Критерий успеха:** clientStorage работает, ключ `example-current` появляется при выборе эталона, исчезает при clear. Скриншот PO с reopen плагина — чип Example остался.

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @backend → @qa.

**Размер:** S.

**Зависимости:** 18.4.

**Риск:** stale example при удалении узла-эталона из Figma. Mitigation: при `get-example` проверять `figma.getNodeByIdAsync(example.exampleNodeId)` — если null, отдаём `example: null`.

---

### Шаг 18.6 — Создать `src/ui/components/VerificationExample.tsx`

**Цель:** Новый UI-компонент с табами Selection/Section/Component/Layout, кнопкой Parse, отображением списка слотов с чек-боксами.

**Зачем:** Это центральный новый экран Ф.18 (E2/E3 из раздела 2).

**Действие:** `@ui-engineer`: новый файл `src/ui/components/VerificationExample.tsx` (~250 строк). Использует только готовую дизайн-систему (`components/ui/*`): Button, Radio (для табов), Checkbox (для слотов), SelectField, Tag (для чипа Example). Состояние: `example: Example | null`, `parsing: boolean`, `error: string | null`. Отправляет `parse-example` / `clear-example`. Новый компонент Tabs если будет нужен — отдельный шаг (см. 18.6.5).

**Критерий успеха:** Компонент рендерится, табы переключаются, кнопка Parse шлёт сообщение. `tsc --noEmit` чисто. Размер `dist/ui.js` Δ ≤ +15 KB.

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @ui-engineer → @qa.

**Размер:** M.

**Зависимости:** 18.4.

**Риск:** Компонента Tabs нет в дизайн-системе. Mitigation: использовать Radio как табы или добавить Tabs (отдельный шаг 18.6.5). Эскалирую к PO как часть R5+.

---

### Шаг 18.6.5 — (опционально) Tabs-компонент в дизайн-системе

**Цель:** Если PO хочет настоящие Tabs (не Radio), добавить `src/ui/components/ui/Tabs.tsx`.

**Зачем:** Чтобы не писать одноразовый кастомный UI в VerificationExample.

**Действие:** `@ui-engineer`: новый Tabs-компонент по `components/ui/Radio.tsx` стилю.

**Критерий успеха:** Tabs в дизайн-системе, использован в VerificationExample.

**Среда:** Claude Code в терминале.

**Исполнитель:** @ui-engineer.

**Размер:** S.

**Зависимости:** решение PO «Tabs или Radio».

**Эскалация:** PO выбирает между «Radio как в Home для simplicity» и «настоящие Tabs». Я рекомендую Radio (нет нового цвета/компонента в палитре).

---

### Шаг 18.7 — Новый state `currentView='example'` в App.tsx

**Цель:** Добавить новый view-state `'example'` в `App.tsx`, маршрут от Home → example → scanner.

**Зачем:** Переход между экранами должен быть детерминирован.

**Действие:** `@ui-engineer`: в `src/ui/App.tsx` расширить тип `View`. Новая ветка early-return: `if (currentView === 'example') return <VerificationExample ... />`. Переход Home → example: `handleMode0Complete` → `setCurrentView('example')` вместо `'scanner'`. Переход example → scanner: новый handler `handleExampleConfirmed` — `setCurrentView('scanner')`.

**Критерий успеха:** Навигация Home → example → scanner работает. Скриншот трёх экранов. `tsc --noEmit` чисто.

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @ui-engineer → @qa.

**Размер:** S.

**Зависимости:** 18.6.

**Риск:** Старая ветка `currentView='scanner', status='idle'` (с ReadyToScan) — что с ней? При R3.C ReadyToScan уходит, scope-выбор становится частью «aудит выделения»; при R3.B остаётся feature-flag. Mitigation: R3 закрыт ДО шага.

---

### Шаг 18.8 — Чип `Example: Button ✕` в Header

**Цель:** Показывать имя выбранного эталона в шапке всех экранов после E2.

**Зачем:** Юзер должен видеть контекст («сейчас сравниваем со Button»).

**Действие:** `@ui-engineer`: в `src/ui/components/ui/Header.tsx` добавить опциональный prop `chipLabel?: string` + onChipClear. App пробрасывает `example?.name` в Header. Используется готовый `Tag` компонент.

**Критерий успеха:** Чип виден на E4 (Dashboard), E5 (ReportView). По клику на ✕ — `clear-example` → чип исчезает, currentView не меняется (юзер остаётся на dashboard).

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @ui-engineer → @qa.

**Размер:** S.

**Зависимости:** 18.7.

---

### Шаг 18.9 — Новая логика детектора с эталоном

**Цель:** Расширить `runDetection` или создать `runDetectionWithExample(scanResult, snapshot, example)` — кандидаты из `example.slots`.

**Зачем:** Это ядро смены ментальной модели.

**Действие:** `@backend`: в `src/sandbox/detector.ts` новая функция `runDetectionWithExample`. Логика: вместо `pickTopCandidates(scored, scanResult, color.componentName)` — `pickFromExample(rgb, example.slots)`. Сортировка по дистанции к `slot.hexInExampleTheme`. Лимит 5. Fallback на полную палитру — управляется флагом из R3-решения.

**Критерий успеха:** Тесты от @qa: ноды эталона «синяя кнопка» с Brand/Primary; на скане синие нарушения советуют Brand/Primary, не Blue/9 (даже если Blue/9 ближе по hex). `tsc --noEmit` чисто. Размер `dist/code.js` Δ ≤ +3 KB.

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @backend → @qa (тест-матрица 6 типов × 3 ДС × 3 Scope с эталоном).

**Размер:** M.

**Зависимости:** 18.3, 18.4 (parse работает).

**Риск:** Тест-матрица расширяется на 4-ю ось «эталон есть/нет». Mitigation: на v1.0 фиксируем «эталон обязателен» (если R3.A или R3.C принят) — ось схлопывается.

---

### Шаг 18.10 — `start-scan` в sandbox использует example вместо tokenSource/tokenPolicy

**Цель:** Handler `start-scan` в `code.ts:25` после загрузки snapshot загружает example и передаёт его в детектор.

**Зачем:** UI больше не управляет tokenSource/tokenPolicy при R3.C. Детектор работает с эталоном.

**Действие:** `@backend`: в `src/sandbox/code.ts` handler `start-scan` — `loadExample()` после `loadSnapshot()`, вызов `runDetectionWithExample(scanResult, snapshot, example)`. Если example=null — error `'no-example'` или fallback (по R3).

**Критерий успеха:** Скан без выбранного эталона возвращает error. Скан с эталоном — возвращает violations с `exampleSlot`. Скриншот.

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @backend → @qa.

**Размер:** S.

**Зависимости:** 18.5, 18.9.

---

### Шаг 18.11 — Дашборд E4: чип эталона + новые тексты

**Цель:** Чип `Example` в Dashboard.tsx, обновить заголовок «Audit areas vs example «Button»».

**Зачем:** UX-консистентность.

**Действие:** `@ui-engineer`: в `Dashboard.tsx` добавить prop `example: Example | null`, рендер чипа в шапке. Тексты в `src/shared/strings.ts`.

**Критерий успеха:** Скриншот Dashboard с чипом. `tsc --noEmit` чисто.

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @ui-engineer → @qa.

**Размер:** XS.

**Зависимости:** 18.8.

---

### Шаг 18.12 — ReportView E5: AI prompt с эталоном + слоты в SelectField

**Цель:** Изменить AI prompt и source SelectField в `ReportView.tsx` под эталон.

**Зачем:** Это ключевая UX-разница от Ф.17 — AI знает, что мы сравниваем со «Button».

**Действие:** `@ui-engineer`: в `ReportView.tsx` (строки 181-242 — формирование prompt) — добавить ветку `if (example !== null && current.exampleSlot !== undefined) { prompt = ...with example slot... }`. SelectField suggestionOptions — секция «From example» (top-N из example.slots, дедуп с старой suggested). Старая componentContext-логика удаляется (Ф.17.5 → Ф.18).

**Критерий успеха:** AI prompt содержит «In example «Button» this slot uses Brand/Primary». SelectField показывает «From example» как первую секцию. Скриншот.

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @ui-engineer → @qa.

**Размер:** M.

**Зависимости:** 18.9, 18.11.

**Риск:** Регрессия Ф.17.5 (componentContext). Mitigation: тест PO «открыть violation в компоненте» — проверить, что AI знает контекст.

---

### Шаг 18.13 — Bulk-fix с одной undo-группой (R1.A)

**Цель:** Новое сообщение `bulk-fix-violation`, sandbox делает один `figma.commitUndo()` ДО цикла мутаций.

**Зачем:** R1.A. Один Cmd+Z откатывает всё.

**Действие:** `@backend`: новый handler в `code.ts`. UI в `App.handleBulkFix` шлёт один `bulk-fix-violation` с массивом, не N сообщений.

**Критерий успеха:** Cmd+Z после Fix all откатывает все правки одной операцией. Скриншот / видео PO.

**Среда:** Claude Code в терминале + Figma desktop.

**Исполнитель:** @backend → @qa (регрессия Cmd+Z).

**Размер:** S.

**Зависимости:** 18.10.

---

### Шаг 18.14 — Удалить tokenSource / tokenPolicy (если R3.A)

**Цель:** При R3.A — удалить из всех типов и handlers поля `tokenSource`/`tokenPolicy`.

**Зачем:** Чистка legacy.

**Действие:** `@backend` + `@ui-engineer`: удалить из `src/shared/types.ts` (TokenSource/TokenPolicy), из `Home.tsx` (radio Source-of-truth + Token-policy), из `start-scan` data, из `runDetection` сигнатуры.

**Критерий успеха:** `grep -r "TokenSource\|TokenPolicy" src/` пусто. `tsc --noEmit` чисто.

**Среда:** Claude Code в терминале.

**Исполнитель:** @backend + @ui-engineer → @qa.

**Размер:** M.

**Зависимости:** R3 = R3.A. При R3.B/C — шаг отменяется.

---

### Шаг 18.15 — Scout-step: типографика и spacing в эталоне

**Цель:** Перед `parse-example` уточнить, как обрабатываются текстовые ноды и autolayout-spacing в эталоне.

**Зачем:** Скрин PO «Шрифты: 3» — значит эталон даёт типографику. Но в коде сейчас `lineHeight`, `letterSpacing` собираются неполно.

**Действие:** `@lead-architect`: разведка по `node.textStyleId` и autolayout `itemSpacing`/`paddingLeft` etc. Задокументировать в самом 18.3 (закладка).

**Критерий успеха:** В 18.3 включены текст и spacing.

**Среда:** Claude Code в терминале.

**Исполнитель:** @lead-architect.

**Размер:** XS.

**Зависимости:** 18.0.

---

### Шаг 18.16 — Регрессионный QA-прогон

**Цель:** Прогон тест-матрицы 6 типов нарушений × 3 ДС × 3 scope × 2 темы (Light/Dark) на полностью собранной фазе.

**Зачем:** Ф.18 — это разрыв с Ф.17. Регрессия неизбежна.

**Действие:** `@qa`: тест-матрица на ДС-материалах PO. Баг-репорты по `bug-report` skill.

**Критерий успеха:** Все ячейки матрицы пройдены. <3 critical-баг-репортов.

**Среда:** Figma desktop (PO).

**Исполнитель:** @qa (через лог-анализ) + PO (визуальный прогон).

**Размер:** M.

**Зависимости:** 18.1-18.14 завершены.

---

### Шаг 18.17 — Версия + сборка + коммит финальных изменений Ф.18

**Цель:** Поднять версию до v0.18.0 в трёх местах. Финальный билд. Атомарный коммит.

**Зачем:** Релизный ритуал.

**Действие:** `@release-scribe`: `package.json`, `manifest.json`, `aboutVersion` в `strings.ts` → `0.18.0`. `npm run build`. Коммит «feat: verification example flow (Ф.18)».

**Критерий успеха:** `git log -1` показывает v0.18.0. Размеры `dist/*` зафиксированы в отчёте сессии.

**Среда:** Claude Code в терминале.

**Исполнитель:** @release-scribe.

**Размер:** XS.

**Зависимости:** 18.16.

---

## 7. Граф зависимостей шагов

```
18.0 (R6 ответ от PO) ─────┐
                           ▼
18.1 (ADR) ────────► 18.2 (типы) ──┬─► 18.3 (parser) ─► 18.4 (handler parse) ──┬─► 18.5 (persist) ──┐
                                   │                                            │                    │
                                   │                                            └─► 18.9 (detector)──┤
                                   │                                                                 │
                                   └─► 18.6 (UI VerificationExample) ─► 18.7 (App route) ─► 18.8 (chip)
                                                                                                    │
                                                                                                    ▼
                                                              18.10 (start-scan example) ◄──────────┤
                                                                       │                            │
                                                                       ▼                            │
                                                              18.11 (Dashboard chip)                │
                                                                       │                            │
                                                                       ▼                            │
                                                              18.12 (ReportView prompt) ────────────┤
                                                                                                    │
                                                              18.13 (bulk-fix) ─────────────────────┤
                                                                                                    │
                                                              18.14 (cleanup, если R3.A) ───────────┤
                                                                                                    ▼
                                                                                              18.15 → 18.16 → 18.17
```

**Параллельность:**
- 18.3 / 18.4 / 18.5 (sandbox) и 18.6 (UI) — могут идти параллельно после 18.2.
- 18.13 (bulk-fix) и 18.14 (cleanup) — независимы от 18.12.

---

## 8. Сводка по ролям

| Исполнитель | Шаги | Сумма размеров |
|---|---|---|
| `@lead-architect` | 18.0, 18.15 | 2×XS = 0.4 равно XS |
| `@backend` | 18.2 (S), 18.3 (M), 18.4 (S), 18.5 (S), 18.9 (M), 18.10 (S), 18.13 (S), частично 18.14 | 2×M + 5×S ≈ 7×S |
| `@ui-engineer` | 18.6 (M), 18.6.5 (S опц.), 18.7 (S), 18.8 (S), 18.11 (XS), 18.12 (M), частично 18.14 | 2×M + 3×S + 1×XS ≈ 7×S |
| `@qa` | проверки в 18.4-18.13 + 18.16 | 1×M + распределённая нагрузка |
| `@release-scribe` | 18.1 (S), 18.17 (XS) | 1×S + 1×XS |

**Узкое горлышко:** `@backend` и `@ui-engineer` — параллельно тащат по 2×M шага. Если делать последовательно, фаза затягивается. Параллельно — реалистично за 5-7 сессий.

---

## 9. (выше — раздел 0)

---

## 10. Что НЕ делается в Ф.18 (scope-cap)

- **Slot-aware ranking** как отдельная фича — закрывается эталоном (slot = слот эталона). Отдельный шаг не нужен.
- **Theme-aware matching** как отдельная фича — закрывается через `Example.resolvedVariableModes` (R4.A).
- **Любая работа с library-styles, требующая API за пределами Plugin API** (например, listing styles через teamLibrary) — Plugin API не поддерживает (probe в `designSystemParser.ts:127-167` подтверждено). Library styles доступны только через эталон, где их id берётся из `node.fillStyleId`.
- **Pre-release tuning текстов prompt** — после Ф.18 отдельной фазой Ф.19.
- **Изменения в health-check Settings** — стабилен, не трогаем.
- **Severity-градация нарушений** (отложено в v1.1, см. session-report-02).
- **Множественные эталоны** (R2.A — UI стаб, реальная фича в v1.1).
- **Pre-fix preview ноды** (R1.B → v1.1).
- **DTCG-импорт** (v1.1).
- **Submission в Figma Community** — отдельная Ф.20 после Ф.18-Ф.19.

---

## 11. Объём работ в одну строку

**Ф.18 = 17 атомарных шагов (без 18.6.5), из них 4×XS, 8×S, 5×M; распределение @backend / @ui-engineer / @qa / @release-scribe / @lead-architect = 7 / 6 / 1+ / 2 / 2.**

---

## 12. Места, где разведке не хватило данных

1. **R6 (Code Connect ошибка)** — нужен скрин PO с точным текстом ошибки и сценарием появления. Без этого 18.3 и E7 не специфицируются.
2. **Layout-таб** — что такое «Layout» в ментальной модели PO? Auto-layout фрейма? Сетка/grid? Spacing-токены? Нужно описание от PO или скрин экрана с Layout-табом.
3. **«Добавить пример» — точная UX роль кнопки** — disabled-stub в v1.0 (R2.A) или активный multi-source (R2.B/C/D)? Нужно явное «v1.0 = один эталон» от PO.
4. **Текст ошибки про Code Connect components** — в Plugin API такого warning нет нативно. Это plugin-level проверка? Тогда какой критерий «не подходит»? Нужен PO-критерий («компонент не published» / «компонент без code-connect мета-данных» / «локальный компонент»).
5. **Tabs или Radio** — какой UI-примитив для табов Selection/Section/Component/Layout? Если Tabs — нужен новый компонент в дизайн-системе (18.6.5).
6. **Темы при множественных коллекциях** — если эталон лежит в фрейме с двумя независимыми Variable Collections (Brand colors + Theme), `resolvedVariableModes` вернёт два modeId. Какая логика приоритета — берём все или выбираем одну? **Нужен принципиальный ответ PO (R4.A.x)**.
7. **Старый Ready-to-scan** (`ReadyToScan.tsx`, scope-выбор `selection/section/page/topFrames`) — он остаётся в новом флоу или scope = scope эталона? Текущий код имеет ось «scope сканирования» отдельно от ось «эталон» — возможно, осей надо схлопнуть. Нужен ответ PO: «scope аудита фиксирован selection» или «scope выбирается отдельно от эталона».
8. **Прямого доступа к 14 скринам PO нет** — все экраны описаны по тексту чата. Если на каком-то скрине есть детали (форма табов, иконки, hover-state), они не учтены. PO/Координатор должны прислать скрины напрямую, если будут расхождения с текущим планом.
