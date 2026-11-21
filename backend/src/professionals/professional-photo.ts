/** Foto de perfil do médico: regras e endereço público. */

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; matches: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: '.jpg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: '.png',
    matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    matches: (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** Confere pelo conteúdo (não pelo nome) que o arquivo é JPG, PNG ou WebP. */
export function detectPhotoType(buffer: Buffer) {
  return SIGNATURES.find((signature) => signature.matches(buffer)) ?? null;
}

/**
 * Endereço da foto para as telas. A foto enviada pelo médico tem prioridade;
 * sem ela, vale a foto da demonstração (photoUrl). O "?v=" muda a cada troca,
 * para o navegador não mostrar a foto antiga guardada.
 */
export function professionalPhotoUrl(professional: {
  id: string;
  photoUrl: string | null;
  photoStoragePath?: string | null;
  photoUpdatedAt?: Date | null;
}): string | null {
  if (professional.photoStoragePath) {
    const version = professional.photoUpdatedAt?.getTime() ?? 0;
    return `/public/professionals/${professional.id}/photo?v=${version}`;
  }
  return professional.photoUrl;
}
