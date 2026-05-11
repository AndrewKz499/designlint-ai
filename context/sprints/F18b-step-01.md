# Ф.18b — Шаг 1: Spacing/radius full pipeline

> Step-документ для первого шага Ф.18b. Собран `@lead-architect`.
> Закрывает Q4 ADR-002 «Spacing/radius multi-slot отложен» в полном объёме (вариант B — full pipeline).

---

## 1. Контекст и цель

Ф.18a + Ф.18.13 в `v0.18.0-alpha` ввели multi-slot ranking для color и typography: `SlotRole` + `inferRole`/`inferViolationRole`/`findExampleSlot`/`applyExampleOverride`. Для spacing и radius эта инфраструктура была пробита частично: `ExampleSlot.slotKind: 'spacing' | 'radius'` поддерживается парсером (`collectLayoutSlots`/`collectRadiusSlots` в `exampleParser.ts`), но детектор не создаёт нарушений типа `spacing_off_scale` (ветки нет в `runDetection`), фиксер не применяет токен (комментарий «не поддаются автоисправлению» в `fixer.ts:73`), `inferRole` для не-color slotKind упирается в default `'unknown'`, а тип `radius_off_scale` отсутствует в `ViolationType` вовсе. Сейчас в snapshot собирается `scales.spacingScale` и `scales.radiusScale`, но ни один путь сканер→детектор→фиксер→UI→AI их не использует.

Этот шаг закрывает Q4 ADR-002 «Открытые вопросы» в полном объёме: pipeline для spacing и radius доходит до того же качества, что и color/typography в Ф.18a+Ф.18.13. PO утвердил по результатам разведки 4 архитектурных решения, которые фиксируются как baseline и НЕ являются развилками внутри шага:

- **R-spacing.1** — единая роль `'spacing'` (не параллельная таксономия `'gap'`/`'padding'`).
- **R-spacing.2** — `ScannedSpacing` расширяется полем `field: 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom' | 'itemSpacing' | 'counterAxisSpacing'`.
- **R-spacing.3** — единая роль `'radius'` (не отдельные роли на 4 угла).
- **R-spacing.4** — новый `ViolationType` `'radius_off_scale'` параллельно `'spacing_off_scale'`, а не общий `'numeric_off_scale'` под флагом.
- **R1** (закрыто PO 2026-05-10) — поля `spacings` и `radii` в `ScanResult` **обязательные** (вариант R1.A): `ScanResult` нигде не сериализуется в `clientStorage`, миграция не требуется, контракт чище.
- **R2** (закрыто PO 2026-05-10) — `PluginMessage.fix-violation` расширяется опциональным полем `field` (вариант R2.A): семантика чище, fixer не зависит от формата `makeViolationId`.
- **R3** (закрыто PO 2026-05-10) — `Violation.currentValue = '14px'`, весь контекст идёт в `message` вида `'paddingLeft 14px does not fit the spacing scale. Nearest: Spacing/M (16px)'` (вариант R3.C): без расширения типа, симметрично color.
- **R4** (закрыто PO 2026-05-10) — `SelectOption` получает поле `secondaryLabel`, рендерится **справа** от label в `SelectField` (вариант R4.B): лучший UX для numeric-токенов, минимум кода.
- **R5** (закрыто PO 2026-05-10) — текущее гибридное поведение сохраняется без правок (вариант R5.C): suggested-секция уже отсортирована по близости, search-секция — алфавит, не множим ветвления.
- **R6** (закрыто PO 2026-05-10) — Q2 наследуется и не закрывается в этом шаге (вариант R6.A): scope шага 1 не расширяется, Q2 закрывается отдельным шагом Ф.18b backlog.
- **R7** (закрыто PO 2026-05-10) — в scanner добавляется фильтр `value > 0` для radius (вариант R7.C): простой workaround, покрывает 95% кейсов, без whitelist типов.

Связь с ADR-002: шаг 1 Ф.18b закрывает Q4 «Открытые вопросы» (раздел `## Открытые вопросы`, пункт Q4). Обновление текста ADR-002 (закрытие Q4 → перенос в раздел «Реализовано») — это работа `@release-scribe` в финале Ф.18b при сборке `v0.18.0`, в этом шаге не делается.

---

## 2. Подшаги

Все подшаги атомарны: каждый = один коммит. Порядок строго phased: backend (типы → scanner → detector → parser → fixer → strings → AI) → UI. Между подшагами зависимости отмечены явно.

### Подшаг 1.1 — Типы: ScannedSpacing/ScannedRadius, ScanResult, ViolationType, SlotRole

**Что сделать:**
- Расширить `SlotRole` значениями `'spacing'` и `'radius'` (R-spacing.1, R-spacing.3 — единая роль каждому slotKind).
- Расширить `ViolationType` значением `'radius_off_scale'` (R-spacing.4).
- Добавить тип `ScannedSpacing { nodeId, nodeName, pageId, pageName, value: number, field: 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom' | 'itemSpacing' | 'counterAxisSpacing', boundVariableId: string | null, componentName?: string }` (R-spacing.2).
- Добавить тип `ScannedRadius { nodeId, nodeName, pageId, pageName, value: number, corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'uniform', boundVariableId: string | null, componentName?: string }`.
- Расширить `ScanResult` полями `spacings: ScannedSpacing[]` и `radii: ScannedRadius[]` **ОБЯЗАТЕЛЬНЫМИ** (без `?`) — R1.A, закрыто PO 2026-05-10. `ScanResult` не сериализуется в `clientStorage`, миграция не требуется.

**Файлы:** `src/shared/types.ts`.

**Ожидаемая дельта code.js:** 0 KB (типы тристрипаются TS-компилятором). Ожидаемая дельта ui.js: 0 KB.

**Acceptance:** Готово, когда `tsc --noEmit` чисто; `grep -rn "ScannedSpacing\|ScannedRadius\|radius_off_scale" src/shared/types.ts` находит новые типы; `git diff` показывает добавление, не правку существующих типов (backward compat для color/typography поломок нет).

**Зависимости:** нет (стартовый подшаг).

**Риски:**
- Поля `spacings` и `radii` в `ScanResult` **ОБЯЗАТЕЛЬНЫЕ** (R1.A, закрыто PO 2026-05-10): без `?`, без `?? []`-фолбэков в детекторе/UI. `@lead-architect` подтвердил — `ScanResult` не сериализуется в `clientStorage`, миграция не нужна. Если случайно при reuse возникнут типовые проблемы — это будет ошибка типов на компиляции, а не runtime.

---

### Подшаг 1.2 — Scanner: walkSpacing и walkRadius

**Что сделать:**
- В `walkNode` (`src/sandbox/scanner.ts`) добавить блок сбора spacings ПОСЛЕ блока fills и ДО блока TEXT.
- Spacing собирается только если `'layoutMode' in node && node.layoutMode !== 'NONE'` (auto-layout фреймы). Поля: `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`, `itemSpacing` (всегда), `counterAxisSpacing` (только если `layoutWrap === 'WRAP'`, иначе поле игнорируется Figma).
- `boundVariableId` берётся из `node.boundVariables?.<field>?.id ?? null`.
- Защита от `figma.mixed`: padding-поля числовые, `figma.mixed` тут не бывает (свойство per-frame, не per-child). Но `itemSpacing` может оказаться mixed теоретически — добавить `typeof value === 'number'` guard.
- Аналогично — блок сбора radii: только если `'cornerRadius' in node`. Если `node.cornerRadius === figma.mixed` — fallback на проверку `topLeftRadius`/`topRightRadius`/`bottomLeftRadius`/`bottomRightRadius` индивидуально с `corner: 'topLeft'|...`. Иначе — один запись с `corner: 'uniform'`.
- В `componentTokenIndex` записывать `boundVariableId` через `recordComponentToken(acc.componentTokenIndex, nextContext, binding)` — чтобы component-aware narrowing работал и на spacing/radius.
- Сбор хардкода: spacing с `boundVariableId === null` тоже записывается, детектор отфильтрует по шкале.

