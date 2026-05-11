export interface ThemeColors {
  bg: string;
  text: string;
}

export const THEME_COLORS: Record<string, ThemeColors> = {
  'auto': { bg: '#ffffff', text: '#1d1d1f' }, // light defaults
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
};

export function getThemeColors(themeId: string, isDarkMode: boolean): ThemeColors {
  if (themeId === 'auto') {
    return isDarkMode ? THEME_COLORS['dark'] : THEME_COLORS['light'];
  }
  return THEME_COLORS[themeId] || THEME_COLORS['light'];
}
