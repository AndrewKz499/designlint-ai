# Ф.17 — AI-контракт: snapshot текущей реализации

> Дата снимка: 2026-05-10. Snapshot, без решений и предложений. Источники — код в `main` на момент снимка. Для расхождений с handoff revision 2 (`context/sprints/F17-component-aware-and-search-step.md`) использован маркер **РАСХОЖДЕНИЕ:**.

---

## 1. Точное место вызова

В кодовой базе ДВЕ точки вызова `callGemini()`:

### 1.1 ReportView — основной поток объяснения выбранного токена

- **Файл:** `src/ui/components/ReportView.tsx`
- **Функция:** компонент `ReportView`, useEffect-хук на смену `selectedTokenId / current / result / snapshot`.
- **Строки useEffect:** 158–279.
- **Строка вызова `callGemini`:** 250.

```tsx
// src/ui/components/ReportView.tsx, строки 158–279 (ключевое)
  // При смене выбранного токена — проверяем кэш, иначе запускаем AI
  useEffect(() => {
    if (current === null || selectedTokenId === null) return;
    if (!aiEnabled) { ... }
    if (!hasApiKey) { ... }
    const cacheKey = current.id + ':' + selectedTokenId;
    const cached = explanationsRef.current.get(cacheKey);
    if (cached) { setExplanation(cached); return; }

    // ... формирование prompt ...

    callGemini(
      [{ role: 'user', content: prompt }],
      'You are a designer assistant who explains design system token choices. Reply concisely and to the point, in English.',
      200,
      controller.signal
    )
      .then(text => { ... })
      .catch(err => { ... });

    return () => { controller.abort(); };
  }, [selectedTokenId, current, result, snapshot]);
```

### 1.2 Settings — health-check API-ключа

- **Файл:** `src/ui/components/Settings.tsx`
- **Строка вызова:** 54.

```tsx
// src/ui/components/Settings.tsx, строка 54
const text = await callGemini([{ role: 'user', content: 'Ответь одним словом: работает.' }], undefined, 32);
```

### 1.3 Объявление `callGemini`

- **Файл:** `src/ui/aiClient.ts`
- **Функция:** `callGemini`, строки 38–85.

> **РАСХОЖДЕНИЕ с handoff revision 2:** ожидание `src/ui/aiClient.ts → callGemini()` подтверждается. Ожидание «`src/ui/components/ReportView.tsx` (точка вызова после Ф.17.5)» подтверждается — useEffect 158–279 содержит вызов на строке 250, обогащение prompt componentContext-секцией реализовано на строках 199–242. Дополнительная точка вызова в `Settings.tsx:54` (health-check) handoff-документом не упоминается.

---

## 2. System prompt

В коде используется ровно ОДИН системный prompt (только в ReportView).

```text
You are a designer assistant who explains design system token choices. Reply concisely and to the point, in English.
```

Источник — `src/ui/components/ReportView.tsx`, строка 252 (литерал в аргументе `callGemini`).

В Settings (`src/ui/components/Settings.tsx:54`) systemPrompt передаётся как `undefined` — system instruction не отправляется.

---

## 3. User prompt template

В ReportView в коде ДВА разных шаблона user-prompt (взаимоисключающие, выбираются по форме `Violation`).

### 3.1 Шаблон A — для `current.candidates`-ветки (hardcoded_color, missing_text_style)

Источник — `src/ui/components/ReportView.tsx`, строки 183–188.

```ts
// tokenInfo = current.candidates.find(c => c.id === selectedTokenId)
prompt = 'Violation: ' + current.currentValue + ' on node "' + current.nodeName +
  '". Suggested token: "' + tokenInfo.name + '" with value ' + tokenInfo.value +
  '. Explain in 1-2 short sentences why this token fits. ' +
  'No preamble, get straight to the point. Reply in English.';
```

Plain-form шаблон с placeholder-ами:

```text
Violation: {{currentValue}} on node "{{nodeName}}". Suggested token: "{{tokenInfo.name}}" with value {{tokenInfo.value}}. Explain in 1-2 short sentences why this token fits. No preamble, get straight to the point. Reply in English.
```

### 3.2 Шаблон B — для suggestedToken-фолбэка (detached_style, similar_to_token)

Источник — `src/ui/components/ReportView.tsx`, строки 189–194.

```ts
prompt = 'On node "' + current.nodeName + '" the value ' + current.currentValue +
  ' was previously linked to design system token "' + current.suggestedToken +
  '" but the link was detached. Explain in 1-2 short sentences why re-linking ' +
  'restores design system consistency. No preamble, get straight to the point. Reply in English.';
```

