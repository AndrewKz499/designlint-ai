// Главный компонент UI плагина
import { useState, useEffect } from "react";

export function App() {
  // Статус связи с sandbox
  const [status, setStatus] = useState<string>("Ожидание...");

  useEffect(() => {
    // Слушаем сообщения от sandbox
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "pong") {
        setStatus("Связь установлена!");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Отправляем ping в sandbox
  const handlePing = () => {
    setStatus("Отправлен ping...");
    parent.postMessage({ pluginMessage: { type: "ping" } }, "*");
  };

  return (
    <div style={{ padding: 20, fontFamily: "Inter, sans-serif" }}>
      <h2>DesignLint AI</h2>
      <p>Статус: {status}</p>
      <button onClick={handlePing}>Проверить связь</button>
    </div>
  );
}
