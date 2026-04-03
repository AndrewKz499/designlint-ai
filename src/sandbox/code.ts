// Главный файл sandbox — выполняется в среде Figma (доступ к Figma API)
// Связь с UI через postMessage / onmessage

import { scanDocument } from './scanner';
import { discoverSources, buildSnapshot, saveSnapshot, loadSnapshot, isSnapshotStale } from './designSystemParser';
import type { PluginMessage } from '../shared/types';

// Открываем UI-панель плагина
figma.showUI(__html__, { width: 420, height: 520 });

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
      const result = await scanDocument();
      figma.ui.postMessage({ type: 'scan-complete', data: result });
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
};
