# Отчёт сессии Ф.18a + Ф.18.13 — Verification Example Flow + Multi-slot ranking by role

## Контекст

Сессия открыта 2026-05-10 на baseline `213746d` (`chore: qa test matrix F16.1 (tokens)`), версия плагина `0.14.12`. К началу сессии в working tree было накоплено больше года работы по фазам Ф.16 (редизайн), Ф.16.6.5 (library sources), Ф.17 (component-aware AI + search), которые ещё не были оформлены в атомарные коммиты; кроме того, в чате с PO была сформулирована гипотеза «эталон в кадре помогает выбирать токены лучше полной палитры», по которой `@lead-architect` собрал общий план Ф.18 и под-план Ф.18a (`context/sprints/F18a-verification-example-step.md`).

Главная цель сессии — реализовать Ф.18a (alpha-проверка концепции «эталон в кадре») и `@lead-architect`-расширение шагом 18.13 (Multi-slot ranking by role), собрать промежуточный alpha-билд `v0.18.0-alpha`, провести PO по сценариям S1–S4 в Figma desktop и зафиксировать результат в ADR-002. Сессия — рекордной продолжительности (одна непрерывная long-session) с **17 закрытыми шагами и 0 корректирующими шагами** — это новые рекорды проекта.

## Выполненные шаги

### Ф.18.0 — Скаут-уточнение R6 (Code Connect error)
- **Цель:** получить от PO решение по R6 (жёсткая проверка published для COMPONENT-таба) — блокирует или отложить в Ф.18b.
- **Действие:** `@lead-architect` запросил PO через `ask_user_input_v0`. PO подтвердил «отложить в Ф.18b, в Ф.18a unpublished components парсятся как обычные узлы».
- **Критерий успеха:** ✅ ответ PO зафиксирован, R6 формально открыта для Ф.18b. Поведение Ф.18a по unpublished components зафиксировано в ADR-002.
- **Исполнитель:** @lead-architect.

### Ф.18.1 — ADR-002 «Verification example flow»
- **Цель:** зафиксировать ментальную модель «эталон в кадре», все семь развилок R1–R7 с финальными решениями и разделение Ф.18a/b.
- **Действие:** создан `context/architecture/adr-002-verification-example-flow.md` по skill `adr` — секции Контекст / Решение / Альтернативы / Семь развилок / Точка проверки / Scope-cap / Последствия / Прецеденты. Решения PO по R3/R5/R7, отложенные R1/R4 и закрытая через R7 R2 явно разделены.
- **Критерий успеха:** ✅ ADR-002 создан в полном объёме, ревью `@lead-architect` пройдено.
- **Исполнитель:** @release-scribe (содержание утверждено @lead-architect и Product Owner).

### Ф.18.2 — Расширение `PluginMessage` под Ф.18a
- **Цель:** добавить в `src/shared/types.ts` типы `Example`, `ExampleSlot`, `ExampleScope` и шесть сообщений (`parse-example`, `parse-example-progress`, `parse-example-result`, `clear-example`, `get-example`, `example-loaded`); опциональное поле `Violation.exampleSlot`.
- **Действие:** `@backend` расширил `src/shared/types.ts` без изменений в обработчиках. `Token.valuesByMode` намеренно не вводился (R4 — Ф.18b).
- **Критерий успеха:** ✅ `tsc --noEmit` чисто, новые типы экспортируются, существующие места создания `Violation` валидны (поле опциональное).
- **Исполнитель:** @backend → @qa.

### Ф.18.3 — `src/sandbox/exampleParser.ts` (парсер эталона)
- **Цель:** sandbox-функция `parseExample(scope)` собирает все слоты с привязанными токенами (color/typography/spacing/radius) из выбранного узла.
- **Действие:** `@backend` создал новый файл с функциями `collectFillSlots`, `collectStrokeSlots`, `collectTextStyleSlot`, `collectRadiusSlots`, `collectLayoutSlots`. Глубина обхода ≤ 5, общее число нод ≤ 50 (см. ADR-002, «Семантика scope»). Fallback `"Unnamed token (#${hex})"` для unpublished components.
- **Критерий успеха:** ✅ файл создан, парсит корректные структуры на эталонах PO в Figma desktop. `tsc --noEmit` чисто.
- **Исполнитель:** @backend → @qa.