Plain-form шаблон с placeholder-ами:

```text
On node "{{nodeName}}" the value {{currentValue}} was previously linked to design system token "{{suggestedToken}}" but the link was detached. Explain in 1-2 short sentences why re-linking restores design system consistency. No preamble, get straight to the point. Reply in English.
```

### 3.3 Условный суффикс `Component context` (Ф.17.5)

Дописывается к ЛЮБОМУ из шаблонов A/B при выполнении всех условий (строки 199–242):

- `result !== null` (ScanResult прокинут в ReportView из App).
- Найден `componentName` для `current.nodeId` среди `result.colors[].componentName` или `result.texts[].componentName`.
- `result.componentTokenIndex[componentName]` существует и непуст.
- `snapshot !== null` и в `snapshot.tokens` есть хотя бы один токен с id из индекса (для маппинга id → name).

Plain-form суффикс с placeholder-ами:

```text
 Component context: "{{componentName}}". Tokens used in this component: {{componentPalette joined by ", "}}.
```

Источник склейки — `src/ui/components/ReportView.tsx`, строки 237–240:

```ts
if (paletteNames.length > 0) {
  prompt += ' Component context: "' + componentName +
    '". Tokens used in this component: ' + paletteNames.join(', ') + '.';
}
```

> **РАСХОЖДЕНИЕ с handoff revision 2:** handoff (раздел «Действие» шага 17.5) описывает обогащение как `Component context: "<componentName>". Tokens used in this component: <componentPalette comma-separated>.`. Реализованный текст совпадает дословно. Расхождений нет.

---

## 4. Контракт входа в `callGemini`

### 4.1 TS-сигнатура

Источник — `src/ui/aiClient.ts`, строки 33–43.

```ts
export interface GeminiMessage {
  role: 'user' | 'model';
  content: string;
}

export async function callGemini(
  messages: GeminiMessage[],
  systemPrompt?: string,
  maxTokens: number = 1024,
  signal?: AbortSignal
): Promise<string>
```

### 4.2 Что фактически передаётся из ReportView (строки 250–255)

```ts
callGemini(
  [{ role: 'user', content: prompt }],
  'You are a designer assistant who explains design system token choices. Reply concisely and to the point, in English.',
  200,
  controller.signal
)
```

- `messages`: всегда один user-message со сконструированной строкой `prompt` (см. п.3).
- `systemPrompt`: задан, литерал из п.2.
- `maxTokens`: **200** (override default 1024).
- `signal`: `AbortController.signal`, который abort-ится в return-функции useEffect (строка 277) — отмена при размонтировании или новой смене зависимостей.

### 4.3 Endpoint и модель

Источник — `src/ui/aiClient.ts`, строки 1–3.

```ts
const STORAGE_KEY = 'google-api-key';
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';
```

Транспорт — прямой `fetch()` из UI к Gemini API (строки 67–72).

```ts
const resp = await fetch(ENDPOINT + '?key=' + encodeURIComponent(key), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal,
});
```

Тело запроса (строки 49–65):

```ts
const contents = messages.map(m => ({
  role: m.role,
  parts: [{ text: m.content }],
}));

const body: any = {
  contents,
  generationConfig: {
    maxOutputTokens: maxTokens,
  },
};

if (systemPrompt) {
  body.systemInstruction = {
    parts: [{ text: systemPrompt }],
  };
}
```

### 4.4 Подтверждение N=20 для componentPalette

Лимит **N=20** обрезается **в ReportView**, не в aiClient.

Источник — `src/ui/components/ReportView.tsx`, строки 226–236:

```tsx
// Маппинг tokenId → name через snapshot.tokens (для Gemini name читабельнее uuid).
// Лимит N=20 (решение PO, Риск 7) — обрезаем индекс до 20 первых tokenId.
const nameById: { [id: string]: string } = {};
for (let i = 0; i < snapshot.tokens.length; i++) {
  nameById[snapshot.tokens[i].id] = snapshot.tokens[i].name;
}
const limit = Math.min(tokenIds.length, 20);
const paletteNames: string[] = [];
for (let i = 0; i < limit; i++) {
  const n = nameById[tokenIds[i]];
  if (n) paletteNames.push(n);
}
```

- Размер выборки фиксирован константой `20` (магическое число в коде).
- Срезается **префикс** массива `result.componentTokenIndex[componentName]` — без какой-либо сортировки/ранжирования. Порядок определяется тем, как `componentTokenIndex` собран в sandbox.
- В `aiClient.ts` никаких лимитов на длину prompt или массив сообщений нет.

