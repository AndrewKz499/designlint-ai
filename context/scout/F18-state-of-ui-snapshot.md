# F.18 — State of UI snapshot

**Дата:** 2026-05-10
**Контекст:** PO прислал скрины Ф.18 из Figma desktop с экранами «Audit areas», «Review one by one», «Fix all», новым layout color/text-нарушения с кнопками **Fix / Skip / Hide**. На последнем скрине AI suggestion блок не отображается на color-нарушении — только три кнопки. Выгрузка состояния кода без интерпретаций.

---

## 1. Дерево роутинга / маршрутизации UI

Главный путь: `App.tsx` → state-машина с двумя осями `currentView: View` и `status: Status`.

```ts
// src/ui/App.tsx:17-18
type Status = 'idle' | 'scanning' | 'done';
type View = 'mode0' | 'scanner' | 'review' | 'settings';
```

```ts
// src/ui/App.tsx:64-77
export function App() {
  const [currentView, setCurrentView] = useState<View>('mode0');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [scope, setScope] = useState<ScanScope>('selection');
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(new Set());
  const [fixedCount, setFixedCount] = useState<number>(0);
  ...
}
```

Импорты экранов на главный путь:

```ts
// src/ui/App.tsx:6-15
import { Home } from './components/Home';
import { ReportView } from './components/ReportView';
import { ErrorCard } from './components/ErrorCard';
import { ReadyToScan } from './components/ReadyToScan';
import { Dashboard } from './components/Dashboard';
import { Header } from './components/ui/Header';
import { Button } from './components/ui/Button';
import { colors, typography, spacing } from './tokens';
import { Settings } from './components/Settings';
import { Spinner } from './components/ui/Spinner';
```

Условный рендер экранов в порядке early-return:

```tsx
// src/ui/App.tsx:222-244
if (currentView === 'settings') {
  return (
    <div style={styles.root}>
      <Header />
      <Settings onBack={() => setCurrentView('scanner')} />
      <ResizeHandle />
    </div>
  );
}

if (currentView === 'mode0') {
  return (
    <div style={styles.root}>
      <Header icon="gear" onIconClick={() => setCurrentView('settings')} />
      <Home
        onComplete={handleMode0Complete}
        snapshot={snapshot}
        onSnapshotReady={setSnapshot}
      />
      <ResizeHandle />
    </div>
  );
}
```

```tsx
// src/ui/App.tsx:246-271
// Режим Review & Fix — пошаговое исправление нарушений
if (currentView === 'review') {
  return (
    <ReportView
      violations={filteredViolations}
      onBack={handleBackToDashboard}
      onNavigateHome={handleNavigateHome}
      onOpenSettings={() => setCurrentView('settings')}
      metrics={{
        fixedCount,
        totalBefore: filteredViolations.length + fixedCount,
        scopeLabel: result?.scopeLabel ?? '',
      }}
      onCheckAgain={handleReset}
      onClearMarkers={() => sendMessage({ type: 'clear-markers' })}
      aiEnabled={aiEnabled}
      hasApiKey={hasApiKey}
      snapshot={snapshot}
      result={result}
    />
  );
}
```

`currentView === 'scanner'` — тело функции после early-return. Внутри рендер по `status` и `scanErrorCode`:

```tsx
// src/ui/App.tsx:273-345
return (
  <div style={styles.root}>
    <Header icon="home" onIconClick={handleNavigateHome} />
    {scanErrorCode === 'no-selection' && ( ... )}
    {scanErrorCode === 'no-tokens' && ( ... )}

    {!scanErrorCode && status === 'idle' && (
      <>
        <p style={styles.hint}>{UI.scanReady}</p>
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <ReadyToScan value={scope} onChange={setScope} />
        </div>
        <Button onClick={handleStartScan}>{UI.scanFile}</Button>
      </>
    )}

    {!scanErrorCode && status === 'scanning' && ( <Spinner ... /> )}

    {!scanErrorCode && status === 'done' && detection !== null && (
      <Dashboard
        detection={detection}
        result={result}
        selectedCategories={selectedCategories}
        onSelectedCategoriesChange={setSelectedCategories}
        filteredViolations={filteredViolations}
        onBulkFix={handleBulkFix}
        onReviewOne={() => setCurrentView('review')}
        onRescan={handleReset}
        onNavigateToNode={(nodeId, pageId) => sendMessage({ type: 'navigate-to-node', data: { nodeId, pageId } })}
      />
    )}
    ...
  </div>
);
```

