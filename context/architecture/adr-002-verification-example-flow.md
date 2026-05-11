# ADR-002: Verification example flow — ментальная модель «эталон в кадре»

## Статус
Принято

## Дата
2026-05-10

## Контекст

К концу Ф.17 в DesignLint AI работала ментальная модель «hex → ближайший токен по расстоянию»: детектор брал hex-значение узла-нарушителя и подбирал кандидатов из полного `snapshot.tokens` (575 токенов в типичной ДС у PO) по манхэттенскому расстоянию. Component-aware narrowing (Ф.17.4 — `componentTokenIndex`) и search-фильтр (Ф.17.12) сузили выборку, но не сменили принцип: пользователь не указывал плагину, **на какой именно артефакт ДС нужно равняться** в текущем фрейме.

PO в Figma desktop протестировал v0.17 на собственных макетах и зафиксировал гипотезу: «эталон в кадре» (один эталонный фрейм / секция / компонент / layout, выбранный на холсте) даёт более точные рекомендации, чем матчинг по полной палитре. Контекст пришёл от PO: 14 скринов в чате с Координатором, JSON Light/Dark коллекций токенов, screenshot Token Studio. На основе этого `@lead-architect` собрал общий план Ф.18 (`context/sprints/F18-verification-example-flow-step.md`) c семью развилками R1–R7. PO принял часть решений (R3, R5, R7), R1 и R4 отложены до Ф.18b с решением PO; R6 отложена решением Координатора, не оспорено PO; R2 закрылась производным от R7. Сборка Ф.18a (`context/sprints/F18a-verification-example-step.md`) построена так, чтобы проверить **только саму гипотезу** «эталон помогает выбирать токены лучше полной палитры» на промежуточном alpha-билде, без углубления в темизацию и без удаления legacy-кода.

Этот ADR фиксирует ментальную модель, разделение Ф.18 на под-фазы и решения по семи развилкам — чтобы через 3 сессии команда не забыла, что R3 = «полное удаление флоу», R7 = «один глобальный эталон на файл», R1 и R4 отложены до решения PO в Ф.18b, R6 отложена решением Координатора (не оспорено PO).

## Решение

В DesignLint AI вводится ментальная модель **«эталон в кадре»**: пользователь выбирает на холсте один эталонный узел (фрейм / секцию / компонент / layout), плагин парсит из него palette токенов (color / typography / spacing / radius) и при сканировании выделения использует **слоты эталона как первичный источник кандидатов**, а не полный `snapshot.tokens`. Эталон — глобальный и единственный на файл (R7), хранится в `figma.clientStorage` под ключом `'example-current'`, переживает reopen плагина и смену страницы. Старая модель «hex → ближайший токен по полному snapshot» удаляется полностью (R3) после успеха проверки концепции.

Фаза Ф.18 разделена на две под-фазы:

- **Ф.18a — alpha-проверка концепции.** Эталон без поддержки тем (берётся первый mode коллекции, как в Ф.17 designSystemParser:255). Минимальная правка детектора — boost кандидатов из `example.slots` в `pickTopCandidates`, без полной замены логики. Старый флоу (`Home` с `tokenSource`/`tokenPolicy`, экран `ReadyToScan`) **остаётся в коде** как недостижимая ветка. Промежуточный билд `v0.18.0-alpha` для прохода PO по трём сценариям в Figma desktop. Объём: ~12 атомарных шагов.
- **Ф.18b — темизация, зачистка и финальный cleanup.** Поддержка Light/Dark тем (R4), удаление tokenSource/tokenPolicy/ReadyToScan/search-инфраструктуры/LIBRARY_HINT (R3 + R5), полноценный `runDetectionWithExample` вместо boost, bulk-fix с одной undo-группой (R1), AI-prompt с контекстом эталона, регрессионный QA-прогон тест-матрицы 6×3×3×2. Запускается **только после успеха сценариев Ф.18a**. Финальный релиз `v0.18.0` без `-alpha`.

Кнопка «Add another example» из макетов PO в Ф.18a отображается **disabled с тултипом «Replaces current example. Multi-example coming in v1.1.»** — это UX-решение `@lead-architect` в рамках R7 (один эталон), чтобы не нарушать ментальную модель пользователя до проверки самой гипотезы.