> **РАСХОЖДЕНИЕ с handoff revision 2:** handoff в шаге 17.5 действие пункт 4 говорит «componentPalette ограничивается до N=20 tokenId (или 30 — на усмотрение реализации)». В коде зафиксировано N=20 — нижняя граница диапазона. Это не противоречие, а конкретизация.

### 4.5 Лимиты ответа

- `maxOutputTokens` (Gemini): **200** (значение из вызова в ReportView).
- В Settings — `32` (health-check).

### 4.6 Опциональность параметров

| Параметр | Опциональный | Значение по умолчанию |
|---|---|---|
| `messages` | нет | — |
| `systemPrompt` | да | `undefined` (system instruction не отправляется) |
| `maxTokens` | да (default) | `1024` (default в коде); фактически переопределяется на `200` в ReportView и `32` в Settings |
| `signal` | да | `undefined` (нет возможности отмены) |

---

## 5. Контракт ответа

### 5.1 Что возвращает `callGemini`

Источник — `src/ui/aiClient.ts`, строки 79–84.

```ts
const data = await resp.json();
const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
if (typeof text !== 'string') {
  throw new Error('Некорректный ответ от Gemini API');
}
return text;
```

- Тип: `Promise<string>`.
- Семантическое ожидание (заложено в prompt): «1–2 short sentences, English, no preamble».
- **Парсинга массивов / JSON / структурированных полей нет.** Любой не-строковый ответ Gemini API → throw.

### 5.2 Что попадает в UI

Источник — `src/ui/components/ReportView.tsx`, строки 256–274.

```ts
.then(text => {
  if (controller.signal.aborted) return;
  explanationsRef.current.set(cacheKey, text);
  setExplanation(text);
  setExplainError(false);
  setExplaining(false);
})
.catch(err => {
  if (err && (err.name === 'AbortError' || controller.signal.aborted)) return;
  const msg = String(err);
  let friendly = UI.errorAiGeneric;
  if (msg.includes('401') || msg.includes('403')) friendly = UI.errorAiInvalidKey;
  else if (msg.includes('429')) friendly = UI.errorAiRateLimit;
  else if (msg.includes('503') || msg.includes('overloaded')) friendly = UI.errorAiUnavailable;
  setExplanation(friendly);
  setExplainError(true);
  setExplaining(false);
});
```

- Строка ответа кэшируется в `explanationsRef.current` (Map) с ключом `current.id + ':' + selectedTokenId` (строка 172).
- Кладётся в state `explanation` (string).
- Рендерится в `<div style={styles.explanation}>{explanation}</div>` (строка 535).

### 5.3 Подтверждение из handoff revision 2

> **Совпадает:** «строка 1–2 предложения объяснения» — да, prompt инструктирует Gemini вернуть ровно это, контракт `callGemini` — `Promise<string>`.
>
> **Совпадает:** «top-5 формирует ДЕТЕКТОР» — в коде топ-N кандидатов берётся из `current.candidates` (`Violation.candidates: Array<{ id, name, value, kind }>` в `src/shared/types.ts:223–224`). AI к формированию топ-5 не привлекается; AI получает уже выбранный пользователем `tokenInfo` (строка 182 ReportView).
>
> **Совпадает:** «AISuggestion НЕ существует» — по `src/shared/types.ts` тип `AISuggestion` отсутствует (поиск по файлу даёт 0 совпадений). `PluginMessage` (строки 255–375 types.ts) не содержит сообщений с AI-семантикой кроме API-ключа и флага `set-ai-enabled`.

> **РАСХОЖДЕНИЕ с handoff revision 2:** handoff раздел «Архитектура AI» утверждает «Контракт ответа: Строка, 1–2 предложения объяснения». Совпадает. Расхождений нет.

---

## 6. Что AI ВИДИТ из контекста и что НЕ видит

Свод по prompt-ам, отправляемым в Gemini API. Источник — `src/ui/components/ReportView.tsx` (строки 181–242) и `src/ui/aiClient.ts` (строки 49–65).

