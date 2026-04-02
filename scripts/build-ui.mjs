// Скрипт: собирает ui.html из скомпилированного ui.js
import { readFileSync, writeFileSync } from "fs";

const js = readFileSync("dist/ui.js", "utf-8");

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>DesignLint AI</title>
</head>
<body>
  <div id="root"></div>
  <script>${js}</script>
</body>
</html>`;

writeFileSync("dist/ui.html", html);
console.log("ui.html собран успешно");