**Файлы:** `src/sandbox/scanner.ts`.

**Ожидаемая дельта code.js:** +1.2…1.8 KB (≈30-50 строк нового JS-кода после минификации с защитами).

**Acceptance:** Готово, когда:
- На тестовом frame с auto-layout `paddingLeft: 16, itemSpacing: 8` после скана `ScanResult.spacings` содержит соответствующие записи.
- На rectangle с `cornerRadius: 12` `ScanResult.radii` содержит запись с `corner: 'uniform'`, `value: 12`.
- На rectangle со смешанным radius `ScanResult.radii` содержит 4 записи `topLeft`/`topRight`/`bottomLeft`/`bottomRight`.
- На нодах без layout-mode и без cornerRadius scanner ничего не добавляет (нет undefined-ловушек).
- `tsc --noEmit` чисто.

**Зависимости:** 1.1 (требует новых типов).

**Риски:**
- `counterAxisSpacing` существует на frame только при `layoutWrap === 'WRAP'`. Без guard scanner добавит запись со значением 0 или undefined. Проверить `'counterAxisSpacing' in node && node.layoutWrap === 'WRAP'`.
- `figma.mixed` на `itemSpacing` маловероятен, но `as unknown as` приведения должны идти через `typeof === 'number'`, не через `as number`.
- Rectangle/Frame с `cornerSmoothing` и `cornerRadius: 0` — не пропускать `value: 0` (это валидное значение, может совпадать с токеном `Radius/None`).

---

### Подшаг 1.3 — Detector: ветки spacing_off_scale и radius_off_scale в runDetection

**Что сделать:**
- В `runDetection` (`src/sandbox/detector.ts`) добавить два новых блока ВНУТРИ `if (snapshot !== null) { ... }`, после блока font-sizes:
  - **Spacing**: для каждой `scanResult.spacings[i]` без `boundVariableId`, если `value !== 0` и `value` не входит в `snapshot.scales.spacingScale` → создать `Violation { type: 'spacing_off_scale', severity: 'info', ... }`. `id` — `makeViolationId(nodeId, type + ':' + field)` (важно: один nodeId может иметь до 6 spacing-нарушений на разных полях, поэтому `field` входит в id).
  - **Radius**: аналогично с `snapshot.scales.radiusScale`, тип `'radius_off_scale'`, id `makeViolationId(nodeId, type + ':' + corner)`.
- Дополнить `slotKindForViolation`: добавить ветку `if (type === 'radius_off_scale') return 'radius';`.
- Дополнить `inferViolationRole`: добавить ветки `if (violation.type === 'spacing_off_scale') return 'spacing';` и `if (violation.type === 'radius_off_scale') return 'radius';` (R-spacing.1 + R-spacing.3 — единая роль каждому типу).
- Добавить топ-N кандидатов из `snapshot.tokens` категории `'spacing'`/`'radius'` (численная дистанция `|value - parseFloat(token.value)|`), аналог `colorTokens`/`textTokens` ветви. Учесть `tokenPolicy === 'semantic-only'` (если для spacing semantic-only релевантно — пропустить токены `isSemantic !== true`).
- `pickTopCandidates` работает unchanged: он принимает `componentName: string | undefined`, индексирует по `componentTokenIndex`. Для spacing scanner проставит `componentName` в `ScannedSpacing` (см. 1.2) — детектор маршрутизирует так же, как для color.
- `applyExampleOverride` УЖЕ умеет работать с slotKind=`'spacing'` (через `slotKindForViolation`) и `'radius'` (через расширение в этом же подшаге); работает без правок, если выше всё прибрано.

**Файлы:** `src/sandbox/detector.ts`.

**Ожидаемая дельта code.js:** +2.0…2.8 KB (две новые ветки с топ-N ранжированием, аналогично текстовой ветви).

**Acceptance:** Готово, когда:
- При `snapshot.scales.spacingScale = [4, 8, 12, 16, 24]` и сканировании frame с `paddingLeft: 14` создаётся одно `Violation` типа `spacing_off_scale`, severity `info`, с топ-5 candidates: `[12, 16, 8, 24, 4]` в порядке близости.
- При сканировании rectangle с `cornerRadius: 7` и `radiusScale = [0, 4, 8, 12]` создаётся `Violation` типа `radius_off_scale`, candidates `[8, 4, 12, 0]`.
- `applyExampleOverride` при выбранном эталоне с `slotKind='radius', role='radius'` переписывает `suggestedToken` на токен из эталона.
- `tsc --noEmit` чисто.
- Color/typography ветки регрессий не имеют (см. регрессионный план §4).

**Зависимости:** 1.1, 1.2.

**Риски:**
- `scales.spacingScale` извлекается в `designSystemParser` из числовых variables. Если коллекция PO не помечает spacing/radius как numeric (а Figma даёт `resolvedType === 'FLOAT'`), шкала может быть пустой → ветка `if (spacingScale.length > 0)` пропустит все нарушения. Это known limitation, не блокер — фолбэк «без шкалы нет нарушений» корректен.
- `value === 0` для spacing — частый случай (нет padding). Не создавать нарушение для `value === 0` — это валидный «нет отступа».

---

### Подшаг 1.4 — Parser: inferRole для slotKind ∈ {'spacing', 'radius'}

**Что сделать:**
- В `inferRole` (`src/sandbox/exampleParser.ts`) добавить две ранние ветки ПОСЛЕ правила 3 и ДО правила 4 (substring-эвристика):
  - `if (slotKind === 'spacing') return 'spacing';`
  - `if (slotKind === 'radius') return 'radius';`
- Это означает: для spacing/radius substring-эвристика по tokenName НЕ применяется. R-spacing.1/R-spacing.3 говорят «единая роль», тогда подстроки `'gap'`/`'padding'` не должны разбивать роль.
- В `pushUniqueSlot` дедуп идёт по `tokenId|slotKind|role` — после правки два slot’а с одинаковым tokenId и slotKind='spacing' (например, `Spacing/M` использован и как padding и как itemSpacing) схлопнутся в один. Это согласуется с R-spacing.1 (единая роль) и желаемой семантикой: один токен в эталоне = один слот.

**Файлы:** `src/sandbox/exampleParser.ts`.

**Ожидаемая дельта code.js:** +0.1…0.2 KB (2 строки).

**Acceptance:** Готово, когда:
- На эталоне frame с padding=16 (привязан к variable `Spacing/M`) и itemSpacing=16 (тот же variable) `Example.slots` содержит **один** слот с `slotKind: 'spacing', role: 'spacing'`.
- На rectangle с cornerRadius=8 (variable `Radius/S`) `Example.slots` содержит слот `slotKind: 'radius', role: 'radius'`.
- Существующий комментарий «правило 6 ... включая slotKind='spacing'|'radius' — multi-slot для них вне scope 18.13» в `inferRole` — отредактировать, чтобы отразить новое поведение.
- `tsc --noEmit` чисто.

**Зависимости:** 1.1.