| Поле | AI видит? | С какого момента | Источник в коде |
|---|---|---|---|
| `current.currentValue` (например, `#3366CC`) | ДА | всегда (оба шаблона A и B) | `ReportView.tsx:185, 191` |
| `current.nodeName` | ДА | всегда | `ReportView.tsx:185–186, 191` |
| `tokenInfo.name` (имя выбранного токена-кандидата) | ДА | в шаблоне A | `ReportView.tsx:186` |
| `tokenInfo.value` | ДА | в шаблоне A | `ReportView.tsx:186` |
| `current.suggestedToken` | ДА | в шаблоне B | `ReportView.tsx:191–192` |
| `componentName` (имя ближайшего INSTANCE/COMPONENT) | ДА, при наличии в `ScanResult` | с Ф.17.5 (после реализации) | `ReportView.tsx:206–220, 238` |
| `componentPalette` — names токенов компонента | ДА, до **20** имён | с Ф.17.5 | `ReportView.tsx:226–239` |
| `tokenInfo.kind` (`'paintStyles'` / `'textStyles'` / `'variables'`) | НЕТ | — | в prompt не подставляется |
| `current.type` (`hardcoded_color`, `detached_style`, и т.д.) | НЕТ напрямую | — | type определяет ветку шаблона A/B, но в текст prompt не попадает |
| `current.severity` | НЕТ | — | — |
| `current.message` (человекочитаемое описание из детектора) | НЕТ | — | — |
| `current.id` / `current.nodeId` / `current.pageId` | НЕТ | — | используются только для кэша/навигации |
| Тема фрейма (light/dark) | НЕТ | — | в `ScannedColor` / `ScannedText` / `Violation` нет поля темы; в prompt не подставляется |
| Путь слота нарушителя в ДС (например, `Buttons.Primary.Background.Default`) | НЕТ | — | таких полей нет ни в `ScannedColor` (`src/shared/types.ts:1–21`), ни в `Violation` (строки 206–225); в prompt не подставляется |
| Namespace токенов (полный путь токена) | ЧАСТИЧНО — только `name` | — | `Token.name` (например `Primary/Blue`) попадает через `tokenInfo.name` и `paletteNames`; иных namespace-полей нет |
| Палитра компонента в виде HEX-значений | НЕТ | — | передаются только `name` через `paletteNames` (строки 233–235); `value` не маппится |
| Список ВСЕХ токенов snapshot | НЕТ | — | в prompt уходят только `tokenInfo` (один) и `paletteNames` (до 20 имён компонента) |
| Полный список `Violation.candidates` (топ-N) | НЕТ списком | — | передаётся только выбранный кандидат (`tokenInfo`, строка 182) |
| Тема выбранного токена / ссылка на mode | НЕТ | — | в `Token` (`src/shared/types.ts:86–110`) нет поля темы/mode; не передаётся |
| Имя библиотеки токена (`Token.libraryName`) | НЕТ | — | поле существует в типах (строка 109), но в prompt не подставляется |

### 6.1 Подтверждения по запросу PO

- **`componentName` — да, с Ф.17.5.** Источник: `ReportView.tsx:206–220` (поиск по `result.colors`/`result.texts`), подстановка `ReportView.tsx:238`.
- **`componentPalette` — да, с лимитом N=20.** Источник: `ReportView.tsx:226–239`. Подтверждено выше в п.4.4.
- **Тема фрейма (light/dark) — НЕ видит.** В `ScannedColor` (`types.ts:1–21`) поля темы нет; в `Violation` (`types.ts:206–225`) — нет; в prompt-склейке (`ReportView.tsx:181–242`) тема не упоминается.
- **Путь слота нарушителя — НЕ видит.** В `ScannedColor`/`ScannedText` есть только `nodeId`, `nodeName`, `pageId`, `pageName`, `componentName?`. Слотового пути / role / fillRole нет.
- **Namespace токенов — частично.** В prompt подставляется `Token.name` (формат `Primary/Blue` из Figma). Полная иерархия (collection / mode / variable path) не передаётся.

---

## 7. Search-токены в дропдауне

### 7.1 Точка формирования списка search-опций

- **Файл:** `src/ui/components/ReportView.tsx`
- **IIFE:** `suggestionOptions`, строки 400–449.

```tsx
// src/ui/components/ReportView.tsx, строки 400–449 (фрагмент)
const suggestionOptions: SelectOption[] = (() => {
  const out: SelectOption[] = [];
  const suggestedIds = new Set<string>();

  if (current && current.candidates && current.candidates.length > 0) {
    for (const c of current.candidates) {
      const isColor = c.value.indexOf('#') === 0;
      out.push({
        id: c.id,
        label: c.name,
        swatch: isColor ? c.value : undefined,
        badge: c.kind === 'variables' ? 'VAR' : 'STYLE',
        section: 'suggested',
      });
      suggestedIds.add(c.id);
    }
  } else if (current && current.suggestedToken && current.suggestedTokenId) {
    // ... одиночный suggested-фолбэк ...
  }

  if (snapshot && snapshot.tokens.length > 0) {
    const sorted = [...snapshot.tokens].sort((a, b) =>
      a.name.toLowerCase() < b.name.toLowerCase() ? -1
        : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0
    );
    for (const t of sorted) {
      if (suggestedIds.has(t.id)) continue;  // дедуп: top-5 имеет приоритет
      const isColor = t.value.indexOf('#') === 0;
      out.push({
        id: t.id,
        label: t.name,
        swatch: isColor ? t.value : undefined,
        badge: t.kind === 'variables' ? 'VAR' : 'STYLE',
        section: 'search',
      });
    }
  }

  return out;
})();
```

