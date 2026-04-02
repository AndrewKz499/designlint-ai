import { defineConfig } from "vite";
import { resolve } from "path";

// Конфигурация Vite для Figma-плагина
export default defineConfig(({ mode }) => {
  if (mode === "sandbox") {
    // Сборка sandbox — код для Figma API
    return {
      build: {
        outDir: "dist",
        emptyOutDir: false,
        lib: {
          entry: resolve(__dirname, "src/sandbox/code.ts"),
          name: "code",
          formats: ["iife"],
          fileName: () => "code.js",
        },
      },
    };
  }

  // Сборка UI — React-бандл (только JS, без HTML)
  return {
    // Заменяем process.env.NODE_ENV на "production" (в iframe Figma нет process)
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, "src/ui/main.tsx"),
        name: "ui",
        formats: ["iife"],
        fileName: () => "ui.js",
      },
    },
  };
});
