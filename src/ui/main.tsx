// Точка входа UI — рендерим React-приложение в #root
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { fontFaceCSS } from "./assets/fonts/inter";

// Инжектируем @font-face с embed-шрифтами Inter до первого рендера
const fontStyle = document.createElement("style");
fontStyle.textContent = fontFaceCSS;
document.head.appendChild(fontStyle);

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
