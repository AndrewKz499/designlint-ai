# DesignLint AI — Project Constitution

> Этот файл читается Claude Code при каждом запросе. Держи его компактным.
> Подробности по любой роли — в `.claude/agents/<role>.md` (карты самодостаточные).

## 1. Проект

**DesignLint AI** — Figma-плагин для анализа использования дизайн-токенов.
Находит нарушения (hardcoded colors, detached styles, missing text styles и др.),
предлагает фиксы из существующих токенов, при подключённом Gemini API даёт
текстовые объяснения каждой рекомендации.

- **Статус:** подготовка к v1.0 для Figma Community.
- **Текущая версия:** см. `package.json` → `version`.
- **Технологический стек:** TypeScript + React (UI) + Figma Plugin API (sandbox) + Vite/esbuild (сборка) + Gemini API (опционально).
- **Архитектура:** трёхслойная — `src/sandbox/` (логика плагина), `src/ui/` (React UI в iframe), `src/shared/` (общие типы и строки).

## 2. Карта проекта

```
designlint-ai/
├── src/sandbox/    ← логика Figma Plugin API (@backend / Sandbox Engineer)
├── src/ui/         ← React UI в iframe (@ui-engineer / UI Engineer)
│   ├── components/ui/   ← дизайн-система (@ui-engineer)
│   └── tokens.ts        ← палитра, типографика (@ui-engineer)
├── src/shared/     ← types.ts (контракт PluginMessage), strings.ts
├── scripts/        ← билд-скрипты (@release-scribe / Release Scribe)
├── dist/           ← результат сборки (не редактируется руками)
├── manifest.json   ← манифест плагина (@release-scribe + Product Owner)
├── package.json    ← зависимости и версия (@release-scribe)
├── context/        ← знания проекта (читать перед задачей)
│   ├── glossary/   ← Glossary, lifecycles, test-matrices, user-flows
│   ├── architecture/  ← антипаттерны, ADR (заполняется по мере проекта)
│   └── sessions/   ← отчёты сессий Ф.9–Ф.14 (исторический контекст)
├── logs/           ← runtime-телеметрия плагина (в .gitignore)
└── .claude/
    ├── agents/     ← 5 субагентов (см. раздел «Маршрутизация»)
    ├── commands/   ← slash-команды (см. раздел 3.5)
    └── skills/     ← кастомные skills
```

## 3. Команда агентов

Пять субагентов в `.claude/agents/`. Каждая карта самодостаточна.

| Субагент | Роль |
|---|---|
| `lead-architect` | Lead Architect: разведка (impact map, симметрия `PluginMessage`), стратегические решения (выбор A/B, формат шагов, объём v1.0/v1.1), продуктовые метрики |
| `backend` | Sandbox Engineer: правки `src/sandbox/*.ts` и `src/shared/types.ts` |
| `ui-engineer` | UI Engineer: правки всего `src/ui/*` — экраны, дизайн-система (`components/ui/*`), токены (`tokens.ts`), `aiClient.ts`, шрифты |
| `qa` | QA Inspector: тест-матрицы, баг-репорты, регрессионные чеклисты, runtime-логи, Figma MCP |
| `release-scribe` | Release Scribe: git-операции, версии, билды, отчёты сессий, глоссарий, ADR, README, submission |

## 3.5. Slash-команды

Тонкие обёртки над агентами для частых ритуалов — автоматизация связок из раздела «Порядок при комплексных шагах». Файлы команд лежат в `.claude/commands/`. Команды не дублируют логику ролей и `.claude/skills/*/SKILL.md` — только оркестрируют вызовы.

| Команда | Когда использовать | Что делает |
|---|---|---|
| `/scout <задача>` | Перед нелинейным изменением (3+ файла, развилка A/B, новый `PluginMessage`) | `@lead-architect` строит impact map по skill `impact-map`; при развилке — выбирает сам или эскалирует к Product Owner |
| `/step <описание>` | Когда нужна готовая постановка задачи в формате проекта | `@lead-architect` формулирует шаг по skill `step-format` (6 обязательных полей) |
| `/sprint <задача>` | Полный цикл изменения от идеи до коммита | Разведка и выбор → исполнитель → QA → коммит и доки. Останавливается перед действиями, требующими «✅» от Product Owner |
| `/qa-check` | После шага исполнителя, перед коммитом | `@qa` прогоняет acceptance criteria + регрессию из последних 2 фаз; баг-репорт по skill `bug-report` |
| `/close-session` | В конце рабочей сессии | `@release-scribe` собирает отчёт по skill `session-report` с git log своими руками и запросом ограничений у `@qa` |

**Команды — это удобство, не замена ролей.** Если ситуация не покрыта командой — работай через явное `@<агент>` как раньше. Если в команде нашлось расхождение с картой роли или SKILL.md — правда в роли и skill, команду нужно обновить.

## 4. Маршрутизация задач

### Правила делегирования (главный Claude → субагент)