Переходы между экранами:

- `mode0` → `scanner` (idle): `handleMode0Complete` (App.tsx:139-149) после `Home.onComplete`.
- В `scanner` запуск скана: `handleStartScan` (App.tsx:151-157) шлёт `start-scan`, переводит status в `scanning`.
- В `scanner` (status='done', detection !== null): рендерится `Dashboard`. Кнопка «Review one by one» вызывает `onReviewOne={() => setCurrentView('review')}` (App.tsx:332).
- `review` → `scanner` назад: `handleBackToDashboard` (App.tsx:178-180).
- Любой экран → `mode0`: `handleNavigateHome` (App.tsx:173-175) — без сброса state.

Фактический порядок экранов на главном пути для пользователя:
1. `mode0` (рендерит `Home`) — выбор источника токенов и token policy.
2. `scanner` + `status=idle` (рендерит `ReadyToScan` + кнопку Scan file).
3. `scanner` + `status=scanning` (Spinner).
4. `scanner` + `status=done` + detection (рендерит `Dashboard` — это «Audit areas»).
5. `review` (рендерит `ReportView`) — пошаговое исправление.
6. `settings` — отдельный модальный экран.

---

## 2. Статус `ReportView.tsx`

`ReportView` остаётся на главном пути. Не заменён другим компонентом.

```ts
// src/ui/App.tsx:7
import { ReportView } from './components/ReportView';
```

```tsx
// src/ui/App.tsx:247-270
if (currentView === 'review') {
  return (
    <ReportView
      violations={filteredViolations}
      onBack={handleBackToDashboard}
      onNavigateHome={handleNavigateHome}
      onOpenSettings={() => setCurrentView('settings')}
      metrics={{...}}
      onCheckAgain={handleReset}
      onClearMarkers={() => sendMessage({ type: 'clear-markers' })}
      aiEnabled={aiEnabled}
      hasApiKey={hasApiKey}
      snapshot={snapshot}
      result={result}
    />
  );
}
```

Полный grep по `ReportView` в `src/`:

```
src/ui/App.tsx:7:import { ReportView } from './components/ReportView';
src/ui/App.tsx:79:  // как prop для рендера метрик; App пробрасывает в ReportView для AI prompt
src/ui/App.tsx:172:  // (после Ф.16.5) на ReportView.
src/ui/App.tsx:249:      <ReportView
src/ui/components/ReportView.tsx:35..52  // комментарии и сигнатура самого компонента
```

Единственная инстанциация — `src/ui/App.tsx:249`. Условие входа — `currentView === 'review'`. Экран отрисовывается только при нажатии «Review one by one» в `Dashboard` (App.tsx:332).

---

## 3. Новый экран color-нарушения с кнопками Fix / Skip / Hide

Файл: `src/ui/components/ReportView.tsx`. Это **тот же** `ReportView`, кнопки определены в нём:

```tsx
// src/ui/components/ReportView.tsx:566-586
{/* Кнопки действий */}
<div style={{ display: 'flex', gap: spacing.s200 }}>
  <div style={{ flex: 1 }}>
    <Button
      disabled={current === null || selectedTokenId === null}
      onClick={handleFix}
    >
      {UI.reviewFix}
    </Button>
  </div>
  <div style={{ flex: 1 }}>
    <Button variant="secondary" onClick={handleSkip}>
      {UI.reviewSkip}
    </Button>
  </div>
  <div style={{ flex: 1 }}>
    <Button variant="secondary" onClick={handleIgnore}>
      {UI.reviewIgnore}
    </Button>
  </div>
</div>
```

