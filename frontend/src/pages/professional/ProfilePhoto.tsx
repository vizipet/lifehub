import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { messageOf, request } from '../../api';
import { Avatar, Notice } from '../../ui/kit';

const SIZE = 512;

/**
 * Recorta a foto no centro (quadrada) e reduz para 512 px antes de enviar:
 * o envio fica leve mesmo com foto de celular, e todas ficam do mesmo jeito.
 */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Seu navegador não conseguiu preparar a foto.');
  // Retrato costuma ter o rosto no alto: no recorte vertical, puxa um pouco para cima.
  const sx = (bitmap.width - side) / 2;
  const sy = bitmap.height > bitmap.width ? (bitmap.height - side) * 0.25 : (bitmap.height - side) / 2;
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não deu para preparar a foto.'))), 'image/jpeg', 0.88),
  );
}

/** Foto de perfil do médico: aparece na busca e na página dele. */
export function ProfilePhoto({
  name,
  photoUrl,
  enabled,
  onChanged,
}: {
  name: string;
  photoUrl: string | null;
  enabled: boolean;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uploaded = Boolean(photoUrl?.startsWith('/public/'));

  async function send(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Escolha uma imagem (JPG, PNG ou WebP).');
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.append('file', await squareJpeg(file), 'foto.jpg');
      await request('/professionals/me/photo', { method: 'POST', body: data });
      onChanged();
    } catch (err) {
      setError(err instanceof Error && !('status' in err) ? 'Não deu para abrir essa imagem. Tente outra foto.' : messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await request('/professionals/me/photo', { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl bg-soft p-3">
      <Avatar name={name} photoUrl={photoUrl} size="lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-bold">Foto de perfil</p>
        <p className="text-sm text-muted">
          Foto de rosto, de frente e com fundo neutro. Aparece para os pacientes na busca e no seu perfil.
        </p>
        {enabled ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary min-h-10 py-1.5 text-sm" disabled={busy} onClick={() => input.current?.click()}>
              <Camera className="size-4" /> {busy ? 'Enviando...' : photoUrl ? 'Trocar foto' : 'Escolher foto'}
            </button>
            {uploaded && (
              <button type="button" className="btn btn-ghost min-h-10 py-1.5 text-sm text-danger" disabled={busy} onClick={() => void remove()}>
                <Trash2 className="size-4" /> Remover
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                void send(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
        ) : (
          <p className="text-sm font-semibold text-warning">Salve o CRM e a especialidade primeiro para enviar a foto.</p>
        )}
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </div>
  );
}
