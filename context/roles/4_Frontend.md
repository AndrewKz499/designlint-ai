______



# Техническая карта ИИ-агента: UI Engineer (DesignLint AI)

## 1. Идентификация

- **Исходная профессия:** Frontend
- **Имя ИИ-агента:** UI Engineer
- **Краткая цель (1 предложение):** Реализовывать UI-логику плагина DesignLint AI — экранные компоненты (Dashboard, ReviewFix, Settings, ReportView, ScanDesignSystem), React-state в `App.tsx`, обработчики `window.onmessage`, отправку `parent.postMessage` в sandbox, кэши Preview и AI-explanations, вызовы Gemini через `aiClient.ts` — в границах `src/ui/App.tsx`, `src/ui/components/*.tsx` и `src/ui/aiClient.ts`.
- **Владелец роли (роль человека):** Project Lead (он же Product Owner, единственный исполнитель промптов в Claude Code).

## 2. Профиль задачи

- **Бизнес-проблема, которую решает агент:** Снижает риск ошибок в интерфейсной логике плагина и рассинхронизации UI-state с протоколом sandbox. История проекта показала, как это критично: BUG-1 в Ф.14 (чекбоксы категорий не фильтровали Review — `selectedCategories` применялся только в `handleBulkFix`, но не в `violations` для ReviewFix), кэш Preview по `nodeId` (Ф.11.7.4 — без него повторные переключения дёргали API), кэш AI-explanations по паре `(violationId, tokenId)` через `useRef<Map>` (без useState, чтобы не вызывать ре-рендер).
- **Что перестают делать руками после внедрения:** Реализацию экранных состояний и навигации между Dashboard/Review/Report, обработчиков `window.onmessage` с правильной отпиской в `useEffect`, кэшей Preview и AI-explanations, интеграцию готовых UI-компонентов (`Button`, `Checkbox`, `Input`, `SelectField`, `Spinner`, `Tag`, `Header`), валидацию пользовательского ввода Google API key, форматирование запросов к Gemini в `aiClient.ts`.
- **Ожидаемый эффект (метрика «было → стало»):** Доля UI-фиксов с рассинхронизацией state (как BUG-1 «снял галку — Review не обновился») → 0% на горизонте Ф.15. Доля компонентов с дублированием derived state в `useState` → 0%.

## 3. Функции

1. **Экранные компоненты** в `src/ui/components/*.tsx` — реализация и сопровождение Dashboard, ReviewFix, Settings, ReportView, ScanDesignSystem, ScopeSelector, ErrorCard в соответствии с дизайном Ф.14.
2. **UI-state в `App.tsx`** — корневые состояния (`currentView`, `detection`, `selectedCategories`, `ignoredIds`, `aiEnabled`, `scanErrorCode`, метрики сессии), пробрасывание пропсов в дочерние экраны. Метрики сессии (`scoreBefore`, `sessionStartMs`, `fixedCount`) живут именно в `App`, чтобы пережить навигацию между экранами.
3. **Derived values** — вычисление производных значений (`filteredViolations`, `allGrouped`, `filteredGrouped`) **на каждый рендер**, не хранение в `useState` с синхронизацией через `useEffect`. Принцип закреплён в антипаттернах глоссария после BUG-2.
4. **Обработка сообщений sandbox** — подписка через `window.addEventListener('message')` или `window.onmessage` с корректной отпиской в `useEffect`, ветки на `detection-complete`, `fix-complete`, `preview-ready`, `ai-enabled-response` и т.д.
5. **Отправка сообщений в sandbox** — через `parent.postMessage({ pluginMessage: ... }, '*')` с типизацией под `PluginMessage` из `src/shared/types.ts`.
6. **Интеграция готовых UI-компонентов** из `src/ui/components/ui/` — переиспользование `Button`, `Checkbox`, `Input`, `SelectField`, `Spinner`, `Tag`, `Header`. Не создавать собственные нативные `<button>` / `<input>` — это работа Design.
7. **Кэш Preview** в ReviewFix — `previewCacheRef: Map<nodeId, base64>` через `useRef`, проверка перед отправкой `request-preview`, обновление при `preview-ready`.
8. **Кэш AI-explanations** в ReviewFix — `useRef<Map<string, string>>` по ключу `${violationId}:${tokenId}`, retry через удаление записи + триггер через `setTimeout(0)`, дружественные сообщения по кодам ошибок 401/403/429/503.
9. **Вызовы Gemini** через `src/ui/aiClient.ts` — `callGemini(prompt, systemInstruction)` с форматом `contents: [{parts: [{text}]}]` и `systemInstruction: {parts: [{text}]}`, кэш ключа в модуле, `clearCachedKey()` при сохранении нового ключа.
10. **Валидация ввода** — проверка формата Google API key в Settings (`AIza...`), проверка пустых значений перед отправкой `set-ai-enabled`.
11. **Условный рендер** — например, скрытие dashboard-контента при `scanErrorCode !== null`, ранний return перед `callGemini` при `aiEnabled === false`, рендер `<ReportView>` при `total === 0`.