## Альтернативы

### По ментальной модели

**Вариант B (отклонён): Slot-aware ranking без эталона.** Расширить `Violation` полем «slot path» (например, `Buttons.Primary.Background.Default`), детектор ранжирует кандидатов по совпадению слот-пути.
- Почему не выбрали: требует разметки слотов в самих токенах ДС или эвристики по именам — у PO в 575-токенной коллекции такой разметки нет, эвристика по name даст ложные срабатывания.

**Вариант C (отклонён): Theme-aware matching без эталона.** Детектор автоматически определяет тему фрейма через `node.resolvedVariableModes` и фильтрует кандидатов по этой теме.
- Почему не выбрали: решает только проблему «light vs dark», не решает проблему «Brand/Primary vs Blue/9» (близкие hex в одной теме). Гипотеза «эталон в кадре» закрывает обе проблемы сразу.

### По разделению Ф.18

**Вариант B (отклонён): сделать всю Ф.18 одним проходом до v0.18.0.** Без alpha-точки, без проверки концепции на промежуточном билде.
- Почему не выбрали: гипотеза эталона не проверена на реальных макетах PO. Если она не подтвердится, придётся откатывать темизацию (R4 — L), удаление legacy (R3 — M), bulk-undo (R1 — M). Цена ошибки слишком высокая. Промежуточный alpha-билд изолирует проверку гипотезы от инвестиций в темизацию.

**Вариант C (отклонён): сделать v0.18.0-alpha с темами сразу.** R4 (темы) делается в Ф.18a, не в Ф.18b.
- Почему не выбрали: усложняет сценарии проверки PO. Если в alpha-билде Brand/Primary не первым кандидатом — непонятно, в чём причина: эталон не работает или тема считается неправильно. Изоляция гипотез — отдельный шаг.

### По семи развилкам

См. раздел «Семь развилок R1–R7» ниже.

## Семь развилок R1–R7

### R1 — Fix-all: безопасность массового apply

**Контекст:** на скринах PO кнопка «Fix all» применяет токен ко всем нарушениям одной категории за один клик. В Ф.17 `handleBulkFix` (`src/ui/App.tsx:187-209`) шлёт N независимых `fix-violation`; sandbox делает `figma.commitUndo` перед каждой мутацией → N undo-шагов на N нод, не один.

**Варианты:**
- **R1.A — Bulk-undo:** новый `bulk-fix-violation` с массивом, sandbox делает один `figma.commitUndo` перед циклом. Один Cmd+Z откатывает всё.
- **R1.B — Превью + подтверждение:** диалог «Apply to N nodes?» → клик подтверждает, дальше как R1.A.
- **R1.C — Оставить как сейчас:** N отдельных undo-шагов, без диалога.

**Статус: отложено в Ф.18b.** Решение примет PO в момент сборки Ф.18b на основе рекомендации `@lead-architect` (рекомендация в `F18-verification-example-flow-step.md`: R1.A для v1.0, R1.B — в v1.1). В Ф.18a bulk-fix остаётся в текущем виде Ф.17 (N независимых undo), это допустимо для alpha-билда.

### R2 — Множественные эталоны: arbitration

**Контекст:** на скринах PO кнопка «Добавить пример» предполагает поддержку нескольких эталонов одновременно. При двух эталонах с разными токенами на близкий hex (Brand/Primary в эталоне A, Blue/9 в эталоне B) возникает arbitration — какой выигрывает.

**Варианты:**
- **R2.A — Один эталон в v1.0, множественные в v1.1.** Кнопка «+» disabled с тултипом «Coming soon».
- **R2.B — Объединение по union.** Все токены из всех эталонов в кандидаты, при конфликте — ближайший к hex.
- **R2.C — Приоритет по порядку добавления.** Первый эталон выигрывает, второй дополняет недостающие категории.
- **R2.D — Per-violation выбор источника.** Search-секция показывает токены каждого эталона как отдельные группы.