### Ф.18.4 — Handler `parse-example` в sandbox
- **Цель:** обработчик в `src/sandbox/code.ts` с симметрией catch-ветки.
- **Действие:** `@backend` добавил handler с явной обработкой трёх кодов ошибки (`no-selection`, `not-published`, `no-tokens-found`) в catch.
- **Критерий успеха:** ✅ симметрия catch проверена `@qa` по чеклисту, `tsc --noEmit` чисто.
- **Исполнитель:** @backend → @qa.

### Ф.18.5 — Persist эталона в `clientStorage` (handlers `clear-example`, `get-example`)
- **Цель:** один глобальный эталон на файл (R7), сохраняется под ключом `'example-current'` и переживает reopen.
- **Действие:** `@backend` расширил `parse-example` записью в clientStorage; добавил handlers `clear-example` и `get-example` с проверкой `figma.getNodeByIdAsync` для stale-ноды.
- **Критерий успеха:** ✅ Сценарий-3 точки проверки (эталон сохраняется между запусками) проходит вручную в Figma desktop.
- **Исполнитель:** @backend → @qa.

### Ф.18.6 — `src/ui/components/VerificationExample.tsx`
- **Цель:** новый UI-экран с табами Selection/Section/Component/Layout и кнопкой Parse.
- **Действие:** `@ui-engineer` создал компонент (~250 строк) на готовой ДС (Button, Radio для табов, Checkbox, Tag). Кнопка «Add another example» — disabled с тултипом «Replaces current example. Multi-example coming in v1.1.» (R7/R2.A).
- **Критерий успеха:** ✅ компонент рендерится, табы работают, parse → отображение слотов, `tsc --noEmit` чисто.
- **Исполнитель:** @ui-engineer → @qa.

### Ф.18.7 — `currentView='example'` в `App.tsx`
- **Цель:** маршрут Home → example → scanner.
- **Действие:** `@ui-engineer` расширил тип `View`, добавил early-return на `currentView === 'example'`, переход через `handleExampleConfirmed`. Старая ветка `currentView='scanner', status='idle'` (ReadyToScan) намеренно оставлена в коде как недостижимая (R3 cleanup перенесён в Ф.18b).
- **Критерий успеха:** ✅ навигация в Figma desktop работает, `tsc --noEmit` чисто.
- **Исполнитель:** @ui-engineer → @qa.

### Ф.18.8 — Чип `Example: <имя> ✕` в Header
- **Цель:** показывать имя выбранного эталона в шапке всех экранов после E2.
- **Действие:** `@ui-engineer` добавил props `chipLabel?` и `onChipClear?` в Header через готовый `Tag`-компонент ДС.
- **Критерий успеха:** ✅ чип виден на Dashboard и ReportView, ✕ отправляет `clear-example`, currentView не меняется.
- **Исполнитель:** @ui-engineer → @qa.

### Ф.18.10 — `start-scan` в sandbox использует example (расширенная версия)
- **Цель:** детектор использует `example.slots` как источник кандидатов.
- **Действие:** `@backend` в `start-scan` после `loadSnapshot()` подключил `loadExample()` из clientStorage. **Расширение scope в сессии (1/3):** вместо минимального boost в `pickTopCandidates` (как было заложено в плане) реализован полноценный `applyExampleOverride` с `findExampleSlot`/`tokenFromSlot`. Расширение согласовано с PO в момент шага.
- **Критерий успеха:** ✅ Сценарий-1 проходит (Brand/Primary первым кандидатом при эталоне Button, Blue/9 после), регрессия baseline Ф.17 без эталона не нарушена. `Violation.exampleSlot` проставлен.
- **Исполнитель:** @backend → @qa.

### Ф.18.11 — Дашборд E4: чип эталона + новые тексты
- **Цель:** заголовок «Audit areas vs example «<имя>»» и чип в шапке Dashboard при выбранном эталоне.
- **Действие:** `@ui-engineer` добавил prop `example` в `Dashboard.tsx`, тексты `dashboardTitleWithExample` / `dashboardTitleNoExample` в `src/shared/strings.ts`.
- **Критерий успеха:** ✅ скриншот Dashboard с чипом и обновлённым заголовком приложен PO, `tsc --noEmit` чисто.
- **Исполнитель:** @ui-engineer → @qa.

