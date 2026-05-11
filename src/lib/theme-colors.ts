export interface ThemeColors {
  bg: string;  // hex for SVG, e.g. "#ffffff"
  text: string; // hex for SVG, e.g. "#000000"
  bgTypst: string; // hex for Typst rgb(), e.g. "ffffff"
  textTypst: string; // hex for Typst rgb(), e.g. "000000"
}

const hexColors = {
  'auto': { bg: '#ffffff', text: '#1d1d1f' },
  'light': { bg: '#ffffff', text: '#1d1d1f' },
  'dark': { bg: '#1c1c1e', text: '#f5f5f7' },
  'catppuccin-latte': { bg: '#eff1f5', text: '#4c4f69' },
  'catppuccin-frappe': { bg: '#303446', text: '#c6d0f5' },
  'catppuccin-macchiato': { bg: '#24273a', text: '#cad3f5' },
  'catppuccin-mocha': { bg: '#1e1e2e', text: '#cdd6f4' },
  'gruvbox-dark': { bg: '#282828', text: '#ebdbb2' },
  'gruvbox-light': { bg: '#fbf1c7', text: '#3c3836' },
  'nord': { bg: '#2e3440', text: '#eceff4' },
  'dracula': { bg: '#282a36', text: '#f8f8f2' },
  'one-dark': { bg: '#282c34', text: '#abb2bf' },
  'solarized-light': { bg: '#fdf6e3', text: '#657b83' },
  'solarized-dark': { bg: '#002b36', text: '#839496' },
} as const;

function stripHash(hex: string): string {
  return hex.startsWith('#') ? hex.slice(1) : hex;
}

export const THEME_COLORS: Record<string, ThemeColors> = Object.fromEntries(
  Object.entries(hexColors).map(([key, { bg, text }]) => [
    key,
    {
      bg,
      text,
      bgTypst: stripHash(bg),
      textTypst: stripHash(text),
    },
  ])
) as Record<string, ThemeColors>;

export function getThemeColors(themeId: string, isDarkMode: boolean): ThemeColors {
  if (themeId === 'auto') {
    return isDarkMode ? THEME_COLORS['dark'] : THEME_COLORS['light'];
  }
  return THEME_COLORS[themeId] || THEME_COLORS['light'];
}