**Статус: производное от R7.** При R7 = «один глобальный эталон на файл» (см. ниже) множественные эталоны физически не существуют — конфликта источников нет. Кнопка «Добавить пример» в Ф.18a отображается **disabled с тултипом «Replaces current example. Multi-example coming in v1.1.»**, это эквивалентно R2.A. Полноценный multi-example — материал для v1.1 после фидбэка по v1.0.

### R3 — Старый флоу: feature-flag или удаление

**Контекст:** в Ф.17 `Home` управляет `tokenSource: TokenSource` и `tokenPolicy: TokenPolicy`, в `clientStorage` сохраняется `selectedSource`. При полном переходе на «эталон в кадре» эти поля становятся либо лишними, либо переосмысленными.

**Варианты:**
- **R3.A — Полное удаление.** `Home` переписывается, `currentView='mode0'` уходит, `tokenSource`/`tokenPolicy` удаляются из всех типов и кода. Один атомарный коммит ломает миграцию у юзеров с persisted state.
- **R3.B — Feature-flag в plugin manifest.** Скрытый ключ `useExampleMode` в `clientStorage` для переключения между двумя флоу. Удваивает QA-нагрузку.
- **R3.C — Удаление, но с миграцией snapshot.** Старый `ReferenceSnapshot` переиспользуется как «pool of tokens for example matching». Имя коллекции остаётся.

**Статус: решено R3.A — полное удаление.** Решение PO в чате с Координатором (ход с разбором развилок R3/R5/R7). Старый флоу удаляется полностью. Никакого legacy-режима, никакой галки в Settings. После Ф.18a/b в коде остаётся только новый флоу. В Ф.18a само удаление не делается, оно реализуется в Ф.18b как часть финального cleanup перед v1.0 — старая ветка `currentView='scanner', status='idle'` (ReadyToScan) остаётся в коде как недостижимая, чтобы изолировать проверку гипотезы от объёмной зачистки.

### R4 — Темы Light/Dark в v1.0

**Контекст:** PO ранее зафиксировал «AI должен учитывать тёмную и светлую темы». 575 color-токенов в JSON у PO имеют одинаковые varId, разные hex в Light/Dark — это семантические темо-зависимые переменные через Figma Variables (`valuesByMode`). В коде Ф.17 `variableToToken` (`src/sandbox/designSystemParser.ts:255-273`) берёт первый mode через `Object.values(variable.valuesByMode)[0]` — Token хранит hex одной темы и не знает о второй. Plugin API подтверждает наличие `node.resolvedVariableModes` и `Variable.resolveForConsumer(node)` (`node_modules/@figma/plugin-typings/plugin-api.d.ts:5738, 10296+`).

**Варианты:**
- **R4.A — Темы в v1.0.** При выборе эталона sandbox читает `resolvedVariableModes` узла, использует `variable.resolveForConsumer(exampleNode)` для каждого токена. Token расширяется полем `valuesByMode`.
- **R4.B — Темы в v1.1.** v1.0 берёт первый mode (как Ф.17), warning «Detected dark theme — light recommendations may apply».
- **R4.C — Только Light в v1.0.** Документируем «v1.0 supports light theme only».

**Статус: отложено в Ф.18b.** Решение примет PO после результатов Ф.18a (точка проверки концепции, см. ниже). Рекомендация `@lead-architect`: R4.A для v1.0 — без тем «эталон в кадре» теряет половину ценности (юзер выбрал dark-фрейм, плагин советует светлые токены). В Ф.18a берётся первый mode (как Ф.17), `Token.valuesByMode` не вводится, `Example.resolvedVariableModes` сохраняется в данных, но не используется логикой — это упрощение для проверки гипотезы.

### R5 — Library styles hint и search-инфраструктура

**Контекст:** Ф.17.9 ввела LIBRARY_HINT в `ReportView.tsx:22-23` — Plugin API в library-режиме отдаёт только Variables, не Styles. Search-дропдаун в `SelectField` ищет по всем `snapshot.tokens` с дедупом по `suggestedIds`. В новой модели «эталон в кадре» юзер выбирает фрейм/компонент, sandbox разбирает его palette напрямую через `node.fills` / `node.fillStyleId` — без зависимости от teamLibrary API. Library Styles становятся доступны через эталон, без warning.