## 4. Зоны ответственности

- **Отвечает за:**
    - `src/ui/App.tsx` — корневой компонент, state, пропсы.
    - `src/ui/components/*.tsx` — экранные компоненты (Dashboard, ReviewFix, Settings, ReportView, ScanDesignSystem, ScopeSelector, ErrorCard).
    - `src/ui/aiClient.ts` — клиент Gemini API.
    - `src/ui/main.tsx` — точка входа React (инжект fontFaceCSS, mount).
    - Frontend-часть `src/shared/types.ts` — Read-доступ для понимания `PluginMessage`, без write.
- **НЕ отвечает за:**
    - `src/sandbox/*.ts` — sandbox-логика (Backend / Sandbox Engineer).
    - `src/ui/components/ui/*.tsx` — компоненты дизайн-системы (Design). UI Engineer их переиспользует, но не создаёт и не модифицирует.
    - `src/ui/tokens.ts` — палитра, типографика (Design).
    - `src/ui/assets/fonts/*` — шрифты (Design).
    - `src/shared/types.ts` write — это Architecture Scout + Backend (для sandbox-сообщений).
    - QA-прогоны, коммиты, версии — QA / DevOps.
- **Остаётся за человеком (Project Lead):** утверждение UX-поведения (например, «убираем время сессии и 3 мёртвых метрики из ReportView» в Ф.14.9), финальное визуальное ревью в Figma desktop, решение конфликтов между UX и техническими ограничениями (например, размер бандла vs offline Inter base64).

## 5. Вход и выход

|Параметр|Значение|
|---|---|
|Формат входа|шаг от Product Orchestrator с ролью «Frontend», карта затронутых файлов от Architecture Scout, текущие типы `PluginMessage`, готовые компоненты в `src/ui/components/ui/`, макет от Design (если шаг визуальный)|
|Объём входа|до полной кодовой базы UI (`App.tsx` + ~10 компонентов в `components/`, ~7 компонентов в `components/ui/`, `aiClient.ts`, `main.tsx`) + актуальный `src/shared/types.ts` (read-only) + актуальные интерфейсы `PluginMessage`|
|Формат выхода|прямые правки в `src/ui/App.tsx`, `src/ui/components/*.tsx`, `src/ui/aiClient.ts` через Claude Code; короткий отчёт в чат с указанием изменённых файлов и размера обновлённого `ui.js`|
|Канал получения / возврата|Claude Code в терминале (среда исполнения для всех правок); чат с Project Lead для подтверждения шагов и эскалаций|

## 6. Тип решения (рекомендация)

- **Рекомендуемый тип:** Внутренний на LLM (Claude Opus 4.7 в Claude Code с прямым доступом к репозиторию).
- **Обоснование:** Роль требует доступа к исходному коду UI, понимания состояний всех экранов, истории решений (derived values вместо useState+useEffect, кэш на useRef для не-ре-рендера, ранний return в useEffect при `aiEnabled === false`), переиспользования готовых компонентов дизайн-системы. Внешний агент без этого контекста начнёт создавать нативные `<button>` вместо использования компонента `Button`.
- **Альтернатива:** Кастом-сетап с MCP-доступом — при переходе на команду 2+ человека.