Тексты лейблов:

```ts
// src/shared/strings.ts:89-91
reviewFix:        'Fix',
reviewSkip:       'Skip',
reviewIgnore:     'Hide',
```

Логика AI suggestion блока в этом же `ReportView`:

- `callGemini` импортируется:

  ```ts
  // src/ui/components/ReportView.tsx:10
  import { callGemini } from '../aiClient';
  ```

- `SelectField` с `searchable` используется:

  ```tsx
  // src/ui/components/ReportView.tsx:525-541
  {suggestionOptions.length > 0 && (
    <SelectField
      label={UI.recommendationAi}
      value={selectedTokenId || ''}
      options={suggestionOptions}
      onChange={setSelectedTokenId}
      searchable={hasSearchSection}
      searchPlaceholder="Search all tokens…"
      sectionLabels={sectionLabels}
      searchableSection="search"
      footerHint={
        hasSearchSection && snapshot?.selectedSource?.type === 'library'
          ? LIBRARY_HINT
          : undefined
      }
    />
  )}
  ```

- `current.candidates`, `snapshot`, `componentTokenIndex` используются (см. полный блок useEffect в ReportView.tsx:158-279 для prompt-сборки и ReportView.tsx:404-466 для построения опций).

Условия отображения AI-объяснения после выбора токена:

```tsx
// src/ui/components/ReportView.tsx:542-562
{aiEnabled && !hasApiKey && (
  <ErrorCard
    title={UI.aiKeyMissing}
    description={UI.errNoAiKey}
    actionLabel={UI.openSettings}
    onAction={onOpenSettings}
  />
)}
{aiEnabled && hasApiKey && (
  <>
    {explaining && (
      <div style={styles.explanation}>{UI.thinkingExplanation}</div>
    )}
    {!explaining && explanation && (
      <div style={styles.explanation}>{explanation}</div>
    )}
    {explainError && !explaining && (
      <div style={styles.retryLink} onClick={() => setSelectedTokenId(s => s)}>{UI.tryAgain}</div>
    )}
  </>
)}
```

Условия для запуска `callGemini`:

```tsx
// src/ui/components/ReportView.tsx:158-171
useEffect(() => {
  if (current === null || selectedTokenId === null) return;
  if (!aiEnabled) {
    setExplanation('');
    setExplaining(false);
    setExplainError(false);
    return;
  }
  if (!hasApiKey) {
    setExplanation('');
    setExplaining(false);
    setExplainError(false);
    return;
  }
  ...
});
```

Объяснение рендерится только если `aiEnabled && hasApiKey && (explaining || explanation)`. При `aiEnabled=false` либо `hasApiKey=false` блок не выводится; в первом случае нет `ErrorCard`, во втором — выводится `ErrorCard` про missing key.

`SelectField` (а значит и сам список AI suggestion с label `UI.recommendationAi = 'AI suggestion'`) рендерится только при `suggestionOptions.length > 0` (ReportView.tsx:525). Источники этой длины — две ветки в построении массива:

