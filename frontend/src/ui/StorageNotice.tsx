import { useState } from 'react';
import { Link } from 'react-router-dom';

const SEEN_KEY = 'lifehub.avisoArmazenamento';

function alreadySeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Aviso de cookies/armazenamento. O LifeHub só guarda o essencial (sessão),
 * então não há o que aceitar ou recusar: o aviso só informa, como a LGPD
 * pede transparência mesmo para o armazenamento necessário.
 */
export function StorageNotice() {
  const [visible, setVisible] = useState(() => !alreadySeen());
  if (!visible) return null;

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Navegador bloqueou o armazenamento: o aviso só volta na próxima visita.
    }
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Aviso sobre cookies"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-xl rounded-xl border border-line bg-papel p-4 shadow-lg sm:bottom-4"
    >
      <p className="text-sm">
        <strong>Sem cookies de rastreamento.</strong> O LifeHub guarda no seu navegador só o necessário para manter você
        conectado. Não usamos cookies de estatística nem de publicidade, por isso não há nada para aceitar ou recusar.{' '}
        <Link to="/privacidade#armazenamento" className="font-semibold text-primary underline">
          Saiba mais
        </Link>
      </p>
      <div className="mt-3 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={close}>
          Entendi
        </button>
      </div>
    </div>
  );
}
