// Single source of truth for user-facing UI strings.
// Rule: no component renders text directly — only via this dictionary.

import type { ViolationType } from './types';

// ─── Violation categories ────────────────────────────────────────────────────
export type Category = 'colors' | 'typography' | 'layout';

export const CATEGORY_META: Record<Category, { emoji: string; label: string }> = {
  colors:     { emoji: '🎨', label: 'Colors' },
  typography: { emoji: '✏️', label: 'Typography' },
  layout:     { emoji: '📐', label: 'Layout' },
};

export const VIOLATION_CATEGORY: Record<ViolationType, Category> = {
  hardcoded_color:       'colors',
  detached_style:        'colors',
  similar_to_token:      'colors',
  missing_text_style:    'typography',
  nonstandard_font_size: 'typography',
  spacing_off_scale:     'layout',
};

// ─── Violation titles in designer-friendly language ──────────────────────────
export const VIOLATION_TITLE: Record<ViolationType, string> = {
  hardcoded_color:       'Hardcoded color',
  detached_style:        'Detached color style',
  similar_to_token:      'Near a token',
  missing_text_style:    'Missing text style',
  nonstandard_font_size: 'Off-scale font size',
  spacing_off_scale:     'Off-scale spacing',
};

export const VIOLATION_HINT: Record<ViolationType, string> = {
  hardcoded_color:       'This color is hardcoded. The system has a matching token.',
  detached_style:        'The style was linked but got detached. Re-link it.',
  similar_to_token:      'This color is very close to a token — better to use the token.',
  missing_text_style:    'Text without a style: typography changes will need manual edits.',
  nonstandard_font_size: 'Font size is not on the typographic scale.',
  spacing_off_scale:     'Spacing does not fit the grid step.',
};

// ─── Design System sources ───────────────────────────────────────────────────
export const SOURCE_LABEL = {
  paintStyles: 'Color styles',
  textStyles:  'Text styles',
  variables:   'Variables',
  jsonTokens:  'Linked JSON files',
};

// ─── Scan scope modes ────────────────────────────────────────────────────────
export const SCOPE_LABEL = {
  selection: 'Selection',
  section:   'Section',
  topFrames: 'Page frames',
  page:      'Whole page',
};

// ─── Priorities (Phase 10) ───────────────────────────────────────────────────
export const PRIORITY_META = {
  critical:  { emoji: '🔴', label: 'Critical' },
  important: { emoji: '🟡', label: 'Major' },
  minor:     { emoji: '⚪', label: 'Minor' },
};

