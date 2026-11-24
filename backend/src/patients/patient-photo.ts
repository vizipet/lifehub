import { BadRequestException } from '@nestjs/common';

export const MAX_PATIENT_PHOTO_BYTES = 256 * 1024;

/** Restrict uploads to small JPEGs, with bounded dimensions before serving. */
export function validatePatientPhoto(file?: { buffer: Buffer; size: number }): Buffer {
  const bytes = file?.buffer;
  if (!bytes?.length || bytes.length > MAX_PATIENT_PHOTO_BYTES || file!.size > MAX_PATIENT_PHOTO_BYTES) {
    throw new BadRequestException('Escolha uma foto de até 256 KB.');
  }
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new BadRequestException('Envie uma imagem JPEG válida.');
  }
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos++] !== 0xff) break;
    while (pos < bytes.length && bytes[pos] === 0xff) pos++;
    const marker = bytes[pos++];
    if (marker === 0xda || marker === 0xd9 || pos + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(pos);
    if (length < 2 || pos + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      const height = bytes.readUInt16BE(pos + 3);
      const width = bytes.readUInt16BE(pos + 5);
      if (width > 0 && height > 0 && width <= 1024 && height <= 1024) return bytes;
      break;
    }
    pos += length;
  }
  throw new BadRequestException('A foto deve ser um JPEG de até 1024 × 1024 pixels.');
}