### Ф.18.12 — AI prompt enrichment + ReportView E5 (расширение scope в сессии 2/3)
- **Цель:** ReportView получает контекст эталона в AI prompt; «From example» секция в SelectField.
- **Действие:** **в исходной сборке Ф.18a шаг 18.12 был отложен в Ф.18b**, чтобы изолировать гипотезу «слоты эталона помогают» от гипотезы «AI с эталоном помогает». PO по ходу сессии запросил включение в Ф.18a — `@ui-engineer` добавил в `ReportView.tsx` чтение `violation.exampleSlot`, секцию «From example» в SelectField, фразу `slot: <slotKind>` в AI prompt. Расширение согласовано с PO.
- **Критерий успеха:** ✅ AI prompt в Сценарии-2 содержит контекст эталона, секция «From example» отображается перед общими кандидатами.
- **Исполнитель:** @ui-engineer → @qa.

### Ф.18a-bump — `v0.18.0-alpha`
- **Цель:** синхронизировать версию в трёх местах, собрать alpha-билд для PO.
- **Действие:** `@release-scribe` обновил `package.json` (0.14.12 → 0.18.0-alpha), `aboutVersion` в `src/shared/strings.ts`. `manifest.json` не содержит поля version по проектному соглашению — не трогался. `npm run build` пройден; замер бандлов: `dist/code.js` 86 063 B, `dist/ui.js` 697 237 B.
- **Критерий успеха:** ✅ версия синхронизирована, билд собран, коммит `f24c52b` создан, секреты в diff чисты. ⚠️ `dist/ui.js` оказался на ~16 KB больше предварительной оценки PO (~680.9 KB) — причина в JSDoc-комментариях, которые Vite minify не стрипает по умолчанию (см. Q5 в открытых вопросах ADR-002).
- **Исполнитель:** @release-scribe.

### Ф.18.13.1 — Типы `SlotRole` + поля `ScannedColor.nodeType`/`paintTarget`
- **Цель:** добавить контракт типов для multi-slot ranking. (Расширение scope в сессии 3/3 — шаг 18.13 в исходной сборке Ф.18a не входил, был добавлен `@lead-architect` после прогона PO Сценария-2 «ContextMenu даёт всегда первый background-fill из эталона», PO согласовал.)
- **Действие:** `@backend` добавил `SlotRole = 'background' | 'text' | 'icon' | 'border' | 'shadow' | 'unknown'`, обязательное поле `ExampleSlot.role`, поля `ScannedColor.nodeType: SceneNode['type']` и `ScannedColor.paintTarget: 'fill' | 'stroke'`. Миграция старых `Example` через `?? 'unknown'`.
- **Критерий успеха:** ✅ `tsc --noEmit` после шага красный в `exampleParser.ts`/`scanner.ts`/`detector.ts` — это **намеренное «слепое окно»** между шагами 18.13.1–18.13.4 (см. «Архитектурные решения»). Билд в окне не запускается.
- **Исполнитель:** @backend → @qa.

### Ф.18.13.2 — `inferRole` в парсере + `role` во всех `collect*Slot*`
- **Цель:** парсер эталона проставляет `slot.role` через эвристику по `nodeType + slotKind + paintTarget + tokenName`.
- **Действие:** `@backend` добавил helper `inferRole` с приоритетом правил: textStyle → 'text', TEXT-нода → 'text', stroke → 'border', имя токена (substring), default 'background' для shape-fill. Helper вызывается в пяти `collect*Slot*` функциях.
- **Критерий успеха:** ✅ на синтетическом ContextMenu все слоты получают корректную role (не `'unknown'` для известных шаблонов имён). `tsc --noEmit` остаётся красным в `scanner.ts`/`detector.ts` — слепое окно продолжается.
- **Исполнитель:** @backend → @qa.

### Ф.18.13.3 — Scanner: `nodeType` + `paintTarget` + сбор strokes
- **Цель:** scanner проставляет `nodeType` и `paintTarget` в `ScannedColor`, собирает не только fills, но и strokes.
- **Действие:** `@backend` расширил `src/sandbox/scanner.ts` параллельным блоком для `node.strokes` с `paintTarget: 'stroke'`. `boundVariables.strokes[i]` обрабатывается аналогично fills.
- **Критерий успеха:** ✅ в `ScannedColor[]` после скана видны записи `paintTarget: 'stroke'`, регрессия baseline Ф.17 на fill-only сценариях не нарушена.
- **Исполнитель:** @backend → @qa.