**Варианты:**
- **R5.A — Hint удаляется в Ф.18.** В новом флоу проблема не возникает.
- **R5.B — Hint остаётся как fallback.** Если эталон не выбран, search показывает hint.

**Статус: решено R5.A — удалить. Фактическое удаление выполняется в Ф.18b. В Ф.18a search и library hint остаются как есть, без изменений.** Решение PO в чате с Координатором (ход с разбором развилок R3/R5/R7).

### R6 — Code Connect components ошибка

**Контекст:** на одном из скринов PO видна ошибка про «Code Connect components». В Plugin API `importComponentByKeyAsync` и `importComponentSetByKeyAsync` работают только для опубликованных компонентов. Если эталон — local component (не published), library matching через teamLibrary не подцепится. Точный текст ошибки и сценарий её появления у Координатора не зафиксированы.

**Варианты:**
- **R6.A — Эталон только из опубликованных компонентов.**
- **R6.B — Эталон из любого узла, включая неопубликованные.** `node.fills` напрямую без teamLibrary.
- **R6.C — Эталон только из FRAME/SECTION,** не COMPONENT/INSTANCE.

**Статус: R6 отложена в Ф.18b решением Координатора, не оспорено PO. В Ф.18a unpublished components парсятся как обычные. Если в реальном прогоне Ф.18a это вызовет наблюдаемую проблему — поднимаем отдельным шагом, не заранее.** В Ф.18a parser (`exampleParser.ts`) для случая `tokenName === null` подставляет fallback `"Unnamed token (#${hex})"` и логирует warning — этого достаточно для alpha-проверки.

### R7 — Multi-page и глобальный эталон

**Контекст:** в Ф.17 `figma.currentPage.selection` (sandbox/code.ts:30, scanner.ts:276) — модель не знает, что эталон и сканируемые узлы могут быть на разных страницах с разными `resolvedVariableModes`. Также вопрос: что делать, если эталон выбран на странице A, а пользователь сканирует страницу B.

**Варианты:**
- **R7.A — Эталон и аудит на одной странице.** Заблокировать смену страницы между выбором эталона и сканом.
- **R7.B — Эталон по nodeId глобально.** Хранить `exampleNodeId` + `examplePageId`. При сканировании sandbox через `figma.getNodeByIdAsync(exampleNodeId)` достаёт узел независимо от текущей страницы.

**Статус: решено R7.B — один глобальный эталон на файл.** Решение PO в чате с Координатором (ход с разбором развилок R3/R5/R7). Эталон хранится в `figma.clientStorage` под ключом `'example-current'` — это единственный источник истины. Кнопка «Добавить пример» из макетов = «перезаписать текущий эталон», не «добавить второй». R7 закрывает R2 автоматически: при одном эталоне конфликтов источников нет.

## Семантика scope

Уточнения к режимам `ExampleScope`, не вошедшие в исходную формулировку семи развилок.

- **`'selection'` (с шага 18.12).** Парсер обходит **поддерево** выбранного узла, а не только сам узел. Глубина рекурсии ограничена `depth ≤ 5`, общее число обработанных нод — `count ≤ 50`. Это устраняет случай «эталон выбран — слотов 0», когда узел сам по себе не имеет fills/strokes/textStyles, но содержит дочерние ноды с токенами (типичный случай — Frame с детьми).
- **`'selection'` (с шага 18.13).** Каждый собранный `ExampleSlot` получает обязательное поле `role: SlotRole` — семантическую роль, выведенную парсером по `nodeType + paintTarget`. Детектор Multi-slot ranking использует этот role как первичный критерий совпадения нарушения со слотом эталона. Migration legacy-example из clientStorage — через `?? 'unknown'` при чтении.
- **`'section'`** — узел типа `SECTION`. Та же логика поддерева, что и в `'selection'`.
- **`'component'`** — узел типа `COMPONENT/COMPONENT_SET/INSTANCE`. В Ф.18a unpublished components парсятся как обычные (R6 отложена). Если `tokenName === null` — fallback `"Unnamed token (#${hex})"`.
- **`'layout'`** — заглушка, парсинг отложен в Ф.18b. handler возвращает `error: 'no-tokens-found'`.

## Known behaviours