### 7.2 Источник `snapshot.tokens`

Источник наполнения `tokens[]` — `src/sandbox/designSystemParser.ts`. Категории присваиваются на этапе парсинга:

- Цветовые variables и paint styles → `category: 'color'` (строки 268, 338).
- Textстайлы → `category: 'typography'` (строка 366).
- Float-variables → через `floatCategory(name)` (строка 284), которая возвращает `'radius'` если в имени есть `radius`/`corner`, иначе `'spacing'` (`designSystemParser.ts:48–51`).

Тип `Token` (`src/shared/types.ts:86–110`):

```ts
export interface Token {
  id: string;
  name: string;
  category: TokenCategory;        // 'color' | 'typography' | 'spacing' | 'radius' | 'effect'
  value: string;
  source: string;
  kind: 'paintStyles' | 'textStyles' | 'variables';
  isSemantic?: boolean;
  libraryName?: string;
}
```

### 7.3 Почему туда попадают числовые токены (0, 1, 10, 112)

В блоке IIFE `suggestionOptions` (строки 428–446 ReportView):

```tsx
if (snapshot && snapshot.tokens.length > 0) {
  const sorted = [...snapshot.tokens].sort(...);
  for (const t of sorted) {
    if (suggestedIds.has(t.id)) continue;
    const isColor = t.value.indexOf('#') === 0;
    out.push({
      id: t.id,
      label: t.name,
      swatch: isColor ? t.value : undefined,
      badge: t.kind === 'variables' ? 'VAR' : 'STYLE',
      section: 'search',
    });
  }
}
```

**Фильтра по `Token.category` нет.** В цикле берётся весь `snapshot.tokens` целиком, дедупликация по `suggestedIds` (исключаются те, что уже в `current.candidates`), и каждый оставшийся токен попадает в `section: 'search'`.

- `t.value` для spacing-variable — числовая строка (например, `"0"`, `"1"`, `"10"`, `"112"`).
- Префиксная проверка `t.value.indexOf('#') === 0` отвечает только за то, рисовать ли swatch (хекс vs не-хекс), но НЕ влияет на включение токена в список.
- `t.label` (= `t.name`) — это имя токена в Figma. Для variables вроде `0`, `1`, `10`, `112` имя действительно может быть числовым, если так названо в источнике (это собирается в `designSystemParser.ts:284` через `floatCategory`).

**Свод по фильтрации в search-дропдауне:**

| Что фильтруется | Где | Как |
|---|---|---|
| Дедупликация с suggested (top-5) | `ReportView.tsx:436` | `if (suggestedIds.has(t.id)) continue;` |
| По категории токена (color / spacing / typography / radius / effect) | — | **отсутствует** |
| По типу нарушения (показывать spacing-токены только для spacing-нарушений) | — | **отсутствует** |
| По kind (`'paintStyles'` / `'textStyles'` / `'variables'`) | — | **отсутствует** |
| Текстовая фильтрация (substring + ранжирование) | `SelectField.tsx:111–141`, через `searchableSection="search"` | применяется ТОЛЬКО к секции `'search'`, не к `'suggested'` (строки 132–138 SelectField) |

Search-input ищет по `label` (`opt.label.toLowerCase()`, строки 84–93 SelectField), регистр игнорируется, ранжирование `exact → prefix → contains`, внутри группы — алфавит (`compareLabels`, строки 64–70).

> **РАСХОЖДЕНИЕ с handoff revision 2:** handoff (раздел 0 «Что делаем», описание Ф.17.2 и шаг 17.8) описывает search как «ищет по всему `snapshot.tokens` (variables + styles вместе, бейдж VAR/STYLE текстом)». Реализация совпадает дословно. Фильтр по `category` в handoff не упоминается ни как требуемый, ни как отсутствующий — расхождения с handoff нет, но это **подсветка факта** для PO в контексте обсуждения slot-aware ranking.