**Риски:**
- Если ранее в clientStorage сохранён `Example` со слотами `slotKind: 'spacing', role: 'unknown'` — `findExampleSlot` в детекторе теперь будет искать `role: 'spacing'`, fallback на `'unknown'` (graceful через ветку 2 в `findExampleSlot`). Миграция не требуется, но это нужно проверить QA-прогоном (см. §4 регрессия).

---

### Подшаг 1.5 — Fixer: применение spacing-полей и cornerRadius

**Что сделать:**
- В `src/sandbox/fixer.ts` снять блок «Типы nonstandard_font_size и spacing_off_scale не поддаются автоисправлению» (строка 73-74 — закрывающий return false).
- Добавить ветку для `violationType === 'spacing_off_scale'`:
  - `field` приходит явным параметром через `PluginMessage.fix-violation.data.field` (R2.A, закрыто PO 2026-05-10): UI извлекает `field` из `violationId` (формат `nodeId_spacing_off_scale:paddingLeft`) и передаёт явно. Sandbox не парсит id-строку, а читает `data.field` напрямую. Сигнатура `fixViolation` расширяется параметром `field?: string`, симметрия `fix-complete` (включая ветку `catch`) сохраняется.
  - Получить `variable` через `figma.variables.getVariableByIdAsync(tokenId)`.
  - Применить через `node.setBoundVariable(field, variable)` (Figma Plugin API метод для числовых полей; альтернатива — `setBoundVariableForLayoutGrid`/`setBoundVariableForPaint` не подходят, нужен generic `node.setBoundVariable(propertyName, variable)`).
- Аналогично для `'radius_off_scale'`: поле определяет `corner` из id (`uniform` → `cornerRadius`, `topLeft` → `topLeftRadius` и т.д.).
- Защита: если у ноды нет `layoutMode` (для spacing) или нет `cornerRadius`-свойств (для radius) — return false.
- TODO в комментарии: `nonstandard_font_size` всё ещё не поддаётся автофиксу (текстовый стиль не делится на «только размер»), это known limitation v1.0 — комментарий обновить.

**Файлы:** `src/sandbox/fixer.ts`.

**Ожидаемая дельта code.js:** +1.0…1.5 KB.

**Acceptance:** Готово, когда:
- На frame с `paddingLeft: 14`, после `fix-violation` с `tokenId = variable.id` (`Spacing/M`, value=16), `node.paddingLeft === 16` и `node.boundVariables.paddingLeft.id === tokenId`.
- На rectangle с `cornerRadius: 7`, после fix `node.cornerRadius === 8` и `node.boundVariables.cornerRadius.id === tokenId`.
- Cmd+Z откатывает изменение (sandbox делает `figma.commitUndo` ДО мутации — это уже работает в `code.ts`).
- `tsc --noEmit` чисто.

**Зависимости:** 1.1, 1.3.

**Риски:**
- Контракт `PluginMessage.fix-violation.data.field` (R2.A, закрыто): UI обязан извлечь `field` из `violationId` (формат после двоеточия) и передать. Если не передан — fixer для spacing/radius возвращает false с понятной ошибкой; это не «тихий» fail.
- `node.setBoundVariable(propertyName, variable)` — нужно проверить точное имя метода в Plugin API typings (`node_modules/@figma/plugin-typings/plugin-api.d.ts`). Возможно, нужен `figma.variables.setBoundVariableForNode(node, propertyName, variable)` — точное API подскажет `@backend` при реализации, это не развилка, а проверка в момент кодинга.
- Style (не variable) для spacing/radius в Figma не существует — `tokenId.indexOf('VariableID:')` всегда `0`. Если detector случайно подсунет style-id (баг), fixer должен вернуть false с понятным fallback, не падать.

---

### Подшаг 1.6 — Strings: новые ключи для radius_off_scale

**Что сделать:**
- В `src/shared/strings.ts`:
  - `VIOLATION_CATEGORY.radius_off_scale = 'layout'`.
  - `VIOLATION_TITLE.radius_off_scale = 'Off-scale corner radius'`.
  - `VIOLATION_HINT.radius_off_scale = 'Corner radius does not fit the design system scale.'` (формулировка под стилистику `spacing_off_scale`).
- Никаких ключей для AI promt в strings.ts не добавлять — prompt-строка живёт в `ReportView.tsx`/`aiClient.ts` (см. 1.7).

**Файлы:** `src/shared/strings.ts`.

**Ожидаемая дельта code.js:** 0 KB (strings.ts импортируется в UI, не sandbox; minify-strip).
**Ожидаемая дельта ui.js:** +0.15…0.25 KB.

**Acceptance:** Готово, когда `tsc --noEmit` чисто; `grep -rn "radius_off_scale" src/shared/strings.ts` находит 3 записи (CATEGORY, TITLE, HINT); тип `ViolationType` после 1.1 даёт exhaustive check, и `Record<ViolationType, ...>` потребует всех записей.

**Зависимости:** 1.1.

**Риски:** нет (чистая локализация).

---

### Подшаг 1.7 — AI client: расширение prompt для spacing/radius

**Что сделать:**
- В `src/ui/components/ReportView.tsx` блок построения prompt (строки 188-205):
  - `Violation.currentValue = '14px'`, весь контекст лежит в `Violation.message` вида `'paddingLeft 14px does not fit the spacing scale. Nearest: Spacing/M (16px)'` (R3.C, закрыто PO 2026-05-10). Detector формирует message при создании нарушения (см. подшаг 1.3).
  - Добавить третью ветку при `current.type === 'spacing_off_scale' || current.type === 'radius_off_scale'`: prompt формулируется как «`<current.message>` Suggested: `<tokenName>` = `<tokenValue>`. Explain in 1-2 short sentences why this token fits.» AI получает field-контекст напрямую из message, без парсинга `currentValue`.
- `exampleSlot` ветка (строка 256-259) уже добавляет «slot/role», она работает без правок для slotKind=`'spacing'`/`'radius'`.

**Файлы:** `src/ui/components/ReportView.tsx`.

**Ожидаемая дельта code.js:** 0 KB.
**Ожидаемая дельта ui.js:** +0.4…0.7 KB.

**Acceptance:** Готово, когда:
- На нарушении `spacing_off_scale` (например, `paddingLeft: 14` → `Spacing/M` = 16) AI получает prompt: «Value `14` is not on the design system scale; suggested `Spacing/M` = `16`. Explain ...» и возвращает осмысленный текст (≤2 предложения).
- На нарушении `radius_off_scale` AI получает аналогичный prompt.
- Cache-key (строка 180: `current.id + ':' + selectedTokenId`) продолжает работать без правок — id уникален per-violation.

**Зависимости:** 1.1, 1.3, 1.6.

**Риски:** нет (только UI-логика prompt; ошибка в формулировке не ломает функциональность).

---

### Подшаг 1.8 — UI: рендер spacing/radius violations в ReportView + Combobox (numeric)

**Что сделать:**
- `ReportView.tsx`:
  - Текущая логика построения `suggestionOptions` (строки 423-493) уже умеет работать с категорией `'layout'` (filter по `allowedTokenCategories: ['spacing', 'radius']` для layout — строки 463-467).
  - Swatch и formatting numeric-токенов: текущий код `const isColor = t.value.indexOf('#') === 0;` (строка 481) → для spacing/radius isColor=false, swatch не показывается.
  - **Решение по визуализации numeric-токенов (R4.B, закрыто PO 2026-05-10):** в `SelectOption` добавляется опциональное поле `secondaryLabel?: string`, для spacing/radius заполняется значением вида `'16px'`. Рендерится **справа** от основного `label` в `SelectField` с приглушённым цветом (минимум кода — один JSX-узел в шаблоне опции). Для color/typography поле не передаётся, рендер не меняется.
