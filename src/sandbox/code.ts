// Главный файл sandbox — выполняется в среде Figma (доступ к Figma API)
// Связь с UI через postMessage / onmessage

import { scanDocument } from './scanner';
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

  // Запуск сканирования документа
  if (msg.type === 'start-scan') {
    try {
      const result = await scanDocument();
      figma.ui.postMessage({ type: 'scan-complete', data: result });
    } catch (err) {
      figma.notify('Ошибка сканирования: ' + String(err));
    }
  }
};