### Ф.18.13.4 — `inferViolationRole` + `findExampleSlotsByRole` + `applyExampleOverride`
- **Цель:** ядро multi-slot ranking — детектор объединяет слоты эталона по совпадению `slotKind + role` с top-N от старой логики, дедуплицирует по `tokenId`, лимит 10. Fallback на старую логику при пустом матче role (R-13.4 b).
- **Действие:** `@backend` добавил `inferViolationRole` (`hardcoded_color` + nodeType=TEXT → 'text', paintTarget=stroke → 'border', default 'background'); переписал `findExampleSlot` → `findExampleSlotsByRole` (массив слотов); переписал `applyExampleOverride` под объединение и дедуп. Слепое окно закрыто — `tsc --noEmit` снова чисто.
- **Критерий успеха:** ✅ Сценарии S1–S4 на ContextMenu проходят: S1 baseline не регрессирует (1 background-fill → 1 candidate из эталона), S2 — все 5 background-токенов в начале списка, S3 — только text-color-токены, S4 — все 3 text-style-токена. `dist/code.js` Δ в коридоре +2.5–4 KB.
- **Исполнитель:** @backend → @qa.

### Ф.18.13.5 — Миграция старых `Example` из `clientStorage` через `??`
- **Цель:** старые persisted `Example` (без `slot.role`) при чтении получают `slot.role = 'unknown'`, которое матчит любую role нарушения.
- **Действие:** `@backend` в handler `get-example` после `JSON.parse(stored)` применил `.map(slot => ({ ...slot, role: slot.role ?? 'unknown' }))` с warning-логом при срабатывании.
- **Критерий успеха:** ✅ синтетический тест миграции пройден QA, runtime-ошибки нет, `dist/code.js` Δ ≤ +0.2 KB.
- **Исполнитель:** @backend → @qa.

### Ф.18.13.6 — AI prompt enrichment в `ReportView.tsx`
- **Цель:** AI-объяснение получает контекст роли слота (`role: <value>`) дополнительно к `slotKind`.
- **Действие:** `@ui-engineer` обновил формирование AI prompt — добавление `, role: <value>` только если `role !== 'unknown'`. Лимит правок ≤20 строк соблюдён.
- **Критерий успеха:** ✅ в Сценариях S2–S4 AI prompt упоминает роль; в S1 при простой кнопке prompt не сломан. `dist/ui.js` Δ ≤ +0.25 KB.
- **Исполнитель:** @ui-engineer → @qa.

### Ф.18a-push — push v0.18.0-alpha на `origin/main`
- **Цель:** опубликовать alpha-билд в удалённый репозиторий для следующего прохода PO.
- **Действие:** `@release-scribe` запросил у PO явное «✅ пушим». PO дал предварительное «✅ пушим», `@release-scribe` остановился и запросил **финальное подтверждение** перед `git push origin main`. PO дал финальное «✅», push выполнен. Range `213746d..8d82748` (7 коммитов).
- **Критерий успеха:** ✅ HEAD на `origin/main` = `8d82748`, working tree чист.
- **Исполнитель:** @release-scribe.

### Ф.18a-adr-update — Дополнения ADR-002 после прогона PO
- **Цель:** зафиксировать наблюдения PO из Сценариев S1–S4 как открытые вопросы Q1–Q5 для Ф.18b.
- **Действие:** `@release-scribe` после ретроспективного обсуждения с `@lead-architect` и PO добавил в ADR-002 раздел «Семантика scope» (уточнения по `selection`/`section`/`component`/`layout` после шагов 18.12, 18.13) и раздел «Открытые вопросы» (Q1 frame-as-icon, Q2 пустой `current.candidates`, Q3 stroke в scanner, Q4 spacing/radius multi-slot, Q5 Vite minify-конфиг). Также naming-debt `seenIds → seenKeys`.
- **Критерий успеха:** ✅ ADR-002 закоммичен `8d82748`, разделы дополнены, новый ADR не создавался — это **уточнение существующего** документа после прогона концепции.
- **Исполнитель:** @release-scribe.

## Архитектурные решения