- `SelectField` (`src/ui/components/ui/SelectField.tsx`): добавить рендер `secondaryLabel` справа от label через flex-row (label слева, secondaryLabel справа, между ними `justify-content: space-between` или `margin-left: auto`). Существующая логика `swatch` не трогается; компонент корректно рендерит опции без swatch (опционал в `SelectOption`).
- Категория в `ReportView`: `currentCategory` = `'layout'` для spacing/radius — `CATEGORY_META.layout = { emoji: '📐', label: 'Layout' }` уже есть. Заголовок и пагинация работают без правок.
- Hint в карточке (строка 531: `{VIOLATION_HINT[current.type]} {current.currentValue}`) — для spacing/radius `current.message` содержит весь контекст (R3.C, закрыто): `'paddingLeft 14px does not fit the spacing scale. Nearest: Spacing/M (16px)'`. Заменить отрисовку hint для spacing/radius на `current.message` целиком, либо комбинировать `VIOLATION_HINT[current.type]` + `current.message` в зависимости от итогового UX (на усмотрение `@ui-engineer`, но `field` обязан быть виден пользователю).

**Файлы:** `src/ui/components/ReportView.tsx`, при необходимости `src/ui/components/ui/SelectField.tsx`.

**Ожидаемая дельта ui.js:** +0.8…1.5 KB (включая `secondaryLabel` в `SelectField` по R4.B — +0.2…0.4 KB).

**Acceptance:** Готово, когда:
- Скан фрейма с `paddingLeft: 14` на ДС со spacing-токенами показывает в Dashboard счётчик в категории `Layout`, в ReportView категория `Layout` с counter `1/N`, карточка с hint, отображающим `Violation.message` целиком (включая `paddingLeft 14px`), по R3.C; Combobox с топ-N spacing-токенами, у каждой опции справа `secondaryLabel` вида `'16px'` по R4.B; AI-объяснение.
- Click Fix применяет токен, `next` переходит к следующему spacing/radius/color/text нарушению, exiting flow корректен.
- `tsc --noEmit` чисто, lint чисто.

**Зависимости:** 1.1, 1.3, 1.5, 1.6. (1.7 параллелен 1.8, оба зависят от 1.6.)

**Риски:**
- Визуализация numeric-токенов (R4.B, закрыто): `SelectOption.secondaryLabel` рендерится справа от label, минимум кода в `SelectField`. Если `secondaryLabel` не передан — рендер не меняется (color/typography путь нетронут). Регрессия по color-комбобоксу проверяется в S1-S3 §4.
- Отображение `field` в карточке (R3.C, закрыто): `Violation.message` несёт `'paddingLeft 14px does not fit ...'`. Если detector неверно сформирует message (без `field`) — пользователь увидит «14px» без контекста. Acceptance в §4 (S5, S6) ловит это.

---

## 3. Развилки внутри подшагов (✅ все закрыты PO 2026-05-10)

### R1 — Обязательность полей `spacings`/`radii` в `ScanResult`

**Контекст:** `componentTokenIndex` в `ScanResult` сейчас опциональный (`?`) с комментарием «backward compat: старый ScanResult без него парсится нормально». Аналогично сделать `spacings?: ScannedSpacing[]` и `radii?: ScannedRadius[]`, или сделать обязательными?

**✅ Закрыто PO 2026-05-10. Решение: R1.A — обязательные поля.** `spacings: ScannedSpacing[]` и `radii: ScannedRadius[]` в `ScanResult` без `?`. `@lead-architect` эмпирически проверил: `ScanResult` нигде не сериализуется в `clientStorage` и не переживает между сессиями, поэтому миграция не требуется. Контракт чище, в детекторе/UI не нужны `?? []`-фолбэки.

**Не выбрано:** R1.B (опциональные поля) — отвергнут, так как backward-compat-проблема отсутствует, а стилевая однородность с `componentTokenIndex?` менее ценна, чем чистота контракта.

---

### R2 — Передача `field`/`corner` в fixer

**Контекст:** Текущая сигнатура `fixViolation(nodeId, tokenId, violationType)` не знает, к какому именно полю (`paddingLeft` vs `paddingTop` vs `itemSpacing`) применять токен. Для spacing/radius это критично — один nodeId может иметь до 6 spacing-нарушений и до 4 radius-нарушений одновременно.

**✅ Закрыто PO 2026-05-10. Решение: R2.A — расширить `PluginMessage.fix-violation` полем `field`.** `data: { nodeId, tokenId, violationType, field?: string }`. UI извлекает `field` из `violationId` и передаёт явно; sandbox использует параметр напрямую, не парсит id-строку. Симметрия `fix-complete` (включая ветку `catch`) не страдает.

**Не выбрано:** R2.B (fixer парсит `violationId`) — отвергнут как хрупкий: fixer оказался бы завязан на формат `makeViolationId`, любое изменение схемы id ломало бы автофикс.

---

### R3 — Что в `Violation.currentValue` и `message` для spacing-нарушения

**Контекст:** Для color `currentValue = '#3366CC'`, для font `currentValue = '14px'`. Для spacing нужно отразить как минимум `value` и `field` (какое именно поле нарушает). От этого зависит prompt AI и подпись в карточке UI.

**✅ Закрыто PO 2026-05-10. Решение: R3.C — `currentValue = '14px'`, весь контекст в `message`.** Формат сообщения: `'paddingLeft 14px does not fit the spacing scale. Nearest: Spacing/M (16px)'`. Тип `Violation` не расширяется, UI рендерит `message` целиком в hint карточки, AI читает контекст из `message` через prompt-ветку для spacing/radius (см. подшаг 1.7). Симметрично color-нарушениям, где `message` уже несёт hex + suggested.

**Не выбрано:** R3.A (`currentValue = 'paddingLeft: 14px'`) — split по `:` хрупок, ломается при кастомных полях. R3.B (`Violation.field?: string`) — расширение типа без необходимости, дублирует данные, которые уже извлекаются из `violationId` для протокола (см. R2.A).

---

### R4 — Визуализация numeric-токенов в Combobox (UX)

**Контекст:** Color-токены показываются в Combobox со swatch (цветной квадрат), text-токены — с типографическим preview через label. Spacing/radius — это `value: '16'` или `'8'`. Что показывать рядом с именем токена `Spacing/M`?

**✅ Закрыто PO 2026-05-10. Решение: R4.B — `SelectOption.secondaryLabel`, рендерится справа от label.** В `SelectOption` добавляется опциональное поле `secondaryLabel?: string`, в `SelectField` — рендер справа от основного label (минимум кода: один JSX-узел в шаблоне опции, с отдельным цветовым акцентом). Лучший UX: пользователь сразу видит `Spacing/M` и `16px` без переключения контекста.

**Не выбрано:** R4.A (text-only без secondary) — приемлемо, но требует от пользователя помнить размеры. R4.C (value как badge вместо `'VAR'`) — теряется индикация Variables, и в будущем при появлении Styles для других категорий механизм badge ломается.

---

### R5 — Сортировка spacing/radius токенов в search-секции Combobox

**Контекст:** Color-токены сортируются алфавитно по `name` (строки 475-478 в ReportView). Для spacing/radius алфавит малоосмысленен: `Spacing/L`, `Spacing/M`, `Spacing/S`, `Spacing/XL`, `Spacing/XS` — порядок не отражает числовую близость.