- **Разведка перед нелинейным изменением (3+ файла, развилка A/B, новый тип `PluginMessage`)** → `@lead-architect`
- **Выбор варианта A/B, приоритизация v1.0/v1.1, формат шагов, продуктовые метрики** → `@lead-architect`
- **Правки в `src/sandbox/*` или `src/shared/types.ts`** → `@backend`
- **Правки во всём `src/ui/*` — экраны (`App.tsx`, `components/*.tsx`), дизайн-система (`components/ui/*`), токены (`tokens.ts`), `aiClient.ts`, шрифты** → `@ui-engineer`
- **Тест-матрицы, баг-репорты, регрессия, скриншоты, известные ограничения, runtime-логи из `logs/`** → `@qa`
- **`git add/commit/push`, `git rebase`, изменение `package.json`/`manifest.json`/`aboutVersion`, билды, замер бандла, отчёты сессий, глоссарий, ADR, README, README_TESTER, submission-артефакты** → `@release-scribe`

### Когда НЕ делегировать (главный Claude отвечает сам)

- Косметика в одном файле (одна строка / цвет / опечатка) — без `@lead-architect`, сразу нужный исполнитель.
- Простой вопрос о коде, ответ из карты агента в `.claude/agents/<role>.md` или из глоссария.
- Уточнение терминологии — посмотреть `context/glossary/Glossary.md`.

### Порядок при комплексных шагах

1. `@lead-architect` — разведка (impact map), выбор варианта при развилке (или эскалация к Product Owner), формулировка шага в формате проекта.
2. Исполнитель (`@backend` / `@ui-engineer`) — правки.
3. `@qa` — проверка по acceptance criteria + регрессия из последних 2 фаз.
4. `@release-scribe` — атомарный коммит с правильной версией; обновление глоссария при появлении новых терминов.

## 5. Архитектурные принципы (must-follow)

Эти принципы зафиксированы по итогам Ф.11–Ф.14. Нарушение требует обоснования через `@lead-architect`.

- **`figma.commitUndo` — ДО мутации**, не после. Иначе `Cmd+Z` ломается.
- **Симметрия `PluginMessage`:** на каждое сообщение от UI должен быть ответ из sandbox (включая ветки `catch`). Пример прецедента — `fix-violation` без `fix-complete` в catch до 12.7.4.1.
- **Derived state вместо `useState + useEffect`:** если значение можно вычислить из props/state, не дублируй его в `useState` с `useEffect`-синхронизацией.
- **Кэш на `useRef`, не `useState`:** для значений, которые не должны вызывать ре-рендер.
- **Атомарные коммиты:** один логический блок = один коммит. Грязный stage разбирается через `git add -p`.
- **Версия в трёх местах одновременно:** `package.json`, `manifest.json` (если содержит), `aboutVersion` в `src/shared/strings.ts`.
- **Жёсткое переименование токенов без алиасов:** при переименовании дизайн-токена правится сразу во всех местах. Алиасы запрещены — они порождают технический долг.
- **Готовые компоненты дизайн-системы:** в `src/ui/components/ui/` (`Button`, `Checkbox`, `Input` и т.д.) — единственный источник UI-примитивов. UI-engineer не создаёт нативные `<button>` или собственные стилизованные кнопки в продуктовом коде.
- **Sandbox без optional chaining и nullish coalescing:** в `src/sandbox/*` НЕ использовать `?.` (optional chaining) и `??` (nullish coalescing). Эти операторы транспилируются для старого ESM-таргета Figma worker с заметным overhead (~3x от ожидаемого размера). Используй классические проверки: `obj && obj.field`, `value !== null && value !== undefined ? value : fallback`, тернарники. Ограничение касается только sandbox — в `src/ui/*` современный синтаксис допустим, там таргет современнее. Зафиксировано после факта подшага Ф.18b.1.2 (2026-05-10): scanner `walkSpacing`+`walkRadius` дал +4.94 KB в `code.js` при прогнозе +1.2…1.8 KB из-за транспиляции `?.`/`??`.

## 6. Лимиты и эскалации

- **Эскалация к Product Owner:** объём v1.0/v1.1, конфликт принципов, новый публичный контракт плагина (`manifest.json`, разрешения), решение «откладываем в v1.1».
- **Запрещённые данные:** Google API key (`google-api-key` в `clientStorage`), любые секреты, содержимое реальных Figma-файлов клиентов вне обезличенных тестовых сценариев.
- **`git push` / `figma plugin publish`:** только с явным «✅ публикуем» от Product Owner.
- **`force-push`:** только на feature-ветку, только с явным разрешением. На `origin/main` — никогда.

## 7. Среды исполнения

| Кто | Где работает физически |
|---|---|
| `@backend`, `@ui-engineer`, `@release-scribe` | Claude Code в терминале / VS Code |
| `@lead-architect` | Claude Code (читает код локально) |
| `@qa` | Claude Code (читает логи из `logs/` через Filesystem) + Figma MCP (read-only к Figma-файлам, когда подключён) |