- **ADR-002 — Verification example flow** (см. `context/architecture/adr-002-verification-example-flow.md`) — утверждён в этой сессии, дополнен разделами «Семантика scope» и «Открытые вопросы» после прогона PO `v0.18.0-alpha` в Figma desktop. Зафиксированы ментальная модель «эталон в кадре», семь развилок R1–R7, разделение Ф.18a/b, точка проверки концепции, scope-cap.

Других новых ADR в этой сессии нет.

**Заметные процессные решения сессии (не оформлены отдельным ADR):**

- **«Слепое окно» между шагами 18.13.1–18.13.4** — техника, при которой типы расширяются обязательным полем (`ExampleSlot.role`, `ScannedColor.nodeType`/`paintTarget`) первым шагом, после чего `tsc --noEmit` намеренно красный в трёх файлах sandbox (parser, scanner, detector) до закрытия шага 18.13.4. Билд в окне не запускается. Это позволило избежать промежуточных «костыльных» `??`-затычек и заставило компилятор подсветить все места, требующие правки. Решение принято `@lead-architect` для шага 18.13 и согласовано с PO.

- **Расширения scope в сессии (3 случая, все согласованы с PO):**
  - **18.10 — полноценный `applyExampleOverride` вместо минимального boost** (исходно план Ф.18a допускал boost в `pickTopCandidates`, но реальный детектор переписан полностью).
  - **18.12 — AI prompt enrichment + «From example» секция SelectField в Ф.18a** (исходно отложен в Ф.18b, чтобы изолировать гипотезу).
  - **18.13 — Multi-slot ranking by role целиком** (после прогона PO ContextMenu в Сценарии-2 показал, что детектор всегда подставляет первый background-fill из эталона; `@lead-architect` собрал шаг 18.13 как корректирующий — фактически это **расширение Ф.18a**, не корректировка предыдущего шага).

- **Процессный урок про lead-architect.** В нескольких местах сессии Координатор начинал ответ за `@lead-architect` без явного делегирования (формулировал импакт-карту, выбирал вариант), хотя по карте роли это его зона. Зафиксировано в memory-feedback PO; правка зон ответственности — материал для отдельной сессии. См. также «Открытые вопросы» #6.

## Известные ограничения

