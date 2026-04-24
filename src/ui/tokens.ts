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
  contentOnDark: '#F5F5F5',

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
  titlePage: {
    fontFamily: 'Inter',
    fontWeight: 700,
    fontSize: 48,
    lineHeight: 1.2,
    letterSpacing: '-0.96px',
  },
  heading: {
    fontFamily: 'Inter',
    fontWeight: 600,
    fontSize: 24,
    lineHeight: 1.2,
    letterSpacing: '-0.48px',
  },
  body: {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 16,
    lineHeight: 1.4,
    letterSpacing: '0',
  },
  bodySingleLine: {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 16,
    lineHeight: 1.0,
    letterSpacing: '0',
  },
};

export const spacing = {
  s200: 8,
  s300: 12,
  s400: 16,
};

export const radii = {
  r100: 4,
  r200: 8,
  pill: 32,
};

export const borders = {
  stroke: 1,
};
