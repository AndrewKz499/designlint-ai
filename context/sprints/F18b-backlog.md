# Ф.18b — Backlog (черновой)

> Дата сборки: 2026-05-10. `@release-scribe`.
> Источник: scope-cap из `context/sprints/F18a-verification-example-step.md` (раздел 7) + наблюдения PO в Сценариях S1–S4 после прогона `v0.18.0-alpha` в Figma desktop, зафиксированные в `context/architecture/adr-002-verification-example-flow.md` (разделы «Семантика scope» и «Открытые вопросы»).
> **Это не step-документ Ф.18b.** Step-документ собирает `@lead-architect` отдельно при старте Ф.18b — этот файл служит только инвентарём задач, чтобы ничего не потерялось между сессиями.

---

## 1. Контекст и точка входа

После закрытия Ф.18a + Ф.18.13 и push `v0.18.0-alpha` в `origin/main` PO провёл alpha-билд по сценариям S1–S4 в Figma desktop. Гипотеза «эталон в кадре помогает выбирать токены лучше полной палитры» подтверждена на color и typography. Решение PO: **продолжаем в Ф.18b** (по чеклисту из ADR-002 «Точка проверки концепции»).

**Что Ф.18b обязана сделать перед `v0.18.0` (без `-alpha`):**
- закрыть отложенные R-развилки (R1, R4, R5, R6),
- провести cleanup техдолга после alpha-сборки,
- собрать регрессионную тест-матрицу 6×3×3×2,
- финальный bump `v0.18.0` и подготовка submission-артефактов.

**Что Ф.18b НЕ делает:** не вводит multi-example (R2 — v1.1), не делает severity-градацию (v1.1), не делает DTCG-импорт (v1.1), не делает submission в Figma Community (Ф.20).

---

## 2. Шаги в порядке приоритета

### Шаг 1 — **Spacing/radius multi-slot** (выбор PO как первый шаг Ф.18b)

**Источник:** Q4 в ADR-002 «Открытые вопросы», подтверждено PO как первый шаг Ф.18b.

**Что делать:**
- Расширить `SlotRole` или ввести параллельную таксономию для пространственных слотов (`'gap'`, `'padding'`, `'corner-radius'`).
- Доработать `inferRole` для `slotKind ∈ {'spacing', 'radius'}` — сейчас всегда возвращает `'unknown'`.
- Доработать `inferViolationRole` для `violation.type === 'spacing_off_scale'`.
- Доработать `applyExampleOverride` для multi-slot ranking spacing/radius.
- Сценарий проверки: эталон с разными paddings/gaps под разные роли (внешний padding контейнера vs внутренний gap между элементами) → детектор различает их в `Violation.candidates`.

**Развилка для PO:** параллельная таксономия (новый union type) или расширение существующего `SlotRole` пятью значениями. `@lead-architect` собирает scout-step, формулирует A/B.

**Размер:** L (по аналогии с 18.13).

---

### Шаг 2 — **R4 темо-aware подбор Light/Dark**

**Источник:** R4 в ADR-002, отложено в Ф.18b. Решение PO ожидается в начале Ф.18b.

**Что делать (после решения PO):**
- Расширить `Token` полем `valuesByMode: Record<modeId, hex>`.
- В `designSystemParser.ts` использовать `variable.resolveForConsumer(node)` вместо `Object.values(valuesByMode)[0]`.
- В `exampleParser.ts` сохранять `Example.resolvedVariableModes` уже не как «зарезервированное поле», а использовать в логике matching.
- Sandbox при сканировании читает `node.resolvedVariableModes` и ранжирует кандидатов с учётом темы фрейма.

**Развилка для PO:** A — темы в v1.0 (рекомендация `@lead-architect`). B — темы в v1.1 + warning «Detected dark theme — light recommendations may apply». C — только Light в v1.0.

**Размер:** L (M на парсер + M на детектор + S на UI).

---

### Шаг 3 — **R1 Fix-all: UI-кнопка bulk-undo**

**Источник:** R1 в ADR-002, отложено в Ф.18b.

**Что делать (после решения PO):**
- Инфраструктура (типы `bulk-fix-violation`, sandbox-handler с одним `figma.commitUndo` перед циклом) частично собрана в Ф.18.10/Ф.18.13. Проверить и доделать.
- UI-кнопка «Fix all» в Dashboard (в макетах PO была видна) — добавить вызов `bulk-fix-violation` для всех нарушений активной категории.
- Один Cmd+Z откатывает всё.

**Развилка для PO:** A — bulk-undo (рекомендация для v1.0). B — превью + подтверждение «Apply to N nodes?» → дальше как A. C — оставить как сейчас (N независимых undo).

**Размер:** M (S sandbox + S UI + S QA-регрессия).

---

