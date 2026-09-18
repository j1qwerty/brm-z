export interface ThemeDef {
  key: string
  label: string
  hint: string
  swatch: string
}

export const THEMES: ThemeDef[] = [
  { key: 'light', label: 'Light', hint: 'Clean neutral', swatch: 'linear-gradient(135deg,#f8fafc 50%,#0f766e 50%)' },
  { key: 'dark', label: 'Dark', hint: 'Dark gray, never black', swatch: 'linear-gradient(135deg,#23272e 50%,#5eead4 50%)' },
  { key: 'paper', label: 'Paper', hint: 'Warm sepia / cream', swatch: 'linear-gradient(135deg,#f3ecdd 50%,#8a5a2b 50%)' },
  { key: 'ocean', label: 'Ocean', hint: 'Cool blue-tinted', swatch: 'linear-gradient(135deg,#e8f1fa 50%,#2563eb 50%)' },
]

export function applyTheme(key: string) {
  document.documentElement.setAttribute('data-theme', key)
  localStorage.setItem('bmrc-theme', key)
}
