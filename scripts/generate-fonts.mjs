// Читает три woff2 файла Inter, кодирует в base64 и генерирует
// src/ui/assets/fonts/inter.ts с константой fontFaceCSS.
// Запускать руками при обновлении шрифтов: node scripts/generate-fonts.mjs
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const fontsDir = resolve('src/ui/assets/fonts');

const faces = [
  { file: 'InterRegular.woff2', weight: 400 },
  { file: 'InterSemiBold.woff2', weight: 600 },
  { file: 'InterBold.woff2', weight: 700 },
];

const cssBlocks = faces.map(({ file, weight }) => {
  const bytes = readFileSync(resolve(fontsDir, file));
  const b64 = bytes.toString('base64');
  return `@font-face { font-family: 'Inter'; font-weight: ${weight}; font-style: normal; font-display: block; src: url(data:font/woff2;base64,${b64}) format('woff2'); }`;
});

const out = `// Сгенерировано scripts/generate-fonts.mjs — не редактируй руками.
// Три начертания Inter (400/600/700) встроены как base64 data-URI внутри @font-face.
export const fontFaceCSS = ${JSON.stringify(cssBlocks.join('\n'))};
`;

writeFileSync(resolve(fontsDir, 'inter.ts'), out);
console.log('inter.ts собран:', cssBlocks.length, 'начертаний');
