import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

export const MAX_VERIFICATION_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface VerificationUploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedVerificationFile {
  originalName: string;
  extension: '.pdf' | '.jpg' | '.jpeg' | '.png';
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
}

type DetectedFileType = {
  mimeType: ValidatedVerificationFile['mimeType'];
  extensions: ValidatedVerificationFile['extension'][];
};

const PDF_SIGNATURE = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function validateVerificationFile(
  file: VerificationUploadFile,
): ValidatedVerificationFile {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length === 0
  ) {
    throwFileError(
      'INVALID_VERIFICATION_FILE',
      'Arquivo de verificacao ausente ou vazio.',
    );
  }

  if (
    file.size <= 0 ||
    file.size !== file.buffer.length
  ) {
    throwFileError(
      'INVALID_VERIFICATION_FILE_SIZE',
      'Tamanho do arquivo de verificacao invalido.',
    );
  }

  if (file.size > MAX_VERIFICATION_FILE_SIZE_BYTES) {
    throwFileError(
      'VERIFICATION_FILE_TOO_LARGE',
      'Arquivo de verificacao excede o limite permitido.',
    );
  }

  assertSafeOriginalName(file.originalname);

  const extension = extname(file.originalname).toLowerCase();

  if (!isAllowedExtension(extension)) {
    throwFileError(
      'UNSUPPORTED_VERIFICATION_FILE',
      'Somente arquivos PDF, JPEG e PNG sao permitidos.',
    );
  }

  const detectedType = detectFileType(file.buffer);

  if (!detectedType) {
    throwFileError(
      'UNSUPPORTED_VERIFICATION_FILE',
      'Assinatura real do arquivo nao corresponde a PDF, JPEG ou PNG.',
    );
  }

  if (!detectedType.extensions.includes(extension)) {
    throwFileError(
      'VERIFICATION_FILE_EXTENSION_MISMATCH',
      'A extensao do arquivo nao corresponde ao conteudo real.',
    );
  }

  if (file.mimetype !== detectedType.mimeType) {
    throwFileError(
      'VERIFICATION_FILE_MIME_MISMATCH',
      'O tipo MIME informado nao corresponde ao conteudo real.',
    );
  }

  return {
    originalName: file.originalname,
    extension,
    mimeType: detectedType.mimeType,
    sizeBytes: file.size,
  };
}

function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (startsWith(buffer, PDF_SIGNATURE)) {
    return {
      mimeType: 'application/pdf',
      extensions: ['.pdf'],
    };
  }

  if (startsWith(buffer, JPEG_SIGNATURE)) {
    return {
      mimeType: 'image/jpeg',
      extensions: ['.jpg', '.jpeg'],
    };
  }

  if (startsWith(buffer, PNG_SIGNATURE)) {
    return {
      mimeType: 'image/png',
      extensions: ['.png'],
    };
  }

  return null;
}

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  if (buffer.length < signature.length) {
    return false;
  }

  return buffer.subarray(0, signature.length).equals(signature);
}

function assertSafeOriginalName(originalName: string): void {
  const trimmed = originalName.trim();

  if (
    !trimmed ||
    trimmed !== originalName ||
    trimmed.length > 255 ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0') ||
    trimmed === '.' ||
    trimmed === '..' ||
    hasControlCharacters(trimmed)
  ) {
    throwFileError(
      'INVALID_VERIFICATION_FILE_NAME',
      'Nome do arquivo de verificacao invalido.',
    );
  }
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);

    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f || codePoint === 0x7f)
    );
  });
}

function isAllowedExtension(
  extension: string,
): extension is ValidatedVerificationFile['extension'] {
  return ['.pdf', '.jpg', '.jpeg', '.png'].includes(extension);
}

function throwFileError(code: string, message: string): never {
  throw new BadRequestException({
    code,
    message,
  });
}