### Known behaviour: uniform cornerRadius применяется как 4 биндинга

Figma Plugin API не предоставляет `'cornerRadius'` как атомарный `VariableBindableNodeField` — биндить переменную можно только к индивидуальным углам (`topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`).

Поведение `fixer.ts` в Ф.18b.1.5: при `ScannedRadius.corner='uniform'` и `field='cornerRadius'` (R2.A в формулировке шага) fixer внутри разворачивает один Fix в **четыре** вызова `setBoundVariable` — один и тот же variable применяется ко всем четырём угловым полям одновременно.

Семантически результат корректен: `node.cornerRadius` getter возвращает значение токена, визуально все 4 угла одинаковые. Но в `node.boundVariables.*` отображается **4 биндинга вместо одного** (по одному на каждый угол).

Принято Product Owner 2026-05-10 как baseline для v1.0. Альтернатива — «UI шлёт 4 отдельных `fix-violation` для uniform» — была отклонена: нарушила бы паттерн «один Fix = одно сообщение» (см. принцип симметрии `PluginMessage` в CLAUDE.md) и усложнила undo (4 шага вместо одного на uniform-фикс).

### Known behaviour: B1 secondary-matcher для spacing-токенов

Введён в Ф.18b.1 (2026-05-11). `ExampleSlot` получает опциональное поле `spacingField: 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom' | 'itemSpacing' | 'counterAxisSpacing' | undefined`. Поле подсказывает `findExampleSlot`, какой именно слот эталона предпочесть для нарушения spacing.

Алгоритм матчинга в три tier'а:
- **Tier 1** — точное совпадение `slotKind === 'spacing' && role === 'spacing' && spacingField === violationField`.
- **Tier 2** — bucket-совпадение через `bucketOf(field)`: paddingLeft/Right попадают в bucket `'padding-horizontal'`, paddingTop/Bottom — в `'padding-vertical'`, itemSpacing/counterAxisSpacing — в `'gap'`. Tier 2 выбирает слот, чей `spacingField` попадает в тот же bucket.
- **Tier 3 (fallback)** — любой слот с `slotKind === 'spacing'` без учёта `spacingField`. Сохраняет backward-compat для snapshot, собранных до Ф.18b.1.

Radius сохраняет унифицированную роль (R-spacing.3.A): для всех четырёх углов и uniform используется единый `slotKind === 'radius'` без secondary-matcher.

Прецедент в коде — Ф.18b.1.4.D1 (2026-05-11): `ExampleSlot.spacingField` в `types.ts`, `pushUniqueSlot` дедуп с учётом `spacingField`, `collectLayoutSlots` пишет `spacingField`, `bucketOf`/`findExampleSlot`/`applyExampleOverride` в `detector.ts`. Тест-кейс в Figma desktop — AltaIDE/ButtonPrimary (`18773:210470`), padding 7×7×13×13 → 12/12/4/4 с корректным подбором `Buttons/hPadding` и `Buttons/Primary/vPadding`.

## Открытые вопросы

Зафиксировано Product Owner после прогона `v0.18.0-alpha` в Figma desktop (сценарии S1-S4) — это **наблюдения для Ф.18b/v1.x**, **не блокеры релиза alpha-билда**. Каждый пункт — кандидат на отдельный шаг или развилку при сборке Ф.18b.

### Q1 — Frame-as-icon detection

Frame с именем «Icon» (или другие icon-frame) попадает в детектор как `role: 'background'` по умолчанию (из-за `nodeType=FRAME`, `paintTarget=fill`). Эвристика по имени узла («содержит ли name подстроку icon/glyph/symbol») отложена в Ф.18b. Это закрывает E3 как known-limitation в Ф.18a.

### Q2 — Дропдаун AI suggestion скрывается при пустых `current.candidates`

В ReportView, если у текущего нарушения `candidates` пуст (нет ни одного matched токена через component-aware narrowing + role-based filter), весь дропдаун со списком токенов **не рендерится**, и пользователь теряет возможность ручного выбора через search. Ожидаемое поведение — показать дропдаун с пустой первичной секцией и доступным search над всеми snapshot.tokens. Кандидат на R-развилку Ф.18b (поведение пустого candidates).