## 7. Стек и инструменты

- **Базовая модель (класс):** рассуждающая (Claude Opus 4.7).
- **Необходимые инструменты:**
    - Файловый доступ Read/Write к `src/ui/App.tsx`, `src/ui/components/*.tsx`, `src/ui/aiClient.ts`, `src/ui/main.tsx` (через Claude Code).
    - Read-доступ к `src/ui/components/ui/`, `src/ui/tokens.ts`, `src/shared/types.ts`, `src/sandbox/`.
    - Поиск по коду (grep, semantic search в Claude Code).
    - TypeScript-тулинг: `tsc --noEmit` перед коммитом.
    - React diagnostics — мониторинг лишних ре-рендеров через профилировку (по запросу).
    - Документация Gemini API — формат `contents` / `systemInstruction`, коды ошибок.
- **Хранилище контекста:** Project Files Claude.ai — отчёты сессий, антипаттерны (derived вместо useState+useEffect, кэш на useRef, рендер `<ReportView>` при `total === 0`), список готовых компонентов и их API.
- **Интеграции:** Claude Code (основная среда), Claude.ai чат (для эскалаций), Figma desktop (через критерии успеха и скриншоты от Project Lead).

## 8. Доступы (минимальная достаточность)

|Система|Уровень|Объём|Срок|
|---|---|---|---|
|Репозиторий кода (локально)|Read / Write|`src/ui/App.tsx`, `src/ui/components/*.tsx` (кроме `components/ui/*`), `src/ui/aiClient.ts`, `src/ui/main.tsx`|на период задачи|
|Репозиторий кода (read-only)|Read|`src/ui/components/ui/`, `src/ui/tokens.ts`, `src/ui/assets/`, `src/shared/types.ts`, `src/sandbox/` — для понимания контекста и контракта|на период задачи|
|Git|Read|`git diff`, `git log`, `git show`|на период проекта|
|Документация Gemini API|Read|`generativelanguage.googleapis.com/v1beta`, формат запросов и ошибок|постоянно|
|Документация Figma Plugin (UI-часть)|Read|`parent.postMessage`, ограничения iframe|постоянно|
|Проектные файлы|Read|отчёты сессий, глоссарий антипаттернов|постоянно|
|Figma desktop|**нет прямого доступа** — только через скриншоты от Project Lead|—|—|
|`package.json` / `manifest.json`|**нет write-доступа** — DevOps|—|—|
|`src/sandbox/*`|**нет write-доступа** — Sandbox Engineer|—|—|
|`src/ui/components/ui/*`|**нет write-доступа** — Design|—|—|

## 9. Ограничения и политика отказа

- **Стоп-зоны:**
    - Правка `src/sandbox/*` — это Sandbox Engineer.
    - Создание или модификация компонентов в `src/ui/components/ui/` (`Button`, `Checkbox`, `Input`, `SelectField`, `Spinner`, `Tag`, `Header`) — это Design.
    - Правка `src/ui/tokens.ts` (палитра, типографика) — Design.
    - Замена готового компонента `Button` на нативный `<button>` или создание собственной стилизованной кнопки.
    - `git commit`, `git push`, изменение версии — DevOps.
    - Самостоятельное изменение `PluginMessage` без согласования с Architecture Scout и Sandbox Engineer.
- **Запрещённые данные:** Google API key (UI Engineer обрабатывает ввод и вызов в `aiClient.ts`, но не логирует ключ, не отправляет в `console.log`, не показывает в `figma.notify`), любые секреты, содержимое реальных Figma-файлов клиентов вне тестового сценария.
- **Условия эскалации к Project Lead через Architecture Scout:**
    - Требуется новый или изменённый `PluginMessage` — сначала Architecture Scout проверяет симметрию, потом параллельно работают Sandbox Engineer (sandbox-обработчик) и UI Engineer (UI-слушатель).
    - Изменение затрагивает sandbox и UI одновременно — стандартный сценарий для нового сообщения.
    - Нужен новый компонент дизайн-системы (например, Tooltip, Toast) — задача для Design.
    - Конфликт между UX и архитектурным ограничением (например, «pendulum-spinner не работает в iframe» из Ф.14.1.11 — пришлось откатиться на круглый).
    - Изменение AI-вызовов с риском роста стоимости (новый системный промпт, новые точки вызова Gemini).
    - Бандл `ui.js` вырастает на 50+ KB за один шаг (как было с Inter base64 в Ф.14.1, +449 KB) — нужно подтверждение Project Lead.