```tsx
// src/ui/components/ReportView.tsx:400-470
const suggestionOptions: SelectOption[] = (() => {
  const out: SelectOption[] = [];
  const suggestedIds = new Set<string>();

  if (current && current.candidates && current.candidates.length > 0) {
    for (const c of current.candidates) {
      ...
      out.push({ id: c.id, ..., section: 'suggested' });
      suggestedIds.add(c.id);
    }
  } else if (current && current.suggestedToken && current.suggestedTokenId) {
    ...
    out.push({ id: current.suggestedTokenId, ..., section: 'suggested' });
    suggestedIds.add(current.suggestedTokenId);
  }

  if (snapshot && snapshot.tokens.length > 0 && current) {
    // Ф.17.12: фильтр snapshot.tokens по природе текущего нарушения...
    const category = VIOLATION_CATEGORY[current.type];
    const allowedTokenCategories: Token['category'][] =
      category === 'colors' ? ['color']
      : category === 'typography' ? ['typography']
      : ['spacing', 'radius'];

    const filtered = snapshot.tokens.filter((t) =>
      allowedTokenCategories.indexOf(t.category) !== -1
    );
    ...
    for (const t of sorted) {
      if (suggestedIds.has(t.id)) continue;
      ...
      out.push({ id: t.id, ..., section: 'search' });
    }
  }

  return out;
})();
```

Если у нарушения нет ни `candidates`, ни `(suggestedToken && suggestedTokenId)`, и `snapshot` отсутствует или пуст — массив пустой, `SelectField` не рендерится. В таком случае на экране остаются только три кнопки **Fix / Skip / Hide**, превью-картинка и `<p>` с текстом нарушения; AI-блок отсутствует.

Также, даже если `SelectField` рендерится, он показывает label «AI suggestion», но текстовое объяснение от Gemini рисуется отдельно в строках 553-557 и зависит от `aiEnabled && hasApiKey`.

`current.candidates` и `current.suggestedToken/suggestedTokenId` — данные из бэкенда (sandbox detector). В `ReportView` они только читаются.

---

## 4. Фильтр `suggestionOptions` в `ReportView.tsx:428-467`

Фильтр исполняется на каждом рендере `ReportView`. Условие исполнения — `currentView === 'review'` в `App.tsx:247` (вход через кнопку «Review one by one» в `Dashboard` → `onReviewOne={() => setCurrentView('review')}`, App.tsx:332).