### Q3 — Stroke не сканируется в `scanner.ts`

`scanner.ts` обходит только `node.fills`, не `node.strokes`. Детектор Multi-slot ranking имеет роль `'border'` в `SlotRole`, но без сканирования stroke-нарушений она не используется — слоты эталона с role='border' остаются «висящими». Ф.18b — расширить scanner на stroke-нарушения (Type-Up: новый тип `ScannedStroke` или поле в `ScannedColor`).

### Q4 — Spacing/radius multi-slot отложен — закрыт в Ф.18b.1 (2026-05-10)

`inferRole` для `slotKind` `'spacing'` и `'radius'` всегда возвращает `'unknown'`, потому что нет однозначного маппинга `slotKind → SlotRole` для не-color слотов (spacing — это не background, не text, не border). Multi-slot ranking для spacing/radius — открытый вопрос Ф.18b/v1.x: либо вводим параллельную таксономию ролей для пространственных слотов (`'gap'`, `'padding'`, `'corner-radius'`), либо оставляем для них старое поведение «hex-distance» без role-фильтра.

**Закрыт в Ф.18b.1 (2026-05-10).** Решение PO: для v1.0 оставлено старое поведение «hex/value-distance» без role-фильтра. Реализация fixer для uniform cornerRadius зафиксирована в разделе «Known behaviours» выше (4 биндинга на 4 угла, baseline принят PO 2026-05-10). Параллельная таксономия ролей для пространственных слотов — материал для v1.1.

### Q5 — Vite minify-конфиг (JSDoc не strip в production)

Финальный размер `dist/ui.js` — **697 237 B** (697.24 KB), на ~16 KB больше предварительной оценки PO (~680.9 KB). Возможная причина — добавление многострочных JSDoc-комментариев в Ф.17/Ф.18a/Ф.18.13 (`scanner.ts`, `detector.ts`, `types.ts`, `Header.tsx`, `App.tsx`), которые Vite minify не стрипает по умолчанию. Конкретная задача Ф.18b cleanup (новая, появилась из 18.12): включить `terser` с `format.comments: false` или `legalComments: 'none'` в конфиге, замерить дельту.

### Naming-debt: `pushUniqueSlot.seenIds` → `seenKeys`

Внутри `exampleParser.ts` локальная переменная `seenIds` фактически содержит композитные ключи (не tokenId). Переименование в `seenKeys` — чистка Ф.18b. Не блокер, но в коде висит как «лажа в имени».

## Точка проверки концепции (после Ф.18a, перед Ф.18b)

PO запускает alpha-билд `v0.18.0-alpha` в Figma desktop и проходит три сценария, сравнивая с поведением v0.17 (текущий main). Полное описание сценариев — в `context/sprints/F18a-verification-example-step.md`, раздел 3. Здесь — чеклист, по которому PO решит «продолжать в Ф.18b или останавливать».

- [ ] **Сценарий-1 — «Эталон Button → скан карточки с похожим синим».** При эталоне Button (фон Brand/Primary) скан карточки с hardcoded синим (близок и к Brand/Primary, и к Blue/9) возвращает Brand/Primary первым кандидатом в SelectField, Blue/9 — после. Без эталона поведение Ф.17 не сломано (регрессия baseline-acceptance).
- [ ] **Сценарий-2 — «Эталон Card → AI-объяснение знает имя эталона».** В Ф.18a AI-prompt **не меняется** (изменения prompt отложены в Ф.18b, шаг 18.12) — этот сценарий проверяется визуально на корректность отображения чипа `Example: <имя>` в шапке ReportView и наличие поля `Violation.exampleSlot` в нарушениях. Полная проверка AI-контекста с эталоном — в Ф.18b. Если визуальная проверка покажет, что AI-prompt не покрывает кейс эталона — поднимаем как отдельную развилку при ретроспективе Ф.18a, до старта Ф.18b.
- [ ] **Сценарий-3 — «Эталон сохраняется между запусками плагина».** Чип `Example: <имя> ✕` сразу виден в Header после reopen, повторно парсить не надо. Если узел эталона удалён в Figma — чипа нет, всё в исходном состоянии (через `figma.getNodeByIdAsync`).

