# DesignLint AI — Project Constitution

> Этот файл читается Claude Code при каждом запросе. Держи его компактным.
> Подробности по любой роли — в `context/roles/N_Имя.md`.

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
├── src/sandbox/    ← логика Figma Plugin API (Backend / Sandbox Engineer)
├── src/ui/         ← React UI в iframe (Frontend / UI Engineer)
│   ├── components/ui/   ← дизайн-система (Designer / Visual System Designer)
│   └── tokens.ts        ← палитра, типографика (Designer)
├── src/shared/     ← types.ts (контракт PluginMessage), strings.ts
├── scripts/        ← билд-скрипты (DevOps / Release Steward)
├── dist/           ← результат сборки (не редактируется руками)
├── manifest.json   ← манифест плагина (DevOps + Project Lead)
├── package.json    ← зависимости и версия (DevOps)
├── context/        ← знания проекта (читать перед задачей)
│   ├── roles/      ← 9 технических карт ролей агентов
│   ├── glossary/   ← глоссарий продукта
│   ├── architecture/  ← антипаттерны, ADR (заполняется по мере проекта)
│   └── sessions/   ← отчёты сессий Ф.9–Ф.14 (исторический контекст)
├── logs/           ← runtime-телеметрия плагина (в .gitignore)
└── .claude/
    ├── agents/     ← 9 субагентов (см. раздел «Маршрутизация»)
    └── skills/     ← кастомные skills
```

## 3. Команда агентов

Девять субагентов в `.claude/agents/`. Полные технические карты — в `context/roles/`.

| Субагент | Роль | Карта |
|---|---|---|
| `project-lead` | Product Orchestrator: приоритизация, развилки A/B, формат шагов | `context/roles/0_Project_Lead.md` |
| `architect` | Architecture Scout: разведка перед изменением, impact analysis, симметрия протокола | `context/roles/2_Architect.md` |
| `backend` | Sandbox Engineer: правки `src/sandbox/*.ts` и `src/shared/types.ts` | `context/roles/3_Backend.md` |
| `frontend` | UI Engineer: правки `src/ui/App.tsx`, `src/ui/components/*.tsx`, `src/ui/aiClient.ts` | `context/roles/4_Frontend.md` |
| `designer` | Visual System Designer: правки `src/ui/tokens.ts` и `src/ui/components/ui/*.tsx` | `context/roles/5_Designer.md` |
| `qa` | QA Inspector: тест-матрицы, баг-репорты, регрессионные чеклисты | `context/roles/6_Quality_Assurance.md` |
| `devops` | Release Steward: git-операции, версии, билды, размер бандла | `context/roles/7_DevOps.md` |
| `doc-writer` | Documentation Steward: отчёты сессий, глоссарий, ADR, README | `context/roles/8_Doc_Writer.md` |
| `analytics` | Product Analytics Steward: тренды по сессиям, метрики проекта | `context/roles/1_Analytics.md` |

## 4. Маршрутизация задач

### Правила делегирования (главный Claude → субагент)

- **Разведка перед нелинейным изменением (3+ файла, развилка A/B, новый тип `PluginMessage`)** → `@architect`
- **Правки в `src/sandbox/*` или `src/shared/types.ts`** → `@backend`
- **Правки в `src/ui/App.tsx`, `src/ui/components/*.tsx` (кроме `components/ui/`), `src/ui/aiClient.ts`** → `@frontend`
- **Правки в `src/ui/tokens.ts` или `src/ui/components/ui/*` (дизайн-система)** → `@designer`
- **Тест-матрицы, баг-репорты, регрессия, скриншоты, известные ограничения** → `@qa`
- **`git add/commit/push`, `git rebase`, изменение `package.json`/`manifest.json`/`aboutVersion`, билды, замер бандла** → `@devops`
- **Отчёты сессий, глоссарий, ADR, README, README_TESTER** → `@doc-writer`
- **Тренды по сессиям, прогресс к v1.0, аналитика долгов v1.1** → `@analytics`
- **Развилки, влияющие на объём v1.0/v1.1, спорные приоритеты, конфликт принципов** → `@project-lead`

### Когда НЕ делегировать (главный Claude отвечает сам)

- Косметика в одном файле (одна строка / цвет / опечатка) — без `@architect`, сразу нужный исполнитель.
- Простой вопрос о коде, ответ из `context/roles/` или из глоссария.
- Уточнение терминологии — посмотреть `context/glossary/1_Глоссарии_.md`.

### Порядок при комплексных шагах

1. `@architect` — разведка: какие файлы, контракты, риски, варианты A/B.
2. `@project-lead` — выбор варианта (если развилка A/B).
3. Исполнитель (`@backend` / `@frontend` / `@designer`) — правки.
4. `@qa` — проверка по acceptance criteria.
5. `@devops` — атомарный коммит с правильной версией.
6. `@doc-writer` — обновление отчёта сессии и глоссария при появлении новых терминов.

## 5. Архитектурные принципы (must-follow)

Эти принципы зафиксированы по итогам Ф.11–Ф.14. Нарушение требует обоснования через `@architect`.

- **`figma.commitUndo` — ДО мутации**, не после. Иначе `Cmd+Z` ломается.
- **Симметрия `PluginMessage`:** на каждое сообщение от UI должен быть ответ из sandbox (включая ветки `catch`). Пример прецедента — `fix-violation` без `fix-complete` в catch до 12.7.4.1.
- **Derived state вместо `useState + useEffect`:** если значение можно вычислить из props/state, не дублируй его в `useState` с `useEffect`-синхронизацией.
- **Кэш на `useRef`, не `useState`:** для значений, которые не должны вызывать ре-рендер.
- **Атомарные коммиты:** один логический блок = один коммит. Грязный stage разбирается через `git add -p`.
- **Версия в трёх местах одновременно:** `package.json`, `manifest.json` (если содержит), `aboutVersion` в `src/shared/strings.ts`.
- **Жёсткое переименование токенов без алиасов:** при переименовании дизайн-токена правится сразу во всех местах. Алиасы запрещены — они порождают технический долг.
- **Готовые компоненты дизайн-системы:** в `src/ui/components/ui/` (`Button`, `Checkbox`, `Input` и т.д.) — единственный источник UI-примитивов. Frontend не создаёт нативные `<button>` или собственные стилизованные кнопки.

## 6. Лимиты и эскалации

- **Эскалация к Project Lead:** объём v1.0/v1.1, конфликт принципов, новый публичный контракт плагина (manifest, разрешения), решение «откладываем в v1.1».
- **Запрещённые данные:** Google API key (`google-api-key` в `clientStorage`), любые секреты, содержимое реальных Figma-файлов клиентов вне обезличенных тестовых сценариев.
- **`git push` / `figma plugin publish`:** только с явным «✅ публикуем» от Project Lead.
- **`force-push`:** только на feature-ветку, только с явным разрешением. На `origin/main` — никогда.

## 7. Среды исполнения

| Кто | Где работает физически |
|---|---|
| `backend`, `frontend`, `designer`, `devops` | Claude Code в терминале / VS Code |
| `architect` | Claude Code (читает код локально) |
| `qa` | Claude Code (читает логи из `logs/` через Filesystem) + Figma MCP (read-only к Figma-файлам, когда подключён) |
| `project-lead`, `doc-writer`, `analytics` | Claude.ai чат с Project Files (стратегический уровень) |