```tsx
// src/ui/components/ReportView.tsx:428-467 (строки внутри IIFE suggestionOptions)
if (snapshot && snapshot.tokens.length > 0 && current) {
  const category = VIOLATION_CATEGORY[current.type];
  const allowedTokenCategories: Token['category'][] =
    category === 'colors' ? ['color']
    : category === 'typography' ? ['typography']
    : ['spacing', 'radius'];

  const filtered = snapshot.tokens.filter((t) =>
    allowedTokenCategories.indexOf(t.category) !== -1
  );

  const sorted = filtered.sort((a, b) =>
    a.name.toLowerCase() < b.name.toLowerCase() ? -1
      : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0
  );
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

Подтверждение через grep: единственная инстанциация `<ReportView>` в коде — `src/ui/App.tsx:249`. На главном пути `ReportView` живой; фильтр исполняется при каждом ререндере экрана `review`.

При этом фильтр работает только если выполняются три условия одновременно: `snapshot !== null`, `snapshot.tokens.length > 0`, `current !== null`. Если какое-то из условий не выполнено — секция `search` пуста; ветка `suggested` остаётся независимой и зависит только от `current.candidates`/`current.suggestedToken`.

---

## 5. Состояние работы Ф.18 в коде

Сопоставление экранов из скринов PO с компонентами в коде:

| Экран на скринах PO | Найдено в коде | Файл / точка входа |
|---|---|---|
| «Audit areas» (заголовок, чекбоксы категорий, Fix all / Review one by one / Rescan) | Да | `src/ui/components/Dashboard.tsx`. Заголовок: `Dashboard.tsx:56` `{UI.dashAreasTitle}`; строка `dashAreasTitle: 'Audit areas'` — `src/shared/strings.ts:79`. Кнопки: `Dashboard.tsx:130-149`, лейблы `dashFixAll: 'Fix all'` (strings.ts:83), `dashReviewOne: 'Review one by one'` (strings.ts:84). Условие рендера: `App.tsx:324` `currentView === 'scanner' && status === 'done' && detection !== null`. |
| «Review one by one» (пошаговый экран нарушения) | Да | `src/ui/components/ReportView.tsx`. Точка входа: `App.tsx:247-271` `currentView === 'review'`. |
| «Fix all» | Да, как кнопка внутри Dashboard | `Dashboard.tsx:130-136` (`onClick={onBulkFix}`); реализация `handleBulkFix` — `App.tsx:187-209`. Отдельного экрана «Fix all» в коде нет — это одна кнопка, после которой остаются Dashboard-метрики (исправленные исчезают из `detection.violations`). |
| Color-нарушение с Fix / Skip / Hide | Да | `src/ui/components/ReportView.tsx:566-586` (см. п.3). |
| Text-нарушение с Fix / Skip / Hide | Да, в том же `ReportView` | `ReportView.tsx` — единый компонент для всех типов нарушений; категория считывается через `VIOLATION_CATEGORY[current.type]` (ReportView.tsx:374, 440). Отдельного компонента для текста нет. |
| Done / итоговый экран | Да | `src/ui/components/Done.tsx`. Рендерится из `ReportView` при `total === 0` через слот `styles.doneSlot` (`ReportView.tsx:359-368`): `<Done metrics={metrics} onCheckAgain={onCheckAgain} onClearMarkers={onClearMarkers} />`. Отдельного `currentView === 'done'` в `App.tsx` нет — этот экран встроен в `ReportView`. |
| Home (mode 0, выбор источника + token policy) | Да | `src/ui/components/Home.tsx`. Точка входа: `App.tsx:232-243`. |
| Ready-to-scan (выбор scope) | Да | `src/ui/components/ReadyToScan.tsx`. Точка входа: `App.tsx:300-308` (внутри scanner/idle). |

**Найдено в коде, но не упоминалось в скринах:** ничего нового.

**Не найдено в коде из увиденного на скринах:** см. п.6 — экран «Verification example» из макетов PO.

---

## 6. Экран «Verification example» из макетов PO

Не найдено в коде.

```
$ grep -rn "Verification\|verification" /Users/veter2/Projects/designlint-ai/src/
(пусто)
```

Ни в `src/`, ни в `strings.ts` строки «Verification example» / «verification» нет. Компонента с таким назначением в `src/ui/components/` не существует.

---

## TODO/FIXME с маркерами Ф.18

В исходниках `src/` после grep `Ф\.18|F18|F\.18|Ф18` совпадений на маркер «Ф.18 / F.18 / F18» **не найдено** (в `src/` все упоминания — Ф.16, Ф.17 и более ранние).

В `src/` найдено два TODO/FIXME, оба не связаны с Ф.18:

```ts
// src/ui/components/ReportView.tsx:22
// TODO: finalize wording in release prep — release-scribe
const LIBRARY_HINT = "Library styles aren't searchable. Use file styles for full search.";
```

```ts
// src/sandbox/detector.ts:274
// TODO: tokenPolicy 'semantic-only' для текста пока не применяется —
```

---

## Контекст git status (на момент разведки)

```
M  src/ui/components/ReportView.tsx        (живой, рендерится из App.tsx:249)
A  src/ui/components/Home.tsx              (новый, рендерится из App.tsx:236)
A  src/ui/components/Done.tsx              (новый, рендерится из ReportView.tsx:364, при total===0)
A  src/ui/components/ReadyToScan.tsx       (новый, рендерится из App.tsx:304)
?? src/ui/components/Dashboard.tsx         (untracked, рендерится из App.tsx:325)
?? src/ui/components/ui/BackButton.tsx     (untracked, используется в ReportView.tsx:8,487)
?? src/ui/components/ui/Radio.tsx          (untracked, используется в Home.tsx:12)
D  src/ui/components/ReviewFix.tsx         (удалён, ни одной ссылки в src/)
D  src/ui/components/ScanDesignSystem.tsx  (удалён, ни одной ссылки в src/)
D  src/ui/components/ScopeSelector.tsx     (удалён, ни одной ссылки в src/)
```