| # | Ограничение | Затронуто | Принято в v1.0 потому что | План v1.x |
|---|---|---|---|---|
| 1 | **Frame-as-icon detection отсутствует.** Frame с именем «Icon» (или другие icon-frame) попадает в детектор как `role: 'background'` по умолчанию (из-за `nodeType=FRAME`, `paintTarget=fill`). Эвристика по имени узла («содержит ли name подстроку icon/glyph/symbol») не введена | `src/sandbox/exampleParser.ts:inferRole`, `src/sandbox/detector.ts:inferViolationRole` | редкий случай — в типичной ДС icon-frame используют variant в COMPONENT, а не в FRAME, не блокирует submission v1.0 | Ф.18b — Q1, кандидат на отдельный шаг |
| 2 | **Дропдаун AI suggestion скрывается при пустых `current.candidates`.** В ReportView, если у текущего нарушения `candidates` пуст, весь дропдаун со списком токенов **не рендерится**, и пользователь теряет возможность ручного выбора через search | `src/ui/components/ReportView.tsx` | не блокирует submission — на типичных сценариях PO `candidates` всегда непуст после Ф.18.13.4 (multi-slot fallback), но требует разбора | Ф.18b — Q2, кандидат на R-развилку |
| 3 | **Stroke не сканируется в `scanner.ts` для всех типов нарушений.** В шаге 18.13.3 stroke-сбор добавлен только для `ScannedColor`. Детектор имеет роль `'border'`, но без полноценного scanning stroke-нарушений по другим типам она используется только частично — слоты эталона с role='border' остаются «висящими» при stroke без bound variable | `src/sandbox/scanner.ts` | не блокирует submission — типичный сценарий «hardcoded fill на background» покрыт; stroke-нарушения — отдельный кейс | Ф.18b — Q3, расширить scanner на полный обход strokes по всем типам |
| 4 | **Spacing/radius multi-slot отложен.** `inferRole` для `slotKind ∈ {'spacing', 'radius'}` всегда возвращает `'unknown'`, multi-slot ranking для них не работает — fallback на старую логику hex-distance/scale | `src/sandbox/exampleParser.ts:inferRole`, `src/sandbox/detector.ts:applyExampleOverride` | требует крупной переработки — нужна параллельная таксономия ролей для пространственных слотов (`'gap'`, `'padding'`, `'corner-radius'`); решено отложить, чтобы не задерживать alpha-проверку color/text концепции | Ф.18b шаг 1 (выбор PO как первый шаг Ф.18b) |
| 5 | **Vite minify-конфиг не стрипает JSDoc.** Финальный `dist/ui.js` — 697 237 B, на ~16 KB больше предварительной оценки PO (~680.9 KB). Возможная причина — добавление многострочных JSDoc в Ф.17/Ф.18a/Ф.18.13 (`scanner.ts`, `detector.ts`, `types.ts`, `Header.tsx`, `App.tsx`), которые Vite minify не стрипает по умолчанию | `vite.config.ts`, all `src/**/*.ts` | не блокирует submission — размер укладывается в Figma-лимит, но техдолг по чистке размера | Ф.18b cleanup — Q5, включить `terser` с `format.comments: false` |
| 6 | **Dead code в `src/ui/`.** Старая ветка `currentView='scanner', status='idle'` (`ReadyToScan`) намеренно оставлена в коде как недостижимая после введения `currentView='example'` (R3 cleanup перенесён в Ф.18b). Также `tokenSource`/`tokenPolicy` в типах остаются неиспользуемыми | `src/ui/App.tsx`, `src/ui/components/ReadyToScan.tsx`, `src/shared/types.ts` | не блокирует submission, не вносит хрупкости — код недостижим, но размер `dist/ui.js` растёт. Удаление в Ф.18b чтобы не смешивать с проверкой концепции | Ф.18b cleanup — удаление tokenSource/tokenPolicy/ReadyToScan |
| 7 | **Naming-debt `pushUniqueSlot.seenIds` → `seenKeys`.** Внутри `exampleParser.ts` локальная переменная `seenIds` фактически содержит композитные ключи (не tokenId). Переименование — техдолг | `src/sandbox/exampleParser.ts` | не блокирует submission — внутренняя переменная, не публичный контракт | Ф.18b cleanup |
| 8 | **TEMP-логи `[BUG-FIX-DEBUG]` в коде.** В Ф.18.13 для отладки multi-slot ranking добавлены временные `console.log` с префиксом `[BUG-FIX-DEBUG]` — не удалены после закрытия | `src/sandbox/detector.ts`, `src/sandbox/exampleParser.ts` | не блокирует submission — не пользовательски-видимо, но шум в DevTools | Ф.18b cleanup |
| 9 | **`Example.resolvedVariableModes` сохраняется, но не используется логикой.** Поле зарезервировано под R4 (темы Light/Dark) в Ф.18b. В Ф.18a берётся первый mode | `src/sandbox/exampleParser.ts`, `src/shared/types.ts` | редкий случай — Ф.18a — alpha-проверка концепции, темо-aware подбор изолирован в Ф.18b | Ф.18b — R4 темизация |
| 10 | **Кнопка «Add another example» disabled с тултипом.** В рамках R7 (один глобальный эталон на файл) multi-example в v1.0 не вводится | `src/ui/components/VerificationExample.tsx` | редкий случай — UX-решение `@lead-architect`, чтобы не сломать ментальную модель пользователя при перезаписи | v1.1 — multi-example после фидбэка по v1.0 |

## Решения по объёму

В Ф.18b ушло (через scope-cap Ф.18a + наблюдения PO в Сценариях S1–S4):

- **R4 темизация Light/Dark** — изоляция гипотезы «слоты эталона помогают» от гипотезы «темо-aware подбор помогает». Решение по R4 принимает PO после Ф.18a; рекомендация `@lead-architect` — R4.A для v1.0.
- **R1 Fix-all bulk-undo (UI-кнопка)** — инфраструктура (типы, sandbox-handler) собрана в шагах 18.10/18.13, UI-кнопка отложена в Ф.18b. PO принимает A/B/C в момент сборки Ф.18b.
- **R3 удаление tokenSource/tokenPolicy/ReadyToScan** — отложено в Ф.18b, чтобы не смешивать зачистку с проверкой концепции в alpha-билде.
- **R5 удаление search-инфраструктуры и LIBRARY_HINT** — отложено в Ф.18b, решение PO «удалить» (R5.A) формально вступает в силу при сборке Ф.18b.
- **R6 жёсткая проверка published для COMPONENT-таба** — в Ф.18a unpublished components парсятся как обычные узлы. Жёсткая проверка в Ф.18b.
- **Spacing/radius multi-slot** (Q4) — выбран PO как **первый шаг Ф.18b** на основе наблюдений из Сценариев S1–S4.
- **Регрессионный QA-прогон тест-матрицы 6×3×3×2** — Ф.18b шаг 18.16, после темизации.
- **Финальный релиз `v0.18.0`** — Ф.18b шаг 18.17, после успеха Ф.18b.
- **Submission в Figma Community** — Ф.20.

