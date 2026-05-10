// Главный файл sandbox — выполняется в среде Figma (доступ к Figma API)
// Связь с UI через postMessage / onmessage

import '@figma/plugin-typings';
import { scanDocument } from './scanner';
import { discoverSources, buildSnapshot, saveSnapshot, loadSnapshot, isSnapshotStale } from './designSystemParser';
import { runDetection } from './detector';
import { navigateToNode, createMarkers, clearMarkers } from './markers';
import { fixViolation } from './fixer';
import { getSelectedSource, setSelectedSource } from './sourcePreferences';
import { parseExample } from './exampleParser';
import type { PluginMessage, SelectedSource, Example } from '../shared/types';

// Ф.18a (шаг 18.5): persisted current example.
// Naming следует паттерну `designlint-<feature>-<variant>`, как
// `designlint-snapshot` (designSystemParser.ts) и `designlint-selected-source`
// (sourcePreferences.ts). Один ключ — одна запись (multi-example отложен в v1.1).
const EXAMPLE_STORAGE_KEY = 'designlint-example-current';

// Открываем UI-панель плагина
figma.showUI(__html__, { width: 420, height: 800, themeColors: true });

// Обработка сообщений от UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  // Проверка связи: UI отправляет ping, sandbox отвечает pong
  if (msg.type === 'ping') {
    figma.ui.postMessage({ type: 'pong' });
    return;
  }

  // Запуск сканирования документа (Mode 1)
  if (msg.type === 'start-scan') {
    try {
      var scope = (msg.data && msg.data.scope) ? msg.data.scope : 'selection';
      var tokenSource = (msg.data && msg.data.tokenSource) ? msg.data.tokenSource : 'both';
      var tokenPolicy = (msg.data && msg.data.tokenPolicy) ? msg.data.tokenPolicy : 'all-tokens';
      // Ф.18a (шаг 18.10): передача эталона в детектор. Если UI прислал
      // example !== null, детектор использует example.slots как priority
      // override при подборе suggestedToken. На Skip / отсутствии поля
      // fallback к старой логике hex-расстояния (см. detector.ts).
      var example: Example | null = (msg.data && msg.data.example) ? msg.data.example : null;
      if (scope === 'selection' && figma.currentPage.selection.length === 0) {
        figma.ui.postMessage({ type: 'scan-error', data: { code: 'no-selection' } });
        return;
      }
      const scanResult = await scanDocument(scope);
      const snapshot = await loadSnapshot();
      if (snapshot === null || snapshot.tokens.length === 0) {
        figma.ui.postMessage({ type: 'scan-error', data: { code: 'no-tokens' } });
        return;
      }

      const detection = runDetection(scanResult, snapshot, tokenSource, tokenPolicy, example);
      figma.ui.postMessage({ type: 'scan-complete', data: scanResult });
      figma.ui.postMessage({ type: 'detection-complete', data: detection });
      // Автоматически расставляем маркеры после завершения аудита
      await createMarkers(detection.violations);
    } catch (err) {
      figma.notify('Не удалось запустить сканирование: ' + String(err));
    }
    return;
  }

  // --- Mode 0: работа с эталонным снепшотом дизайн-системы ---

  // Загрузка сохранённого снепшота
  if (msg.type === 'get-snapshot') {
    try {
      const snapshot = await loadSnapshot();
      if (snapshot !== null) {
        const currentSource = await getSelectedSource();
        const isStale = await isSnapshotStale(snapshot, currentSource);
        figma.ui.postMessage({ type: 'snapshot-loaded', data: { snapshot, isStale } });
      } else {
        figma.ui.postMessage({ type: 'snapshot-loaded', data: { snapshot: null, isStale: false } });
      }
    } catch (err) {
      figma.ui.postMessage({ type: 'snapshot-loaded', data: { snapshot: null, isStale: false } });
      figma.notify('Не удалось получить снимок выделения: ' + String(err));
    }
    return;
  }

  // Поиск источников дизайн-системы в файле (Ф.16.6.5).
  // Формат ответа — `sources-discovered` с library variables + локальные флаги.
  if (msg.type === 'discover-sources') {
    try {
      const result = await discoverSources();
      figma.ui.postMessage({
        type: 'sources-discovered',
        data: {
          libraries: result.libraries,
          hasLocalStyles: result.hasLocalStyles,
          hasLocalVariables: result.hasLocalVariables,
        },
      });
    } catch (err) {
      // Симметрия catch: всегда отвечаем UI пустыми библиотеками — UI на пустой
      // ответ автоматически переключается на Local. Best-effort локальные флаги
      // не критичны в catch-ветке (это уже path после полного провала discover).
      figma.ui.postMessage({
        type: 'sources-discovered',
        data: { libraries: [], hasLocalStyles: false, hasLocalVariables: false },
      });
      figma.notify('Не удалось найти библиотеки: ' + String(err));
    }
    return;
  }

  // --- Selected source (Ф.16.6.5 single-select) ---

  // UI запрашивает persisted selectedSource при mount.
  if (msg.type === 'get-selected-source') {
    try {
      const source = await getSelectedSource();
      figma.ui.postMessage({ type: 'selected-source-loaded', data: { source } });
    } catch {
      // Симметрия catch: всегда отвечаем дефолтом, не оставляем UI без сообщения.
      figma.ui.postMessage({
        type: 'selected-source-loaded',
        data: { source: { type: 'local' } },
      });
    }
    return;
  }

  // UI просит сохранить новый selectedSource.
  if (msg.type === 'set-selected-source') {
    try {
      const incoming = msg.data.source;
      // Валидация: для library-варианта libraryKey должен быть непустой строкой.
      if (incoming.type === 'library' && (typeof incoming.libraryKey !== 'string' || incoming.libraryKey === '')) {
        figma.ui.postMessage({
          type: 'set-selected-source-done',
          data: { success: false, error: 'Empty libraryKey' },
        });
        return;
      }
      await setSelectedSource(incoming);
      figma.ui.postMessage({ type: 'set-selected-source-done', data: { success: true } });
    } catch (err) {
      figma.ui.postMessage({
        type: 'set-selected-source-done',
        data: { success: false, error: String(err).slice(0, 120) },
      });
    }
    return;
  }

  // Запуск сборки снепшота (Ф.16.6.5 single-select).
  // Sandbox — единственный source-of-truth для selectedSource: читаем из
  // clientStorage, игнорируя msg.data.enabledSources (оставлено для backward compat).
  if (msg.type === 'ds-scan-confirmed') {
    try {
      let selectedSource: SelectedSource = await getSelectedSource();
      // Если default { type: 'local' } и в файле нет локальных, но есть библиотеки —
      // подставляем первую как auto-default. Persisted state обновляем, чтобы
      // UI на следующем mount получил тот же выбор.
      if (selectedSource.type === 'local') {
        try {
          const discover = await discoverSources();
          if (!discover.hasLocalVariables && !discover.hasLocalStyles && discover.libraries.length > 0) {
            selectedSource = { type: 'library', libraryKey: discover.libraries[0].key };
            try { await setSelectedSource(selectedSource); } catch { /* noop */ }
          }
        } catch { /* noop — оставляем local */ }
      }

      const snapshot = await buildSnapshot(selectedSource);
      await saveSnapshot(snapshot);

      figma.ui.postMessage({ type: 'ds-scan-complete', data: { snapshot } });
    } catch (err) {
      figma.notify('Не удалось просканировать дизайн-систему: ' + String(err));
    }
    return;
  }

  // --- Навигация и маркеры на холсте ---

  // Переход к ноде с нарушением
  if (msg.type === 'navigate-to-node') {
    try {
      await navigateToNode(msg.data.nodeId, msg.data.pageId);
    } catch (err) {
      figma.notify('Не удалось перейти к элементу: ' + String(err));
    }
    return;
  }

  // Создание маркеров на холсте
  if (msg.type === 'create-markers') {
    try {
      await createMarkers(msg.data.violations);
    } catch (err) {
      figma.notify('Не удалось создать маркеры: ' + String(err));
    }
    return;
  }

  // Удаление всех маркеров с холста
  if (msg.type === 'clear-markers') {
    try {
      await clearMarkers();
    } catch (err) {
      figma.notify('Не удалось убрать маркеры: ' + String(err));
    }
    return;
  }

  // --- API-ключ ---

  if (msg.type === 'get-api-key') {
    figma.clientStorage.getAsync('google-api-key').then(function(val) {
      figma.ui.postMessage({ type: 'api-key-response', data: { key: val || null } });
    });
    return;
  }

  if (msg.type === 'set-api-key') {
    try {
      if (msg.data.key === '') {
        await figma.clientStorage.deleteAsync('google-api-key');
      } else {
        await figma.clientStorage.setAsync('google-api-key', msg.data.key);
        await figma.clientStorage.deleteAsync('anthropic-api-key');
      }
      figma.ui.postMessage({ type: 'set-api-key-done' });
      figma.notify(msg.data.key === '' ? 'Ключ удалён' : 'API-ключ сохранён');
    } catch (err) {
      figma.notify('Не удалось сохранить ключ: ' + String(err));
    }
    return;
  }

  if (msg.type === 'get-ai-enabled') {
    figma.clientStorage.getAsync('ai-enabled')
      .then(function(val) {
        // По умолчанию AI включён (val === undefined → true)
        var enabled = val === false ? false : true;
        figma.ui.postMessage({ type: 'ai-enabled-response', data: { enabled: enabled } });
      });
    return;
  }

  if (msg.type === 'set-ai-enabled') {
    figma.clientStorage.setAsync('ai-enabled', msg.data.enabled)
      .then(function() {
        figma.ui.postMessage({ type: 'set-ai-enabled-done' });
      });
    return;
  }

  // --- Ф.18a: Verification example flow («эталон в кадре», ADR-002) ---

  // Парсинг эталона из текущего selection (шаг 18.4).
  //
  // NOTE: parse-example-progress is reserved for Ф.18b (large nodes
  // optimization). In Ф.18a parser runs synchronously without progress.
  if (msg.type === 'parse-example') {
    try {
      // R1: пустая selection → ошибка БЕЗ вызова parseExample.
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: 'parse-example-result',
          data: { example: null, error: 'no-selection' },
        });
        return;
      }
      // Берём первый узел — multi-select в Ф.18a сводится к selection[0]
      // (см. ADR-002 / R1; multi-select эталонов отложен в v1.1).
      const nodeId = selection[0].id;
      const result = await parseExample(nodeId, msg.data.scope);
      // Discriminated union из 18.2: `Example` (с полем `slots`) либо `{ error }`.
      if ('error' in result) {
        // TS заставляет покрыть все 3 кода ('no-selection' | 'not-published' |
        // 'no-tokens-found') — никаких runtime «забытых» вариантов.
        figma.ui.postMessage({
          type: 'parse-example-result',
          data: { example: null, error: result.error },
        });
      } else {
        // Ф.18a (шаг 18.5): авто-сохранение успешного эталона в clientStorage.
        // Сохраняем ДО postMessage: если setAsync кинет (квота / I/O), упадём
        // в общий catch и UI получит корректную ошибку, а не «успех + потеря
        // на следующем запуске». Серилизация — стандартный JSON через Figma API
        // (Example — JSON-safe по контракту, см. types.ts:316).
        await figma.clientStorage.setAsync(EXAMPLE_STORAGE_KEY, result);
        figma.ui.postMessage({
          type: 'parse-example-result',
          data: { example: result },
        });
      }
    } catch {
      // Симметрия catch: безопасный fallback 'no-selection' (например, если
      // figma.getNodeByIdAsync кинул исключение при гонке с удалением узла).
      // TODO: лог-канал для sandbox-исключений добавить в Ф.18b
      figma.ui.postMessage({
        type: 'parse-example-result',
        data: { example: null, error: 'no-selection' },
      });
    }
    return;
  }

  // Ф.18a (шаг 18.5): UI просит удалить current example (✕ на чипе или
  // перезапись через «Add another example»). Возвращаем `example-loaded`
  // с null — и в success, и в catch (симметрия PluginMessage).
  if (msg.type === 'clear-example') {
    try {
      await figma.clientStorage.deleteAsync(EXAMPLE_STORAGE_KEY);
      figma.ui.postMessage({ type: 'example-loaded', data: { example: null } });
    } catch {
      // Симметрия catch: UI всё равно ожидает example-loaded после clear.
      // Если deleteAsync упал — ключ возможно остался, но UI должен
      // отрендерить пустое состояние.
      figma.ui.postMessage({ type: 'example-loaded', data: { example: null } });
    }
    return;
  }

  // Ф.18a (шаг 18.5): UI запрашивает persisted example при mount.
  // Перед отдачей валидируем nodeId через getNodeByIdAsync — если узел
  // удалён / недоступен, считаем example протухшим, удаляем ключ
  // и возвращаем null. По единому контракту `example-loaded`.
  if (msg.type === 'get-example') {
    try {
      const raw = await figma.clientStorage.getAsync(EXAMPLE_STORAGE_KEY);
      if (raw === undefined || raw === null) {
        figma.ui.postMessage({ type: 'example-loaded', data: { example: null } });
        return;
      }
      const stored = raw as Example;
      // Ф.18a (шаг 18.13.5): graceful migration legacy-example, сохранённых
      // ДО 18.13 — у их slots отсутствует поле `role`. Контракт ExampleSlot
      // (types.ts:311) делает `role` обязательным, поэтому проставляем
      // 'unknown' как fallback (findExampleSlot обрабатывает 'unknown' как
      // fallback-bucket — поведение «как до 18.13»). Новые эталоны с уже
      // проставленным `role` остаются нетронутыми (?? сохраняет существующее
      // значение). Битые элементы slots (не объекты) пропускаются — graceful.
      if (Array.isArray(stored.slots)) {
        for (let i = 0; i < stored.slots.length; i++) {
          const slot = stored.slots[i];
          if (slot && typeof slot === 'object') {
            slot.role = slot.role ?? 'unknown';
          }
        }
      }
      // Валидация узла. getNodeByIdAsync может вернуть null или упасть —
      // обе ситуации трактуем одинаково (узел недоступен → удалить ключ).
      let nodeAvailable = false;
      try {
        const node = await figma.getNodeByIdAsync(stored.nodeId);
        nodeAvailable = node !== null && node.removed !== true;
      } catch {
        nodeAvailable = false;
      }
      if (!nodeAvailable) {
        try { await figma.clientStorage.deleteAsync(EXAMPLE_STORAGE_KEY); } catch { /* noop */ }
        figma.ui.postMessage({ type: 'example-loaded', data: { example: null } });
        return;
      }
      figma.ui.postMessage({ type: 'example-loaded', data: { example: stored } });
    } catch {
      // Симметрия catch: всегда отвечаем example-loaded, чтобы UI не завис
      // в ожидании (битые данные в clientStorage / I/O ошибка).
      figma.ui.postMessage({ type: 'example-loaded', data: { example: null } });
    }
    return;
  }

  // --- Resize окна плагина ---

  if (msg.type === 'resize') {
    var w = msg.data.width;
    var h = msg.data.height;
    if (w < 320) w = 320;
    if (h < 400) h = 400;
    figma.ui.resize(w, h);
    return;
  }

  // --- Review & Fix: исправление нарушения ---

  // Применить стиль к ноде по выбору пользователя
  if (msg.type === 'fix-violation') {
    try {
      // Закрываем предыдущую undo-группу ДО мутации,
      // чтобы Fix попал в свежую изолированную группу,
      // которую Cmd+Z сможет откатить одним нажатием
      figma.commitUndo();
      var success = await fixViolation(msg.data.nodeId, msg.data.tokenId, msg.data.violationType);
      if (!success) {
        figma.notify('Не удалось применить токен. Попробуйте другой кандидат.', { error: true });
      }
      figma.ui.postMessage({ type: 'fix-complete', data: { nodeId: msg.data.nodeId, success } });
    } catch (err) {
      figma.notify('Не удалось применить токен: ' + String(err), { error: true });
      figma.ui.postMessage({ type: 'fix-complete', data: { nodeId: msg.data.nodeId, success: false } });
    }
    return;
  }

  if (msg.type === 'request-preview') {
    var nodeId = msg.data.nodeId;
    var tag = msg.data.tag;
    try {
      var node = await figma.getNodeByIdAsync(nodeId);
      if (!node || node.removed) {
        figma.ui.postMessage({
          type: 'preview-ready',
          data: { nodeId: nodeId, pngBase64: null, error: 'Нода не найдена', tag: tag },
        });
      } else if (typeof (node as any).exportAsync !== 'function') {
        figma.ui.postMessage({
          type: 'preview-ready',
          data: { nodeId: nodeId, pngBase64: null, error: 'Нода не поддерживает экспорт', tag: tag },
        });
      } else {
        var bytes = await (node as any).exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: 2 },
        });
        // Uint8Array → base64: используем встроенный figma.base64Encode если есть, иначе btoa
        var base64: string;
        if (typeof (figma as any).base64Encode === 'function') {
          base64 = (figma as any).base64Encode(bytes);
        } else {
          var binary = '';
          for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64 = btoa(binary);
        }
        figma.ui.postMessage({
          type: 'preview-ready',
          data: { nodeId: nodeId, pngBase64: base64, tag: tag },
        });
      }
    } catch (err) {
      figma.ui.postMessage({
        type: 'preview-ready',
        data: { nodeId: nodeId, pngBase64: null, error: String(err).slice(0, 120), tag: tag },
      });
    }
    return;
  }
};
