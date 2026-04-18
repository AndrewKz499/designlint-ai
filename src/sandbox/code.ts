// Главный файл sandbox — выполняется в среде Figma (доступ к Figma API)
// Связь с UI через postMessage / onmessage

import '@figma/plugin-typings';
import { scanDocument } from './scanner';
import { discoverSources, buildSnapshot, saveSnapshot, loadSnapshot, isSnapshotStale } from './designSystemParser';
import { runDetection } from './detector';
import { navigateToNode, createMarkers, clearMarkers } from './markers';
import { fixViolation } from './fixer';
import type { PluginMessage } from '../shared/types';

// Открываем UI-панель плагина
figma.showUI(__html__, { width: 420, height: 520, themeColors: true });

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
      const scope = (msg.data && msg.data.scope) ? msg.data.scope : 'selection';
      const scanResult = await scanDocument(scope);
      const snapshot = await loadSnapshot();

      const detection = runDetection(scanResult, snapshot);
      figma.ui.postMessage({ type: 'scan-complete', data: scanResult });
      figma.ui.postMessage({ type: 'detection-complete', data: detection });
      // Автоматически расставляем маркеры после завершения аудита
      await createMarkers(detection.violations);
    } catch (err) {
      figma.notify('Ошибка сканирования: ' + String(err));
    }
    return;
  }

  // --- Mode 0: работа с эталонным снепшотом дизайн-системы ---

  // Загрузка сохранённого снепшота
  if (msg.type === 'get-snapshot') {
    try {
      const snapshot = await loadSnapshot();
      if (snapshot !== null) {
        const isStale = await isSnapshotStale(snapshot);
        figma.ui.postMessage({ type: 'snapshot-loaded', data: { snapshot, isStale } });
      } else {
        figma.ui.postMessage({ type: 'snapshot-loaded', data: { snapshot: null, isStale: false } });
      }
    } catch (err) {
      figma.notify('Ошибка: ' + String(err));
    }
    return;
  }

  // Поиск источников дизайн-системы в файле
  if (msg.type === 'discover-sources') {
    try {
      const sources = await discoverSources();
      figma.ui.postMessage({ type: 'ds-sources-found', data: { sources } });
    } catch (err) {
      figma.notify('Ошибка: ' + String(err));
    }
    return;
  }

  // Запуск сборки снепшота по выбранным источникам
  if (msg.type === 'ds-scan-confirmed') {
    try {
      const enabledSources = msg.data.enabledSources;

      figma.ui.postMessage({ type: 'ds-scan-progress', data: { stage: 'Собираем токены...' } });
      const snapshot = await buildSnapshot(enabledSources);

      figma.ui.postMessage({ type: 'ds-scan-progress', data: { stage: 'Сохраняем...' } });
      await saveSnapshot(snapshot);

      figma.ui.postMessage({ type: 'ds-scan-complete', data: { snapshot } });
    } catch (err) {
      figma.notify('Ошибка: ' + String(err));
    }
    return;
  }

  // --- Навигация и маркеры на холсте ---

  // Переход к ноде с нарушением
  if (msg.type === 'navigate-to-node') {
    try {
      await navigateToNode(msg.data.nodeId, msg.data.pageId);
    } catch (err) {
      figma.notify('Ошибка: ' + String(err));
    }
    return;
  }

  // Создание маркеров на холсте
  if (msg.type === 'create-markers') {
    try {
      await createMarkers(msg.data.violations);
    } catch (err) {
      figma.notify('Ошибка: ' + String(err));
    }
    return;
  }

  // Удаление всех маркеров с холста
  if (msg.type === 'clear-markers') {
    try {
      await clearMarkers();
    } catch (err) {
      figma.notify('Ошибка: ' + String(err));
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
    figma.clientStorage.setAsync('google-api-key', msg.data.key).then(function() {
      figma.clientStorage.deleteAsync('anthropic-api-key');
      figma.ui.postMessage({ type: 'set-api-key-done' });
      figma.notify('API-ключ сохранён');
    });
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
      const success = await fixViolation(msg.data.nodeId, msg.data.tokenId, msg.data.violationType);
      figma.ui.postMessage({ type: 'fix-complete', data: { nodeId: msg.data.nodeId, success } });
    } catch (err) {
      figma.notify('Ошибка: ' + String(err));
    }
    return;
  }
};