// ─── Key screen strings ──────────────────────────────────────────────────────
export const UI = {
  startTitle:       'Audit your layout against the design system',
  startCta:         'Audit selection',
  startCtaEmpty:    'Select a frame or Section',
  sourcesToggle:    'Design System sources',
  rescanSources:    'Rescan sources',

  progressLabel:    (done: number, total: number) => `Checked ${done} of ${total}`,
  scanningIdle:     'Scanning…',
  scanningWithCount: (n: number) => `Checked ${n} elements…`,

  dashErrorsTitle:  (count: number) => `Detected issues: ${count}`,
  dashAreasTitle:   'Audit areas',
  dashScoreLabel:   'Layout score',
  dashContextBadge: (name: string, count: number) => `Scanned: ${name} · ${count} elements`,
  /**
   * Ф.18a (шаг 18.11): вторая строка sub-line на Dashboard, когда скан был
   * запущен с эталоном (example !== null на момент start-scan). Показывает
   * имя эталона прошлого скана независимо от текущего состояния чипа в Header
   * (см. App.tsx → lastScanExample). Намеренное дублирование чипа: «прошлый
   * скан был с этим эталоном», тогда как чип в Header — «текущий эталон».
   */
  dashVsExample:    (name: string) => `vs example "${name}"`,
  dashAiFixAll:     '✨ Fix all with AI',
  dashFixAll:       'Fix all',
  dashReviewOne:    'Review one by one',
  dashRescan:       'Rescan',
  dashEmpty:        'Looks good. Layout matches the system.',

  reviewTitle:      'Review and fix',
  reviewFix:        'Fix',
  reviewSkip:       'Skip',
  reviewIgnore:     'Hide',
  reviewBack:       '← Back',
  reviewDone:       'Done',
  reviewCurrent:    'Current',
  reviewSuggested:  'Suggested',

  scopeTitle:       'Audit scope',
  searchingSources: 'Searching sources…',
  sdSpacingLabel:   'Spacing',
  sdRadiusLabel:    'Corner radii',

  errNoSelection:   'Select a frame or Section to start the audit.',
  errNoTokens:      'There are no styles or Variables in this file. Add color styles or publish a library so the plugin can compare the layout against the system.',
  errNoAiKey:       'AI explanations need a Google Gemini key. Add it in Settings or turn off the “Use AI” toggle there.',

  reportTitle:        'Done',
  reportFixedLabel:   (fixed: number, total: number) => `Fixed ${fixed} of ${total}`,
  reportScopeLabel:   (label: string) => `Scope: ${label}`,
  reportCheckAgain:   'Audit again',
  reportClearMarkers: 'Clear markers from canvas',
  reportMarkersCleared: 'Markers cleared',

  // About
  aboutTitle:       'About',
  aboutDescription: 'Design system audit for Figma in plain designer language',
  aboutVersion:     'Version 0.14.13',
  aboutFeedback:    'Feedback',

  aiToggleLabel: 'Use AI for explanations',
  aiToggleHint:  'When off, the plugin runs on rules only without calling Gemini',

  settingsRemoveKey:  'Remove key',
  settingsKeyRemoved: 'Key removed',

  // ─── App.tsx ─────────────────────────────────────────────────────────────
  errorNoSelectionTitle:  'No selection',
  errorNoSelectionAction: 'Try again',
  errorNoTokensTitle:     'No design system tokens',
  errorNoTokensAction:    'Got it',
  scanReady:              'Ready to scan',
  scanFile:               'Scan file',
  navigateToNodeTitle:    'Go to element',
  analyzingResults:       'Analyzing results…',

  // ─── Settings.tsx ────────────────────────────────────────────────────────
  settingsKeyValid:       (text: string) => `✓ Key works: ${text}`,
  settingsKeyError:       (msg: string) => `✗ Error: ${msg}`,
  settingsBack:           '← Back',
  settingsTitle:          'Settings',
  settingsKeyHintExisting: 'Key saved. Enter a new one to replace it.',
  settingsKeyHintNew:     'Enter a key for AI features (Fix all).',
  settingsGetKey:         'Get a key at aistudio.google.com',
  settingsKeySaved:       'Saved ✓',
  settingsSaveKey:        'Save key',
  settingsKeyTesting:     'Testing…',
  settingsTestKey:        'Test key',

  // ─── Spinner.tsx ─────────────────────────────────────────────────────────
  spinnerLoading:         'Loading',

  // ─── Home.tsx ────────────────────────────────────────────────────────────
  sdSourcesTitle:         'Design System sources',
  sdScanSelected:         'Scan selected',
  sdSkip:                 'Skip',
  sdScanningTitle:        'Scanning the Design System',
  sdScanning:             'Scanning…',
  sdScanningWith:         (stage: string) => `Scanning… ${stage}`,
  sdScannedTitle:         'Design System scanned',
  sdColorTokensLabel:     'Color tokens:',
  sdTypographyTokensLabel: 'Text tokens:',
  sdRunAudit:             'Run audit',
  sdRescan:               'Rescan',

  // ─── ReportView.tsx ──────────────────────────────────────────────────────
  errorAiGeneric:         "Couldn't get an explanation.",
  errorAiInvalidKey:      'Invalid API key. Check Settings.',
  errorAiRateLimit:       'Rate limit exceeded. Please try again later.',
  errorAiUnavailable:     'Service temporarily unavailable.',
  previewBuildError:      "Couldn't build preview",
  previewLoadError:       "Couldn't load preview",
  previewLoading:         'Loading preview…',
  previewAlt:             'Node preview',
  recommendationAi:       'AI suggestion',
  aiKeyMissing:           'AI key not set',
  openSettings:           'Open settings',
  thinkingExplanation:    'Thinking…',
  tryAgain:               'Try again',

  // ─── Library content (Ф.16.6.5 single-select) ────────────────────────────
  connectedLibraryLabel:    'Connected library',
  localLibraryLabel:        'Local library',
  /** {name} — placeholder for library name. Used in figma.notify on permission loss. */
  libraryUnavailable:       (name: string) => `Library "${name}" is unavailable. Switched to Local.`,
  noConnectedLibrariesHint: 'No connected libraries in this file',
  connectedLibraryAria:     'Use a connected library as the source of design tokens',
  localLibraryAria:         'Use local Variables and Styles as the source of design tokens',
  libraryDropdownAria:      'Select a connected library',
  /**
   * Optional badge for ReportView. Phase Ф.16.6.5 PO решение — убрать в v1.0.
   * Строка оставлена ради v1.1, если PO передумает.
   */
  libraryFromBadge:         (libraryName: string) => `from ${libraryName}`,

  // ─── VerificationExample.tsx (Ф.18a, шаг 18.6) ───────────────────────────
  // Названия ключей по паттерну `verExample.*` (отдельный namespace экрана,
  // как `sd*` для design-system Home). EN-only, как и весь strings.ts на момент Ф.18a.
  verExampleTitle:           'Verification example',
  verExampleTabSelection:    'Selection',
  verExampleTabSection:      'Section',
  verExampleTabComponent:    'Component',
  verExampleTabLayout:       'Layout',
  /** Заглушка пустого состояния под табами (нет выбранного эталона, нет ошибки, не идёт парсинг). */
  verExampleEmpty:           'Select a node on the canvas, then pick a mode above to parse the example.',
  /** Сообщение во время парсинга. parse-example-progress в Ф.18a не используется (см. шаг 18.6). */
  verExampleParsing:         'Parsing example…',
  /** Заглушка для таба Layout — парсинг отложен до Ф.18b. */
  verExampleLayoutComingSoon: 'Layout parsing is coming in the next iteration.',
  /** Чип эталона в populated-state. {name} — имя выбранного узла (Example.name). */
  verExampleChip:            (name: string) => `Example: ${name}`,
  /** Заголовок раздела со слотами в populated-state. */
  verExampleSlotsTitle:      'Tokens used in this example',
  /** Подписи групп слотов. {n} — количество слотов в группе (берётся из example.slots). */
  verExampleSlotsFill:       (n: number) => `Colors: ${n}`,
  verExampleSlotsTextStyle:  (n: number) => `Text styles: ${n}`,
  verExampleSlotsSpacing:    (n: number) => `Spacing: ${n}`,
  verExampleSlotsRadius:     (n: number) => `Radius: ${n}`,
  /** CTA — primary, переходит к скану. */
  verExampleConfirm:         'Scan example',
  /** CTA — secondary, пропускает выбор эталона. */
  verExampleSkip:            'Skip',
  /** Disabled-кнопка по риску B (см. F18a-verification-example-step.md, раздел 1). */
  verExampleAddAnother:      'Add another example',
  verExampleAddAnotherTooltip: 'Replaces current example. Multi-example coming in v1.1.',
  /**
   * Тексты ошибок parse-example-result (см. types.ts → PluginMessage 'parse-example-result').
   * Три кода фиксированы шагом 18.4; UI отображает их «как есть» без сложной обработки.
   */
  verExampleErrorNoSelection:   'Select exactly one node on the canvas to parse the example.',
  verExampleErrorNotPublished:  'This component requires a published library. Open the source file or publish the library, then try again.',
  verExampleErrorNoTokensFound: 'No design tokens found in the selected node. Try a different node or mode.',
};