### Шаг 4 — **Q1 Frame-as-icon detection**

**Источник:** Q1 в ADR-002 «Открытые вопросы».

**Что делать:**
- Эвристика по имени узла в `inferRole`: если `node.name.toLowerCase()` содержит `'icon'` / `'glyph'` / `'symbol'` И `nodeType === 'FRAME'` → `role: 'icon'` вместо `'background'`.
- Аналогичная логика в `inferViolationRole`.
- Acceptance: эталон с icon-frame’ами (например, ToolbarIcons-компонент) → детектор различает icon vs background.

**Размер:** S (XS на парсер + XS на детектор + S на тест-матрицу icon-кейсов).

---

### Шаг 5 — **Q2 Дропдаун AI suggestion при пустых `current.candidates`**

**Источник:** Q2 в ADR-002 «Открытые вопросы», кандидат на R-развилку.

**Что делать (после решения PO):**
- Текущее поведение: при пустом `candidates` в ReportView дропдаун **не рендерится**.
- Развилка: A — показывать дропдаун с пустой первичной секцией и доступным search над всеми snapshot.tokens. B — оставить скрытие, но показать сообщение «No candidates from example. Use search.» с явным CTA. C — оставить как сейчас (PO принимает known limitation).

**Размер:** XS-S (UI-правка ReportView).

---

### Шаг 6 — **Q3 Stroke в scanner (полный обход)**

**Источник:** Q3 в ADR-002 «Открытые вопросы».

**Что делать:**
- В Ф.18.13.3 scanner расширен только для `ScannedColor` (fills + strokes). Доделать сбор stroke по всем типам нарушений.
- Развилка `@lead-architect`: A — новый тип `ScannedStroke`. B — поле `paintTarget` в существующих типах (как в `ScannedColor`).
- Acceptance: stroke-нарушения детектятся, слоты эталона с `role: 'border'` используются полноценно.

**Размер:** M (M на scanner + S на детектор + S на тест-матрицу stroke-кейсов).

---

### Шаг 7 — **Q5 Vite minify-конфиг (JSDoc strip)**

**Источник:** Q5 в ADR-002 «Открытые вопросы».

**Что делать:**
- В `vite.config.ts` подключить `terser` с `format.comments: false` или `legalComments: 'none'`.
- Замерить дельту `dist/ui.js` (ожидаемый выигрыш ≥10 KB).
- Acceptance: финальный `dist/ui.js` < 685 KB.

**Размер:** XS.

---

### Шаг 8 — **R5 Удаление search-инфраструктуры + LIBRARY_HINT**

**Источник:** R5 в ADR-002 (решение PO `R5.A — удалить`, фактическое удаление перенесено в Ф.18b).

**Что делать:**
- Удалить search-дропдаун в `SelectField` (или оставить как fallback при пустых candidates — зависит от Q2 шаг 5).
- Удалить `LIBRARY_HINT` из `ReportView.tsx`.
- Удалить связанные строки локализации в `src/shared/strings.ts`.
- Acceptance: `dist/ui.js` Δ ≥ −5 KB.

**Размер:** S.

---

### Шаг 9 — **R6 Code Connect ошибка (закрытие)**

**Источник:** R6 в ADR-002, отложено в Ф.18a.

**Что делать (после получения скриншота от PO):**
- Получить от PO скриншот ошибки и сценарий её появления.
- Развилка `@lead-architect`: A — эталон только из опубликованных компонентов. B — эталон из любого узла, включая неопубликованные (текущее поведение Ф.18a). C — эталон только из FRAME/SECTION, не COMPONENT/INSTANCE.
- Acceptance: плагин не падает на unpublished компонентах, текст ошибки понятен или скрыт.

**Размер:** S (после развилки).

---

### Шаг 10 — **Cleanup Ф.18a: dead code + naming-debt + TEMP-логи**

**Источник:** Известные ограничения Ф.18a (пункты 6, 7, 8 в session-report-03.md).

**Что делать:**
- Удалить старую ветку `currentView='scanner', status='idle'` (`ReadyToScan`) из `App.tsx`.
- Удалить файл `src/ui/components/ReadyToScan.tsx` (если становится недостижимым).
- Удалить `tokenSource` / `tokenPolicy` из `src/shared/types.ts` и всех мест использования (R3 cleanup).
- Удалить TEMP-логи `console.log('[BUG-FIX-DEBUG]', ...)` в `src/sandbox/detector.ts`, `src/sandbox/exampleParser.ts`.
- Переименовать `seenIds` → `seenKeys` в `src/sandbox/exampleParser.ts:pushUniqueSlot`.
- Acceptance: `grep -rn 'tokenSource\|tokenPolicy\|BUG-FIX-DEBUG\|seenIds' src/` → пусто.

**Размер:** S.

---

