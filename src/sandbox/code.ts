// Главный файл sandbox — выполняется в среде Figma (доступ к Figma API)
// Связь с UI через postMessage / onmessage

// Открываем UI-панель плагина
figma.showUI(__html__, { width: 420, height: 520 });

// Обработка сообщений от UI
figma.ui.onmessage = (msg: { type: string }) => {
  // Проверка связи: UI отправляет ping, sandbox отвечает pong
  if (msg.type === "ping") {
    figma.ui.postMessage({ type: "pong" });
  }
};