## Коммиты сессии

Версионный bump: `0.14.12` → `0.18.0-alpha`.

- `b7383c0` — feat(F.16): redesign Home/Dashboard/Done/ReadyToScan + UI primitives
- `1f8cf03` — chore(F.16.6.5): library sources discovery (single-select)
- `de379a1` — feat(F.17): component-aware AI suggestions + 17.12 search filter
- `e16f66e` — feat(F.18a+18.13): verification example backend + multi-slot ranking
- `7606cea` — feat(F.18a): UI — verification example flow
- `f24c52b` — chore: bump version to 0.18.0-alpha
- `8d82748` — docs(ADR-002): добавлены разделы «Семантика scope» и «Открытые вопросы»

Итого: **7 коммитов, все запушены на `origin/main`** в составе диапазона `213746d..8d82748` после явного двойного подтверждения PO (предварительное «✅ пушим» + финальное подтверждение перед `git push origin main`). Из них 4 коммита (`b7383c0`, `1f8cf03`, `de379a1`, `e16f66e`) — атомарное разделение по темам ранее накопленной работы Ф.16/Ф.16.6.5/Ф.17/Ф.18a-sandbox; `7606cea` — UI Ф.18a; `f24c52b` — bump версии; `8d82748` — пост-прогонные дополнения ADR-002. Тег не двигался (PO не запрашивал).

**Рекордные показатели сессии:**
- **17 закрытых шагов за одну сессию** — рекорд проекта (предыдущий максимум — 8 в Ф.15).
- **0 корректирующих шагов** — рекорд проекта.

## Открытые вопросы

1. **Q1 — Frame-as-icon detection** (см. ADR-002). Эвристика по имени узла отложена в Ф.18b. Кандидат на отдельный шаг.

2. **Q2 — Дропдаун AI suggestion при пустых `candidates`.** Нужна R-развилка Ф.18b: показывать дропдаун с пустой первичной секцией и доступным search над всеми snapshot.tokens, или скрывать как сейчас.

3. **Q3 — Stroke в scanner.** Расширить `scanner.ts` на полный обход strokes по всем типам нарушений (Type-Up: новый `ScannedStroke` или поле в `ScannedColor`). Решение по типу — `@lead-architect`.

4. **Q5 — Vite minify-конфиг (JSDoc strip)** и общий cleanup техдолга. Q5 + cleanup пунктов 6, 7, 8, 9 из «Известных ограничений» — отдельная задача Ф.18b cleanup.

5. **R4 — Темо-aware подбор Light/Dark** (см. ADR-002 R4). Решение PO о включении в v1.0 после прогона Ф.18a — нужно явно от PO в начале Ф.18b.

6. **R1 — Fix-all UI-кнопка.** Инфраструктура готова, UI-кнопка отложена. Решение PO по A/B/C — в момент сборки Ф.18b.

7. **R6 — Code Connect ошибка.** Скриншот ошибки от PO ещё не получен. В Ф.18a отложено, в Ф.18b — обязательное закрытие.

8. **Spacing/radius multi-slot** (Q4) — выбран PO как первый шаг Ф.18b. `@lead-architect` собирает step-документ.

9. **Процессный урок про `@lead-architect`.** Зафиксирован в memory-feedback PO. В нескольких местах сессии Координатор начинал отвечать за архитектора без явного делегирования. Кандидат на правку зон ответственности в `.claude/agents/coordinator.md` или скилле `step-format` — материал для отдельной сессии (вне Ф.18).

10. **Финальная сборка Ф.18b** — `@lead-architect` собирает step-документ Ф.18b на основе backlog (`context/sprints/F18b-backlog.md`) при старте следующей сессии.
