// Дизайн-токены плагина DesignLint AI.
// Источник: SDS (Simple Design System), Figma file gmmTIveN5SSffzVz6AzLpu.
// Используются в inline-стилях React-компонентов (не CSS-переменные).

export const colors = {
  // Backgrounds
  bg: '#F4F5F5',
  bgDefault: '#FFFFFF',
  bgSecondary: '#D9D9D9',

  // Content (text, icons)
  content: '#33332D',
  contentMuted: '#B3B3B3',

  // Accent
  accent: '#002BFF',

  // Tags
  tagBg: '#4A4A4A',
  tagContent: '#FFFFFF',

  // Borders
  border: '#D9D9D9',
  borderMuted: '#B3B3B3',

  // Error
  errorBorder: '#D50000',
  errorFill: '#FFCDCD',
} as const;

export const typography = {
  h1: {
    fontFamily: 'Inter',
    fontSize: '40px',
    fontWeight: 700,
    lineHeight: '44px',
    letterSpacing: '-0.02em',
  },
  h2: {
    fontFamily: 'Inter',
    fontSize: '36px',
    fontWeight: 700,
    lineHeight: '40px',
    letterSpacing: '-0.01em',
  },
  h3: {
    fontFamily: 'Inter',
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: '32px',
    letterSpacing: '-0.01em',
  },
  body: {
    fontFamily: 'Inter',
    fontSize: '16px',
    fontWeight: 400,
    lineHeight: '20px',
    letterSpacing: 0,
  },
  bodyBold: {
    fontFamily: 'Inter',
    fontSize: '16px',
    fontWeight: 600,
    lineHeight: '20px',
    letterSpacing: 0,
  },
} as const;

export const spacing = {
  s200: 8,
  s300: 12,
  s400: 16,
  // functional, not scale: внешний padding контейнера экрана (макет 2026-05-07)
  containerPadding: 26,
};

export const radii = {
  r100: 4,
  r200: 8,
  pill: 32,
};

export const borders = {
  stroke: 1,
};