**✅ Закрыто PO 2026-05-10. Решение: R5.C — текущее гибридное поведение, никаких правок.** Suggested-секция уже отсортирована по числовой близости (через `pickTopCandidates` в detector’е), search-секция — алфавит, как для color. Code-path с color не расходится, ветвлений в `ReportView` не добавляется.

**Не выбрано:** R5.A (только алфавит) — функционально совпадает с R5.C, но без учёта suggested-сортировки. R5.B (numeric-only сортировка) — отложено в v1.1 как UX-улучшение, если PO увидит реальные жалобы; в v1.0 расхождение code-path не оправдано.

---

### R6 — Combobox для spacing/radius при пустых candidates (связь с Q2 ADR-002)

**Контекст:** Q2 в ADR-002 — известное ограничение: при пустом `current.candidates` Combobox не рендерится. Для spacing это вероятнее, чем для color: если в ДС нет spacing-токенов в snapshot (что бывает у ДС, где spacing задан только в Styles, не Variables), то детектор не создаст candidates.

**✅ Закрыто PO 2026-05-10. Решение: R6.A — Q2 наследуется, в этом шаге не закрываем.** Spacing/radius наследуют ограничение Q2: при пустых candidates Combobox скрыт, UI показывает только message. Q2 закрывается отдельным шагом Ф.18b backlog (Шаг 5) симметрично для всех категорий, scope шага 1 не расширяется.

**Не выбрано:** R6.B (закрыть Q2 в этом шаге для spacing/radius) — отвергнут, так как создаёт асимметрию: color/typography остались бы с известным ограничением до Шага 5, что путает QA и ломает регрессионный план.

---

### R7 — Учёт радиусов на FRAME-нодах (не только RECTANGLE)

**Контекст:** `cornerRadius` существует на `RECTANGLE`, `FRAME`, `COMPONENT`, `INSTANCE`, `ELLIPSE`, `POLYGON`, `STAR`, `VECTOR`. На некоторых типах (`ELLIPSE`) cornerRadius всегда 0 и не имеет смысла. В подшаге 1.2 предлагалось `'cornerRadius' in node` без фильтра по типу.

**✅ Закрыто PO 2026-05-10. Решение: R7.C — фильтр `value > 0` в scanner.** Scanner не записывает radius со значением 0 (применяется и к `cornerRadius` uniform, и к каждому из четырёх угловых полей). Совместимо с любым типом ноды, не требует whitelist, минимум кода. Цена: нарушения «должен быть привязан к `Radius/None=0`, но не привязан» не фиксируются — приемлемо для v1.0, в v1.1 можно пересмотреть, если PO увидит реальные жалобы.

**Не выбрано:** R7.A (все типы без фильтра) — слишком шумно, ELLIPSE и подобные дают ложные нарушения. R7.B (whitelist `['RECTANGLE', 'FRAME', 'COMPONENT', 'INSTANCE']`) — требует поддержки списка, более хрупко при добавлении новых типов в Figma.

---

## 4. Регрессионный план

### Сценарии Ф.18.13 (S1-S4 из handoff в backlog/ADR-002) — переснять полностью

S1-S4 — это сценарии проверки multi-slot ranking для color, прошедшие в Ф.18.13. Переснимаются на новой сборке, чтобы убедиться: расширение `SlotRole` и `inferRole` (подшаги 1.1 + 1.4) не сломали color/typography ranking.

- **S1 — «Brand button vs Blue/9»:** Эталон Button (Brand/Primary), скан карточки с близким синим. Ожидание: Brand/Primary первым кандидатом. Регрессия — если расширение `SlotRole` сломало findExampleSlot.
- **S2 — «Text-on-shape vs background»:** TextNode с цветом fill, который совпадает с background-токеном эталона. Ожидание: role='text' матчится только с text-слотами эталона, не с background. Регрессия — если inferRole для color стал прокидывать spacing/radius раньше TEXT-ветки.
- **S3 — «Stroke vs fill»:** Rectangle со stroke, цвет stroke близок к border-токену эталона. Ожидание: role='border' матчится только со stroke-слотами эталона. Регрессия — расширение `SlotRole` могло уронить ветку border, если порядок правил inferRole сдвинулся.
- **S4 — «Typography multi-style»:** TextNode без `textStyleId`, fontSize=14. Эталон с двумя text-стилями (Heading/H3, Body/M). Ожидание: ближайший по fontSize, role='text'. Регрессия — если text-style ветка inferRole пострадала.

Acceptance для регрессионного блока: S1-S4 показывают то же поведение, что в Ф.18a alpha-прогоне (PO зафиксировал «эталон работает» по ADR-002 «Точка проверки концепции»).

### Новые сценарии S5-S8 для spacing/radius

- **S5 — «Padding off-scale → spacing-token из эталона»:** Эталон Card с `paddingLeft=16` (привязан к `Spacing/M`). Скан сестринского frame с `paddingLeft=14` (хардкод). Ожидание: создаётся `Violation` `spacing_off_scale`, `suggestedToken = 'Spacing/M'`, `exampleSlot.slotKind='spacing'`, `exampleSlot.role='spacing'`. Click Fix → `paddingLeft=16` + bound to variable. Cmd+Z → откатывается.
- **S6 — «ItemSpacing off-scale + multi-field в одной ноде»:** Frame с `paddingLeft=14, itemSpacing=10`, оба хардкод, эталон с `Spacing/S=8, Spacing/M=16`. Ожидание: два **разных** `Violation` (id: `..._spacing_off_scale:paddingLeft` и `..._spacing_off_scale:itemSpacing`), у каждого свой candidate список и можно фиксить независимо.
- **S7 — «Radius off-scale uniform»:** Rectangle с `cornerRadius=10`, эталон с `Radius/S=8, Radius/M=12`. Ожидание: `Violation` `radius_off_scale` `corner='uniform'`, candidates `[Radius/M, Radius/S]` (близость), Fix меняет `cornerRadius` на 12, привязка к variable.
- **S8 — «Radius mixed corners»:** Rectangle с `topLeftRadius=10, topRightRadius=10, bottomLeftRadius=0, bottomRightRadius=0`. Ожидание: 4 разных `Violation` (по углам), каждое со своим `corner` в id. (Опционально, если QA сочтёт реалистичным.)

Acceptance для новых сценариев: 4 из 4 (S5-S8, кроме S8 — опциональный) показывают ожидаемое поведение.

### Регрессия по существующим типам нарушений

Дополнительная проверка: на ДС без spacing/radius-токенов в snapshot (только color и text styles) скан фрейма со spacing-хардкодом → НЕ создаёт `spacing_off_scale` нарушений (фолбэк `scales.spacingScale.length > 0`). Это страхует pre-Ф.18b пользователей.

---

## 5. Бюджет бандла

Суммарная ожидаемая дельта по подшагам:

| Подшаг | code.js | ui.js |
|---|---|---|
| 1.1 (типы) | 0 | 0 |
| 1.2 (scanner) | +1.2…1.8 | 0 |
| 1.3 (detector) | +2.0…2.8 | 0 |
| 1.4 (parser) | +0.1…0.2 | 0 |
| 1.5 (fixer) | +1.0…1.5 | 0 |
| 1.6 (strings) | 0 | +0.15…0.25 |
| 1.7 (AI prompt) | 0 | +0.4…0.7 |
| 1.8 (UI) | 0 | +0.8…1.5 |
| **Итого (макс)** | **+6.3 KB** | **+2.45 KB** |
| **Итого (мин)** | **+4.3 KB** | **+1.35 KB** |

