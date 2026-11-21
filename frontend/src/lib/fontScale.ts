/**
 * Tamanho da letra (botão A+). Todo o app usa medidas em rem, então mudar
 * o tamanho da raiz aumenta textos, botões e espaços juntos, sem quebrar o layout.
 */
const KEY = 'lifehub.tamanhoLetra';
const BASE_PX = 17;

export const FONT_LEVELS = [
  { scale: 1, label: 'A', name: 'normal' },
  { scale: 1.15, label: 'A+', name: 'grande' },
  { scale: 1.3, label: 'A++', name: 'maior' },
] as const;

export function readFontLevel(): number {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < FONT_LEVELS.length ? saved : 0;
  } catch {
    return 0;
  }
}

export function applyFontLevel(level: number) {
  const root = document.documentElement;
  root.style.fontSize = `${BASE_PX * FONT_LEVELS[level].scale}px`;
  // O CSS usa isto para o menu mostrar só ícones quando a letra está grande.
  if (level === 0) delete root.dataset.fontLevel;
  else root.dataset.fontLevel = String(level);
  try {
    if (level === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(level));
  } catch {
    // Sem armazenamento (navegação privada): vale só até fechar a página.
  }
}