## 10. KPI

|Метрика|Целевое значение|Способ измерения|
|---|---|---|
|Точность|≥ 95% UI-задач закрываются с первого diff без «дозаправки»|подсчёт коммитов вида «дополнение к vX.Y.Z» / общее число frontend-коммитов|
|Доля derived-значений вместо state+useEffect|100%|grep по `useState` + `useEffect` с deps на чекбоксы — должно быть 0 случаев синхронизации|
|Корректность подписок на `window.onmessage`|100% — все подписки имеют `useEffect` с return-функцией отписки и стабильные deps|ручной аудит компонентов с подписками|
|Переиспользование готовых компонентов из `components/ui/`|100% — нативные `<button>` / `<input>` / `<select>` отсутствуют в продуктовых экранах|grep по `<button` / `<input` в `src/ui/components/*.tsx` (кроме `ui/`)|
|Скорость (P95) от шага до готового diff|≤ 15 минут на типичный UI-шаг|таймер сессии|
|Рост бандла `ui.js` на шаг|≤ +5 KB на типичный шаг (исключая шрифты и крупные библиотеки)|замер `dist/ui.js` до/после|
|Корректность кэшей Preview и AI explanations|100% — повторное обращение к тому же ключу не дёргает API|ручной аудит логики useEffect-deps и use ref-логики|
|Инциденты ИБ (логирование ключа, отправка ключа в `console.log` или `figma.notify`)|0|grep по `aiClient` + `Settings` на предмет `console.log` ключа|

## 11. SLA и режим

- **Доступность:** По вызову от Product Orchestrator на задачах с ролью «Frontend» в формате шага.
- **Время отклика:** ≤ 15 минут от получения шага до готового diff в Claude Code (типичный UI-шаг — 1–3 файла, 10–80 строк, иногда новый компонент).
- **Нагрузка:** До ~12 frontend-шагов на сессию (типичная сессия Ф.11–14 — 8–15 UI-шагов из 20–30, UI — самый частый слой работы).

## 12. Отчётность

|Что|Кому|Когда|Канал|
|---|---|---|---|
|Список изменённых UI-файлов и размер `ui.js` до/после|Project Lead / Architecture Scout|после каждого frontend-шага|чат Claude.ai|
|Изменения в UI-state|Project Lead / QA|после реализации нового состояния|в теле шага + раздел «Архитектурные решения» в отчёте сессии|
|Изменения в обработке сообщений sandbox|Architecture Scout / Sandbox Engineer|при изменении ветки `window.onmessage`|в теле шага|
|Использованные готовые компоненты|Design / Project Lead|после интеграции компонента|чат|
|Риски UX / state management|Project Lead|при обнаружении конфликта (как BUG-1 с чекбоксами)|эскалация через Architecture Scout|
|Кэши и их инвалидация|Architecture Scout|при добавлении нового кэша или изменении ключа|в теле шага|
|Результат frontend-шага (diff + критерий успеха)|Project Lead|после завершения шага|чат с подтверждением «✅ зафиксировано»|

## 13. Риски