**Решение PO после трёх сценариев:**

- Сценарии 1+3 показали отличие в правильную сторону → **продолжаем в Ф.18b** (темизация R4, удаление search/library hint R5, bulk-undo R1, AI-prompt с эталоном — шаг 18.12, удаление tokenSource/tokenPolicy R3 — шаг 18.14).
- Сценарии 1+3 не показали отличия или показали хуже → **останавливаемся**, идём в ретроспективу, переопределяем гипотезу. Ф.18b не запускается.
- Сценарий 3 сломан — это не блокер концепции, но обязательный фикс перед Ф.18b.

## Что НЕ делается в Ф.18a (scope-cap)

Явно отложено в Ф.18b. Источник — `context/sprints/F18a-verification-example-step.md`, раздел 7.

- **Шаг 18.6.5** — Tabs-компонент в дизайн-системе. В Ф.18a используется Radio.
- **Шаг 18.9** — полноценный `runDetectionWithExample` (полная замена `pickTopCandidates`). В Ф.18a — минимальный boost кандидатов из эталона.
- **Шаг 18.12** — ReportView E5: AI-prompt с эталоном + слоты в SelectField. Сценарий-2 в точке проверки концепции в Ф.18a проверяется с текущим Ф.17 prompt — изменения prompt отложены, чтобы изолировать гипотезу «слоты эталона помогают» от гипотезы «AI с эталоном помогает».
- **Шаг 18.13** — Bulk-fix с одной undo-группой (R1.A).
- **Шаг 18.14** — Удаление tokenSource/tokenPolicy (зачистка по R3).
- **Шаг 18.15** — Scout-step типографика и spacing в эталоне.
- **Шаг 18.16** — Регрессионный QA-прогон тест-матрицы 6 типов × 3 ДС × 3 scope × 2 темы.
- **Шаг 18.17** — Финальный релиз v0.18.0 (после Ф.18b).
- **R4 — Темы Light/Dark обязательность.** В Ф.18a берётся первый mode (как Ф.17), `Token.valuesByMode` не вводится. `Example.resolvedVariableModes` сохраняется в данных, но не используется логикой.
- **R5 — Удаление search-инфраструктуры и LIBRARY_HINT.** Search-дропдаун и library hint в Ф.18a не трогаются.
- **Любая темизация Light/Dark** (компонентов плагина или поведения детектора).
- **Pre-release tuning текстов промпта** (Ф.19).
- **R6 — жёсткая проверка published для COMPONENT-таба.** В Ф.18a unpublished components парсятся как обычные узлы.
- **Severity-градация нарушений** (v1.1).
- **Множественные эталоны** (R2 — UI-кнопка disabled с тултипом, реальная фича в v1.1).
- **DTCG-импорт** (v1.1).
- **Submission в Figma Community** (Ф.20).

## Последствия

**Положительные:**
- Гипотеза «эталон в кадре помогает выбирать токены лучше полной палитры» проверяется на изолированном alpha-билде — цена ошибки минимальна.
- Один глобальный эталон на файл (R7) физически устраняет проблему arbitration (R2) — нет конфликта источников.
- Полное удаление старого флоу (R3) после Ф.18b убирает дублирование ментальных моделей в коде (один экран вместо двух флоу).
- Разделение Ф.18a/b изолирует проверку концепции от темизации и зачистки — каждая под-фаза имеет один фокус.

**Отрицательные:**
- В Ф.18a в коде временно сосуществуют старый флоу (`Home` → `ReadyToScan` → `Dashboard`) и новый (`Home` → `VerificationExample` → `Dashboard`), хотя старый недостижим. Растёт `dist/ui.js` на время Ф.18a (приемлемо для alpha, не релиза).
- Сценарий-2 точки проверки в Ф.18a фактически не проверяет AI-контекст с эталоном (prompt не меняется до Ф.18b) — гипотеза «AI с эталоном помогает» проверяется только в Ф.18b.
- Кнопка «Add another example» disabled — это технический долг UX до v1.1, но честнее, чем сломать ментальную модель пользователя при перезаписи без warning.

**Технический долг:**