**Baseline до шага 1 (`v0.18.0-alpha`):**
- `dist/code.js`: 86 063 B (84.0 KB)
- `dist/ui.js`: 697 237 B (680.9 KB)

**После шага 1 (прогноз):**
- `dist/code.js`: 90.3…92.4 KB.
- `dist/ui.js`: 682.3…683.4 KB.

**Влияние закрытых R1-R7 на прогноз:** R4.B (новое поле `secondaryLabel` в `SelectField` + рендер) добавляет +0.2…0.4 KB к ui.js — это уже включено в верхнюю границу диапазона подшага 1.8 (0.8…1.5 KB). R2.A (расширение `PluginMessage.fix-violation` полем `field?: string`) — 0 KB, тип уже структурно есть, добавление опционального поля minify-стрипается. R1.A (обязательность полей в `ScanResult`) — 0 KB, типы тристрипаются TS. R3.C, R5.C, R6.A, R7.C — 0 KB или укладываются в существующие диапазоны подшагов 1.3/1.7/1.8. **Итого: решения R1-R7 находятся в рамках исходного прогноза, пересчёт верхней/нижней границ не требуется.**

### Q5 (JSDoc minify) — может вмешаться в измерения

ADR-002 «Открытые вопросы» Q5 (`F18b-backlog.md` Шаг 7) фиксирует: финальный `dist/ui.js` = 697.24 KB сейчас, ожидание PO было ~680.9 KB. Причина — JSDoc-комментарии не стрипаются Vite minify в production. Если QA-замер показывает рост `ui.js` существенно больше +2.5 KB на этом шаге — это может быть не дефект шага, а просто новый JSDoc в подшагах 1.1-1.8. Замеры на этом шаге должны фиксироваться **до** включения terser (это отдельный шаг Ф.18b Шаг 7). После Q5-фикса прогноз нужно переоценивать с учётом стрипа всех JSDoc-комментариев (потенциальный выигрыш ≥10 KB на ui.js, как зафиксировано в Q5).

### Корректировка после факта 1.2 (2026-05-10)

**Факт подшага 1.2:** `dist/code.js` 86 063 B → 91 003 B, дельта **+4940 B (+4.83 KB)**. Прогноз был +1.2…1.8 KB. Расхождение: **2.7x** относительно верхней границы, **~3.3x** относительно медианы.

**Анализ причины (через чтение `dist/code.js` и `src/sandbox/scanner.ts`):**

- 🟢 **JSDoc-комментарии в новом коде scanner.ts отсутствуют.** Весь новый блок 1.2 (строки 182-306 scanner.ts) содержит только `// …`-комментарии, которые Vite/esbuild стрипает полностью (`grep -c "// " dist/code.js = 0`). Следовательно, **Q5-фикс не объясняет расхождение в 1.2** — комментарии тут не виноваты.
- 🟢 **JSDoc в текущем `dist/code.js` всё равно занимает 22.3 KB (24.5%)** — это унаследованные блоки из старого кода (slot inference, parser, и т.д.). Q5 закроет эту проблему, но **не для будущих подшагов 1.3-1.5**, если в них не появится новый JSDoc.
- 🟢 **Корневая причина расхождения 1.2 — транспиляция современного синтаксиса для sandbox-таргета.** В новом коде 14 `?.` + 7 `??`. Babel разворачивает каждую `?.color?.id ?? null` цепочку в 4-6 строк через `_ref`-переменные. На исходный код 5493 байт получаем 4940 байт в bundle — отношение output/source ≈ 0.9, тогда как для обычной минификации ожидается 0.3-0.5. Подтверждение: grep по `dist/code.js` показывает каждое имя поля (`topLeftRadius`, `paddingLeft`, …) повторяется 2-11 раз, потому что Babel дублирует property name в каждом `_ref`-шаге цепочки.
- 🟡 **Существующие модули sandbox (detector.ts, fixer.ts, exampleParser.ts) `?.`/`??` НЕ используют** — по соглашению. Если в подшагах 1.3-1.5 разработчик следует этой норме, множитель для них будет ниже.

**Пересчёт прогнозов 1.3-1.8 с применённым множителем:**

| Подшаг | Старый прогноз | Множитель | Новый прогноз | Обоснование |
|---|---|---|---|---|
| 1.3 (detector) | +2.0…2.8 KB | 1.8…2.2x | **+3.6…6.2 KB** | Две новые ветки ранжирования + R3.C-шаблон message-строки. `?.`/`??` не использует (норма sandbox), но шаблонные строки `'paddingLeft 14px does not fit...'` дают раздувание per-violation-type. |
| 1.4 (parser) | +0.1…0.2 KB | 1.2…1.5x | **+0.15…0.3 KB** | Две строки `if/return`. Минимальный эффект транспиляции, мизерный фактический рост. |
| 1.5 (fixer) | +1.0…1.5 KB | 1.5…2.0x | **+1.5…3.0 KB** | Два новых блока (spacing + radius), маппинг `corner` → имя поля, парсинг `field` из data, отказ-fallback при отсутствии layoutMode/cornerRadius-свойств. Без `?.`/`??` — но новые условные ветки. |
| 1.6 (strings) | 0 / +0.15…0.25 KB | 1.0…1.5x | **0 / +0.15…0.4 KB** | Три записи в `Record<ViolationType, …>`. Минимальное превышение. |
| 1.7 (AI prompt) | 0 / +0.4…0.7 KB | 1.2…1.8x | **0 / +0.5…1.2 KB** | Третья ветка `if` + шаблонная строка. UI-таргет современнее, чем sandbox, эффект транспиляции меньше. |
| 1.8 (UI) | 0 / +0.8…1.5 KB | 1.5…2.0x | **0 / +1.2…3.0 KB** | R4.B — структурная правка `SelectOption`/`SelectField` + рендер `secondaryLabel`. JSX-узлы в production-бандле дают больше байт, чем кажется по исходнику. |

**Новый прогноз итогов (на baseline alpha):**

| Источник | Старый максимум | Новый максимум | Дельта |
|---|---|---|---|
| code.js (1.2 факт + 1.3-1.5) | +6.3 KB | **+10.1…14.4 KB** | +1.6x…2.3x |
| ui.js (1.6-1.8) | +2.45 KB | **+1.85…4.6 KB** | +0.75x…1.9x |

**Итоговый ожидаемый размер dist после шага 1:**

| Файл | Baseline alpha | Старый прогноз | Новый прогноз | Старый target |
|---|---|---|---|---|
| `dist/code.js` | 86 063 B (84.0 KB) | 90.3…92.4 KB | **96.2…100.5 KB** | 92.4 KB |
| `dist/ui.js` | 697 237 B (680.9 KB) | 682.3…683.4 KB | **682.7…685.4 KB** | 683.4 KB |

**Вывод по target:** старый target `code.js ≤ 92.4 KB` **не выполним** для шага 1 — даже нижняя оценка нового прогноза (96.2 KB) его превышает на +3.8 KB. Для `ui.js` новый прогноз пересекает старый target по верхней границе (685.4 vs 683.4 KB), но это в пределах волатильности замера.

**Новый реалистичный target шага 1 (до Q5-фикса):**
- `dist/code.js`: **≤ 100.5 KB** (хард-лимит); ожидаемое попадание 96…100 KB.
- `dist/ui.js`: **≤ 685.5 KB** (хард-лимит); ожидаемое попадание 682…685 KB.

**Почему этот размер приемлем для alpha-сборки шага 1:**

