// Скрипт: собирает ui.html из скомпилированного ui.js
import { readFileSync, writeFileSync } from "fs";

const js = readFileSync("dist/ui.js", "utf-8");

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>DesignLint AI</title>
  <style>
    html, body { margin: 0; padding: 0; background: #F4F5F5; }
    #root { background: inherit; min-height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>${js}</script>
</body>
</html>`;

writeFileSync("dist/ui.html", html);
console.log("ui.html собран успешно");