| Риск | Где митигируется |
|---|---|
| После Ф.18a в коде остаётся dead code (`ReadyToScan`, ветка `currentView='scanner', status='idle'`) до Ф.18b | Ф.18b — шаг 18.14, явно запланирован. |
| В Ф.18a `Example.resolvedVariableModes` сохраняется, но не используется — поле может стать «висящим» если R4 не сделают в Ф.18b | Решение PO по R4 после Ф.18a — обязательное условие старта Ф.18b. |
| Парсинг unpublished components без жёсткой проверки (R6 отложена) — возможна потеря имён library-вар, fallback `"Unnamed token (#${hex})"` | Если в реальном прогоне Ф.18a это даст наблюдаемую проблему — поднимается отдельным шагом. Иначе — в Ф.18b. |
| Кнопка «Add another example» disabled с тултипом — пользователи могут ожидать multi-example уже в v1.0 | Тултип «Multi-example coming in v1.1» делает ожидание явным. |

## Прецеденты

- **Ф.18 общий план** — `context/sprints/F18-verification-example-flow-step.md` (разведка, формулировка R1–R7, рекомендации `@lead-architect`).
- **Ф.18a сборка** — `context/sprints/F18a-verification-example-step.md` (атомарные шаги, точка проверки, scope-cap).
- **F17-ai-contract-snapshot** — `context/scout/F17-ai-contract-snapshot.md` (snapshot AI-контракта Ф.17, от которого отталкивается изменение prompt в Ф.18b).
- **F18-state-of-ui-snapshot** — `context/scout/F18-state-of-ui-snapshot.md` (snapshot UI-кода на момент входа в Ф.18 — какие компоненты живы, какие удалены).
- **Решение PO по R3, R5, R7** — чат PO с Координатором, ход с разбором развилок R3/R5/R7 (без отдельного письменного артефакта; зафиксировано здесь и в `F18a-verification-example-step.md` раздел 1).
- **Решение Координатора по R6 (отложить в Ф.18b), не оспорено PO** — отмена scout-шага R6 в Ф.18a; решение в зоне ответственности Координатора, PO не возражал.
- **ADR-001** — `context/architecture/adr-001-team-consolidation-9-to-5.md` (миграция команды 9→5 — прецедент использования формата ADR в проекте).

## Связанные коммиты

Финальная сборка Ф.18a + Ф.18.13 для `v0.18.0-alpha` собрана за 6 коммитов
(Вариант 2 — атомарное разделение по темам), коммиты в обратном
хронологическом порядке (последний — bump версии):

- `f24c52b` — `chore: bump version to 0.18.0-alpha` (синхронизация
  package.json + aboutVersion в strings.ts; manifest.json не содержит
  поле version по проектному соглашению).
- `7606cea` — `feat(F.18a): UI — verification example flow`
  (VerificationExample экран, App.tsx маршрут, Header chip,
  Dashboard «vs example», SelectField search-dropdown F.17.7
  бонусом, library локализация Ф.16.6.5).
- `e16f66e` — `feat(F.18a+18.13): verification example backend +
  multi-slot ranking` (exampleParser.ts, types Example/ExampleSlot/
  SlotRole, code.ts handlers, detector applyExampleOverride +
  inferViolationRole, scanner nodeType+paintTarget, glossary,
  ADR-002 в исходном виде).
- `de379a1` — `feat(F.17): component-aware AI suggestions + 17.12
  search filter` (markers.ts performance-фикс, aiClient AbortSignal,
  ReportView componentContext + 17.12 фильтр VIOLATION_CATEGORY,
  удаление ReviewFix.tsx и ScanDesignSystem.tsx).
- `1f8cf03` — `chore(F.16.6.5): library sources discovery (single-
  select)` (sourcePreferences.ts, designSystemParser library API,
  manifest teamlibrary permission).
- `b7383c0` — `feat(F.16): redesign Home/Dashboard/Done/ReadyToScan
  + UI primitives` (новые экраны, BackButton/Radio, Button/Tag/
  IconButton/Checkbox обновления, tokens.ts чистка).

Будущие коммиты:

- (TBD) Ф.18b финал — `feat: verification example flow (Ф.18)` —
  `v0.18.0` (после успеха alpha-проверки концепции PO в Figma desktop).