1. 🟢 Шаг 1 закрывает Q4 ADR-002 в полном объёме — функциональный прирост (spacing+radius full pipeline) даёт +25% к ценностному предложению плагина (4-я и 5-я категории нарушений из 5).
2. 🟢 Q5-фикс (Шаг 7 Ф.18b backlog) на текущем коде даёт потенциальный выигрыш ≥21 KB на `code.js` (по факту JSDoc в bundle = 22.3 KB). После Q5 `code.js` уйдёт ниже 80 KB даже при превышении 100 KB до Q5. Для `ui.js` Q5 даёт ≥10 KB выигрыша (как зафиксировано в `F18b-backlog.md` Шаг 7).
3. 🟢 Figma Plugin manifest не устанавливает жёсткого лимита на размер бандла; ограничение задаётся практической стороной — startup latency. 100 KB → ~5-10 мс парсинга QuickJS, что незаметно.
4. 🟡 Хард-лимит «96 KB code.js» был исторически ориентиром PO от alpha-замера, не submission-требованием.

**Открытые вопросы (требуют решения PO):**

- **OQ-1 (требует решения PO):** Принимаем ли новый target `code.js ≤ 100.5 KB` для шага 1 до выполнения Q5? Альтернатива — передвинуть Q5 (Шаг 7 backlog) в шаг 1 как подшаг 1.9, выполнив его ДО 1.3-1.8 и работая с уже-стрипнутым бандлом. См. оценку 1.9 ниже.
- **OQ-2 (требует решения PO, если принимаем OQ-1):** Допустима ли логика «измеряем до Q5, target смотрим после Q5» — то есть фиксируем `code.js ≤ 100.5 KB` на шаге 1 с пометкой «будет ≤ 80 KB после Шага 7»? Это раздваивает критерий приёмки.

**Опция: ускоренный Q5-фикс как подшаг 1.9**

Если PO выбирает не превышать target 92.4 KB, единственный путь — выполнить Q5 ДО подшагов 1.3-1.8.

- **Размер 1.9: XS** (15-30 минут на реализацию). 
- **Что именно меняется в Vite-конфиге:** в `vite.config.ts` (или `scripts/build.ts`) для bundle `code` и `ui` добавить `esbuild.legalComments: 'none'` и/или `build.minify: 'terser'` с `terserOptions.format.comments: false`. Сейчас, видимо, используется дефолтный esbuild-минификатор, который стрипает `// …`, но оставляет `/** … */`. Переключение на terser или явная конфигурация `legalComments: 'none'` снимет JSDoc целиком.
- **Риски 1.9:** terser медленнее esbuild на ~3-5x (для проекта такого размера — ~1-2 секунды vs 200 мс) — приемлемо. Возможно, придётся проверить, что Terser не ломает строки внутри template-literals (риск низкий, шаблоны в проекте обычные).
- **Эффект на прогноз 1.3-1.8:** новый JSDoc в подшагах 1.3-1.8 (если будет добавлен в `detector.ts`, `fixer.ts`, `ReportView.tsx`) не повлияет на размер. Уже имеющиеся 22.3 KB JSDoc в `code.js` уйдут — `code.js` после 1.9 станет ~70 KB, после 1.3-1.5 (+10.1…14.4 KB) → **80…84 KB**. Это значительно ниже исходного target 92.4 KB.

**Вердикт по 1.9 в формате эскалации:** введение 1.9 — это **изменение объёма шага 1**, эскалация к PO обязательна. Я не закрываю это решение сам. См. OQ-1.

---

## 6. Порядок (phased) и формат финального шага

Backend-перед-UI. Внутри backend: типы → scanner → detector → parser → fixer → strings → AI. Затем UI.

Граф зависимостей:

```
1.1 (типы) ──┬──► 1.2 (scanner) ──┐
             ├──► 1.3 (detector) ─┤ 
             ├──► 1.4 (parser) ───┤
             └──► 1.6 (strings) ──┼──► 1.5 (fixer)  ──┐
                                  ├──► 1.7 (AI)   ────┼──► 1.8 (UI) ──► §4 регрессия
                                  └──► (1.8 ждёт)  ───┘
```

Каждый подшаг — отдельный коммит. PO передаёт исполнителям после закрытия R1-R7 в §3.

---

### Шаг 18b.1 — Spacing/radius full pipeline (формат skill `step-format`)

**Цель:** Закрыть Q4 ADR-002 — провести spacing и radius по полному pipeline (scanner → detector → fixer → UI → AI) в той же глубине, что color и typography в Ф.18a+Ф.18.13.

**Зачем:** В `v0.18.0-alpha` `ExampleSlot.slotKind: 'spacing' | 'radius'` парсится, но не используется детектором: нарушений `spacing_off_scale` runDetection не создаёт (нет ветки), `radius_off_scale` отсутствует в `ViolationType` вовсе, `fixer.ts:73` явно отказывает в автофиксе. Это блокирует ценностное предложение «выбрали эталон — получили рекомендации по всем токенам» для половины категорий (`layout` в `VIOLATION_CATEGORY`). Без этого шага в v1.0 пойдёт обрезанный продукт, где Combobox для spacing-нарушений показывает кандидатов из шкалы, но эталон не работает; UI рисует категорию `Layout`, но автофикс там запрещён.

**Действие:** Восемь атомарных подшагов в порядке 1.1 → 1.8 (см. §2). По одному коммиту каждый. Перед стартом — закрыть развилки R1-R7 (см. §3) через `ask_user_input_v0` к PO. `@backend` делает 1.1-1.6, `@ui-engineer` — 1.7-1.8 (1.7 — это правка `ReportView.tsx`, формально в зоне `@ui-engineer`, не `aiClient.ts` — последний остаётся неизменным). После всех подшагов — `@qa` прогоняет регрессию S1-S4 + новые S5-S8 (§4).

**Критерий успеха:** Скрины S5-S7 в Figma desktop соответствуют acceptance из §4. `tsc --noEmit` чисто на каждом подшаге. Размеры `dist/code.js` и `dist/ui.js` укладываются в прогноз §5 (с учётом Q5). Регрессия S1-S4 не показывает отличий от Ф.18a alpha-baseline. Команда `grep -rn "spacing_off_scale\|radius_off_scale" src/` находит ветки во всех 5 слоях: types, scanner, detector, fixer, strings, ReportView, aiClient (последние два — для radius_off_scale).

**Среда:** Claude Code в терминале для подшагов 1.1-1.8 (правки и `tsc`); Figma desktop для §4 регрессии (только PO/`@qa` с Figma MCP).

**Исполнитель:** @backend (1.1-1.6) → @ui-engineer (1.7-1.8) → @qa (§4 регрессия)

---

## История решений

### 2026-05-09 — baseline R-spacing.1…R-spacing.4

Зафиксированы по итогам разведки `@lead-architect` (см. §1 «Контекст и цель») и утверждены PO до старта шага. Не являются развилками внутри шага, цитируются в подшагах как обязательный контракт.

- **R-spacing.1** — единая роль `'spacing'` (не параллельная таксономия `'gap'`/`'padding'`).
- **R-spacing.2** — `ScannedSpacing` расширяется полем `field` с фиксированным enum из 6 значений.
- **R-spacing.3** — единая роль `'radius'` (не отдельные роли на 4 угла).
- **R-spacing.4** — новый `ViolationType` `'radius_off_scale'`, не общий `'numeric_off_scale'`.

### 2026-05-10 — закрытие R1…R7 (PO)

