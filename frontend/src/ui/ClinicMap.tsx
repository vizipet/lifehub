import { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';

const CONSENT_KEY = 'lifehub.mapaPermitido';

function mapAllowed() {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Mapa pequeno do local de atendimento (OpenStreetMap).
 * O mapa vem de um serviço de fora, que recebe o IP de quem abre. Por isso
 * só carrega depois que a pessoa pede; a escolha fica lembrada neste aparelho.
 */
export function ClinicMap({ name, latitude, longitude }: { name: string; latitude: number; longitude: number }) {
  const [show, setShow] = useState(mapAllowed);
  // Recorte de ~1 km ao redor do local, com o marcador no centro.
  const bbox = [longitude - 0.006, latitude - 0.004, longitude + 0.006, latitude + 0.004].map((n) => n.toFixed(5)).join(',');
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${latitude.toFixed(6)},${longitude.toFixed(6)}`;

  function allow() {
    try {
      localStorage.setItem(CONSENT_KEY, '1');
    } catch {
      // Sem armazenamento: mostra só desta vez.
    }
    setShow(true);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative h-40 overflow-hidden rounded-xl border border-line bg-soft">
        {show ? (
          <iframe
            title={`Mapa: ${name}`}
            src={embed}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin"
            className="size-full border-0"
          />
        ) : (
          <div
            className="grid size-full place-items-center p-3 text-center"
            // Desenho de "ruas" só com CSS, para lembrar um mapa sem carregar nada de fora.
            style={{
              backgroundImage:
                'linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          >
            <div className="rounded-lg bg-papel/90 px-3 py-2">
              <MapPin className="mx-auto size-6 text-primary" aria-hidden />
              <button type="button" className="btn btn-secondary mt-1 min-h-9 px-3 py-1 text-sm" onClick={allow}>
                Mostrar mapa
              </button>
              <p className="mt-1 text-xs text-muted">Carrega do OpenStreetMap</p>
            </div>
          </div>
        )}
      </div>
      <a href={directions} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline">
        <Navigation className="size-4" aria-hidden /> Como chegar
      </a>
    </div>
  );
}