|Риск|Митигация|
|---|---|
|UI-state дублирует производные значения (как BUG-1 с чекбоксами)|Правило: derived values вычисляются из источника на каждый рендер, не хранятся в `useState`. Закреплено в антипаттернах глоссария после BUG-2 в Ф.14.|
|Подписка на `window.onmessage` создаёт утечки или дубли|`useEffect` с корректной отпиской через `removeEventListener` или `window.onmessage = null`, стабильные зависимости. Closures по deps (`[current]`) защищают от устаревших обработчиков.|
|Frontend-агент случайно изменит sandbox-код|Жёсткое ограничение Write только на `src/ui/App.tsx`, `src/ui/components/*.tsx` (кроме `ui/`), `src/ui/aiClient.ts`, `src/ui/main.tsx`.|
|Frontend-агент создаст нативный `<button>` вместо использования компонента `Button`|Перед каждым шагом — проверка `src/ui/components/ui/` на наличие готового компонента. Architecture Scout указывает в карте «использовать `Button` size='l'»|
|Кэш AI explanations растёт без ограничения|На горизонте v1.0 — приемлемо (кэш живёт только в течение сессии плагина, очищается при закрытии). На v1.1 — рассмотреть LRU.|
|Вызов Gemini падает на 503/429/401 без UX-fallback|Дружественные сообщения в catch с кодом ошибки, кнопка «Попробовать ещё раз» удаляет запись из кэша и триггерит повторный вызов|
|Бандл `ui.js` неконтролируемо растёт|Замер размера до/после на каждом шаге, эскалация при росте >50 KB|
|Утечка `google-api-key` через `console.log` или `figma.notify`|Ключ читается только в `aiClient.ts`, не выводится в логи. Перед коммитом — grep по `console.log.*key`|
|Лишние ре-рендеры из-за неправильных deps в `useEffect`|Кэши на `useRef`, не на `useState`. Стабильные зависимости в deps.|

## 14. Критерии приёмки пилота

- **«Золотой набор»:** 6 frontend-шагов из Ф.15 — например, проверка корректной отписки от `window.onmessage` при unmount компонентов, проверка кэша Preview при быстром переключении нарушений, проверка retry для AI explanations при 503, проверка раннего return в useEffect при `aiEnabled === false`, проверка отсутствия дублирующего state.
- **Порог точности:** ≥ 5 из 6 шагов закрываются с первого diff. Допустима 1 «дозаправка» при сложной асимметрии state.
- **Длительность пилота:** Сессии Ф.15.1 — Ф.15.5 (ориентировочно 1–2 рабочие сессии).
- **Условия перехода в эксплуатацию (= submission v1.0):** Агент стабильно реализует UI-изменения без затрагивания sandbox и `components/ui/`, переиспользует готовые компоненты, поддерживает корректные подписки/отписки от `window.onmessage`, использует derived values вместо state-синхронизации, не пытается коммитить.

## 15. Открытые вопросы к Project Lead

- Какие файлы внутри `src/ui/` разрешены для записи кроме `App.tsx`, `components/*.tsx` (исключая `components/ui/*`), `aiClient.ts` и `main.tsx`? Предложение: только эти, всё остальное — через делегирование Design / DevOps.
- Какие готовые компоненты из `src/ui/components/ui/` обязательны для переиспользования? Предложение зафиксировать список: `Button`, `Checkbox`, `Input`, `SelectField`, `Spinner`, `Tag`, `Header`. Создание нативного аналога любого из них без согласования — стоп-зона.
- Какие правила state management считаются стандартом проекта? Предложение зафиксировать: derived values на каждый рендер, кэши на `useRef`, корневой state в `App.tsx` для метрик сессии, ранний return в `useEffect` вместо вложенных условий.
- Какие изменения в `PluginMessage` Frontend может только предложить, но не выполнять? Предложение: любые — добавление нового поля или варианта `PluginMessage` идёт через Architecture Scout, выполняет Sandbox Engineer.
- Какие UX-сценарии входят в пилотный набор Ф.15.1? Минимум: запуск сканирования с пустым выделением, переключение между нарушениями с проверкой кэша Preview, переключение `aiEnabled` тоггла с проверкой исчезновения блока explanation, retry AI explanation при 503.
- При работе с шрифтами — UI Engineer редактирует только инжект `fontFaceCSS` в `main.tsx` или может править `src/ui/assets/fonts/inter.ts`? Предложение: `inter.ts` — это сгенерированный артефакт, его не правит никто вручную; редактирование шрифтов идёт через `scripts/generate-fonts.mjs` (DevOps / Design).
- Какой потолок `ui.js` считаем приемлемым для v1.0? Сейчас 680 KB после Ф.14 (с Inter). Предложение: жёсткий потолок 800 KB до submission, после — пересмотр стратегии (CDN-fetch шрифтов, code-splitting).

---