PO закрыл все семь развилок одним решением. Принятые варианты и краткое обоснование (полный контекст и trade-offs — в §3):

- **R1 → R1.A** — поля `spacings` и `radii` в `ScanResult` обязательные. Эмпирически подтверждено: `ScanResult` не сериализуется в `clientStorage`, миграция не нужна.
- **R2 → R2.A** — `PluginMessage.fix-violation` расширяется полем `field?: string`. Семантика чище, fixer не зависит от формата `makeViolationId`.
- **R3 → R3.C** — `Violation.currentValue = '14px'`, контекст в `message`. Без расширения типа, симметрично color-нарушениям.
- **R4 → R4.B** — `SelectOption.secondaryLabel` рендерится справа от label в `SelectField`. Лучший UX для numeric-токенов, минимум кода.
- **R5 → R5.C** — текущее гибридное поведение сохраняется. Suggested-секция отсортирована по близости, search — алфавит. Не множим ветвления.
- **R6 → R6.A** — Q2 наследуется и не закрывается в этом шаге. Q2 закрывается отдельным шагом Ф.18b backlog для всех категорий симметрично.
- **R7 → R7.C** — фильтр `value > 0` в scanner для radius. Простой workaround, покрывает 95% кейсов, без whitelist типов.

После закрытия R1-R7 шаг готов к старту подшага 1.1 (`@backend`).

---

## Перед отдачей шага проверено

- Все шесть полей формата заполнены.
- Цель — одна строка с конкретным результатом.
- Зачем — две строки с причиной «сейчас», не «вообще».
- Действие — последовательное, с ролями и зонами работы.
- Критерий — измеримый (скрин + tsc + размер + grep).
- Среда — Claude Code в терминале + Figma desktop, из валидного списка.
- Исполнитель — `@backend` → `@ui-engineer` → `@qa`, по правилам маршрутизации.
- В шаге одна логическая задача: «закрыть Q4 full pipeline». Подшаги — декомпозиция, не «и заодно».
- Разведка (impact-map) сделана `@lead-architect` ДО формулировки шага: §2 содержит фактические референсы файлов, скан кодовой базы перед записью каждого утверждения о коде.

---

## История правок 2026-05-10..2026-05-11

Фактические дельты по каждому подшагу (баланс по `dist/code.js` / `dist/ui.js` относительно baseline `v0.18.0-alpha`: `dist/code.js` 86 063 B, `dist/ui.js` 697 237 B).

| Подшаг | Файлы | Δ code.js | Статус | Дата |
|---|---|---|---|---|
| 1.1 Типы | `types.ts` | 0 | ✅ | 2026-05-10 |
| 1.2 Scanner | `scanner.ts` | +4.94 KB | ✅ (нарушено sandbox-convention: `?.`/`??` дали 2.7x overhead) | 2026-05-10 |
| 1.3 Detector | `detector.ts` | +4.62 KB | ✅ | 2026-05-10 |
| 1.4 Parser | `exampleParser.ts` | +0.63 KB | ✅ | 2026-05-10 |
| 1.5 Fixer | `fixer.ts`, `types.ts` | +2.14 KB | ✅ | 2026-05-10 |
| 1.6 Strings | `strings.ts` | 0 (Δ ui.js +131 B) | ✅ | 2026-05-10 |
| 1.7 AI prompt | `ReportView.tsx` | 0 (Δ ui.js +304 B) | ✅ | 2026-05-10 |
| 1.8 UI | `ReportView.tsx`, `SelectField.tsx` | 0 (Δ ui.js +849 B) | ✅ | 2026-05-10 |
| 1.3.D2 alias-резолвинг FLOAT | `designSystemParser.ts` | +4.0 KB | ✅ корректирующий 2026-05-11 |
| 1.5.D1 try/catch + диаг-логи | `fixer.ts` | (включено в баланс выше) | ✅ корректирующий 2026-05-11 |
| 1.8.D1 handleBulkFix field | `App.tsx` | 0 (Δ ui.js +332 B) | ✅ корректирующий 2026-05-11 |
| 1.4.D1 B1 secondary-matcher | `types.ts`, `exampleParser.ts`, `detector.ts` | +3.04 KB | ✅ корректирующий 2026-05-11 |
| Cleanup всех DIAG-логов | `detector.ts`, `designSystemParser.ts`, `fixer.ts` | −5.53 KB | ✅ 2026-05-11 |

### Финальная сводка размеров

- `dist/code.js`: **105 433 B (103.0 KB)** — **+6.85 KB** от baseline `v0.18.0-alpha` (86 063 B).
- `dist/ui.js`: **698 853 B (682.5 KB)** — **+1.58 KB** от baseline `v0.18.0-alpha` (697 237 B).
- Превышение исходного target (≤100.5 KB по `code.js` после переоценки в §5): **+2.5 KB**.

### Причины превышения

- Alias-резолвинг FLOAT (1.3.D2) — необходим: без него FLOAT-токены с alias на другую коллекцию пропадали из `snapshot.tokens`. Прирост ~4 KB на `code.js` оправдан.
- try/catch в fixer (1.5.D1) — обязательно для устойчивости при `setBoundVariable` на typings, которых нет в текущем Plugin API d.ts.
- B1 secondary-matcher (1.4.D1) — обеспечил корректный подбор `Buttons/hPadding` для paddingLeft/Right и `Buttons/Primary/vPadding` для paddingTop/Bottom; без него один токен `Spacing/M` применялся ко всем полям одинаково.
- Sandbox-convention без `?.`/`??` (зафиксировано в CLAUDE.md §5) — корректирующее правило по итогу 1.2.

**Превышение target не блокер для v1.0.** Q5 (JSDoc minify, см. ADR-002) даст потенциальный выигрыш ≥21 KB на `code.js`, после Q5 размер уйдёт ниже 80 KB.

### Acceptance — фактическое состояние на 2026-05-11

- ✅ main pipeline (scanner → detector → parser → fixer → UI) работает end-to-end.
- ✅ off-scale spacing нарушения детектятся.
- ✅ off-scale radius нарушения детектятся.
- ✅ B1 secondary-matcher подбирает правильные токены по полю:
  - paddingLeft/Right → `Buttons/hPadding` (для эталона AltaIDE/ButtonPrimary).
  - paddingTop/Bottom → `Buttons/Primary/vPadding`.
  - radius сохраняет унифицированную роль (R-spacing.3.A).
  - Tier-2 fallback (matching без `spacingField`) сохраняет backward-совместимость для snapshot, собранных до B1.
- ✅ Fix all применяет `setBoundVariable` корректно для всех полей.
- ✅ UI кладёт `field` в `PluginMessage` (включая bulk path через `handleBulkFix`).
- ✅ Реальный кейс ButtonPrimary (padding 7×7×13×13 → 12/12/4/4) прошёл acceptance в Figma desktop.

### Не покрыто в этой сессии (для handoff)

- Регрессия S1-S4 (color/typography multi-slot из Ф.18.13) не проверена после B1.
- S7 radius — не прогнан в Figma desktop на реальном off-scale кейсе (например, 7px на компоненте с эталоном `cornerRadius=4`).
- rem-доли в `spacingScale` (`[0, 0.2, 0.4, 0.5, 1, ...]`) — multi-mode баг не до конца исправлен. Числа в px работают, доли rem не блокирующие.
- B3 example-driven `binding_mismatch` — найден на ContextMenu (узлы `18773:210429`, `18759:209762`): `Ctrl+V` биндится на `LiContext` вместо `Shortcut`. Задокументирован в backlog v1.1.

---