### Шаг 11 — **«ReadyToScan judgment»** — решение по `ReadyToScan` после Ф.18a

**Источник:** связано с шагом 10 (cleanup), но требует отдельного решения PO.

**Что делать (после решения PO):**
- Развилка: A — удалить полностью (R3 cleanup, поглощается шагом 10). B — оставить как опциональный «Confirm and scan» экран между example и scanner. C — переосмыслить как «Settings: scan parameters» (override scope/categories на лету).
- Связано с UX-флоу плагина: в текущем `currentView='example'` отсутствует промежуточный confirm-экран. Это сознательный выбор Ф.18a, но в v1.0 PO может захотеть вернуть.

**Размер:** XS (если A) до S (если B/C).

---

### Шаг 12 — **Регрессионный QA-прогон тест-матрицы 6×3×3×2**

**Источник:** scope-cap Ф.18a (раздел 7, шаг 18.16).

**Что делать:**
- 6 типов нарушений × 3 ДС (Local/Connected/Both) × 3 scope (Selection/Section/Page) × 2 темы (Light/Dark) = 108 ячеек.
- Прогон выполняет `@qa` после R4 (темизация) и R5 (cleanup search) — иначе матрица невалидна.
- Acceptance: 0 регрессий относительно Ф.17/Ф.18a baseline. Все известные ограничения из session-report-03.md либо исправлены, либо явно зафиксированы как known issues v1.0.

**Размер:** L (фактический прогон + баг-репорты + фиксы по ходу).

---

### Шаг 13 — **Финальный релиз `v0.18.0`**

**Источник:** scope-cap Ф.18a (раздел 7, шаг 18.17).

**Что делать:**
- `@release-scribe`: bump в трёх местах (`package.json`, `manifest.json` если содержит, `aboutVersion` в `strings.ts`) — `0.18.0-alpha` → `0.18.0`.
- `npm run build`, замер бандлов, атомарный коммит `v0.18.0 — verification example flow + multi-slot ranking`.
- Push на `origin/main` — только с явным «✅ пушим v0.18.0» от PO.
- Тег `v0.18.0` (запрашивает PO).

**Размер:** XS.

---

## 3. Что НЕ входит в Ф.18b

- **R2 — Multi-example.** В v1.1 после фидбэка по v1.0.
- **DTCG-импорт.** v1.1.
- **Severity-градация нарушений.** v1.1.
- **Submission в Figma Community.** Ф.20.
- **Pre-release tuning текстов промпта.** Ф.19.

---

## 4. Открытые места без данных

- **Решение PO по R4** (темо-aware в v1.0 или v1.1) — нужно явно от PO в начале Ф.18b.
- **Решение PO по R1** (A/B/C bulk-undo) — нужно явно в момент сборки шага 3.
- **Решение PO по Q2** (поведение пустого candidates в дропдауне) — нужно для шага 5.
- **Скриншот ошибки от PO** для R6 — нужно для шага 9.
- **Решение PO по «ReadyToScan judgment»** — нужно для шага 11.

---

## 5. Граф зависимостей

```
Шаг 1 (Spacing/radius)  ──┐
Шаг 2 (R4 темы)          ──┼──► Шаг 12 (QA-матрица) ──► Шаг 13 (релиз v0.18.0)
Шаг 3 (R1 bulk-undo)     ──┤
Шаг 4 (Q1 frame-as-icon) ──┤
Шаг 5 (Q2 пустой dropdown)──┤
Шаг 6 (Q3 stroke полный) ──┤
Шаг 7 (Q5 minify)        ──┤
Шаг 8 (R5 search cleanup)──┤
Шаг 9 (R6 code connect)  ──┤
Шаг 10 (cleanup tech-debt)──┤
Шаг 11 (ReadyToScan)     ──┘
```

Шаги 1–11 параллелизуемы по разным исполнителям (`@backend` / `@ui-engineer`) после получения решений PO. Шаг 12 — strict-after всех остальных. Шаг 13 — strict-after шага 12.

---

## 6. Что делает `@lead-architect` при старте Ф.18b

1. Прочитать этот backlog целиком.
2. Прочитать `context/sessions/session-report-03.md` (контекст закрытия Ф.18a).
3. Запросить у PO решения по R4, R1, Q2, R6 (R6 — скриншот), «ReadyToScan judgment» через `ask_user_input_v0`.
4. Сформулировать развилки `@lead-architect` для шагов 1 (Spacing/radius taxonomy) и 6 (ScannedStroke vs paintTarget).
5. Собрать step-документ `context/sprints/F18b-step.md` с атомарными шагами по skill `step-format`.
6. Передать первый шаг исполнителю.

Этот backlog после старта Ф.18b остаётся в репозитории как след планирования — не удалять, не обновлять (история сборки).
