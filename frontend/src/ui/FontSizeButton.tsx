import { useState } from 'react';
import { applyFontLevel, FONT_LEVELS, readFontLevel } from '../lib/fontScale';
import { Tooltip } from './kit';

/** Botão "A+": alterna letra normal, grande e maior. Fica salvo neste aparelho. */
export function FontSizeButton() {
  const [level, setLevel] = useState(readFontLevel);
  const next = (level + 1) % FONT_LEVELS.length;

  function cycle() {
    applyFontLevel(next);
    setLevel(next);
  }

  return (
    <Tooltip align="end" text={next === 0 ? 'Voltar a letra ao normal' : 'Aumentar a letra'}>
      <button
        type="button"
        className="btn btn-ghost min-w-11 px-2.5 font-title text-lg leading-none"
        onClick={cycle}
        aria-label={`Tamanho da letra: ${FONT_LEVELS[level].name}. ${next === 0 ? 'Voltar ao normal' : `Mudar para ${FONT_LEVELS[next].name}`}`}
      >
        <span aria-hidden>
          A<span className="text-sm align-super">{next === 0 ? '−' : '+'}</span>
        </span>
      </button>
    </Tooltip>
  );
}
