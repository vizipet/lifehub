import { BadRequestException } from '@nestjs/common';
import {
  MAX_VERIFICATION_FILE_SIZE_BYTES,
  validateVerificationFile,
  VerificationUploadFile,
} from './verification-file.validator';

function makeFile(
  overrides: Partial<VerificationUploadFile> = {},
): VerificationUploadFile {
  const buffer = Buffer.from('%PDF-1.7\nconteudo');

  return {
    originalname: 'crm.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
    ...overrides,
  };
}

function expectErrorCode(
  action: () => unknown,
  expectedCode: string,
): void {
  try {
    action();
    throw new Error('Expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);

    const response = (error as BadRequestException).getResponse();

    expect(response).toMatchObject({
      code: expectedCode,
    });
  }
}

describe('validateVerificationFile', () => {
  it('accepts a valid PDF', () => {
    const file = makeFile();

    expect(validateVerificationFile(file)).toEqual({
      originalName: 'crm.pdf',
      extension: '.pdf',
      mimeType: 'application/pdf',
      sizeBytes: file.size,
    });
  });

  it('accepts a valid JPEG', () => {
    const buffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    ]);

    expect(
      validateVerificationFile(
        makeFile({
          originalname: 'documento.jpeg',
          mimetype: 'image/jpeg',
          size: buffer.length,
          buffer,
        }),
      ),
    ).toMatchObject({
      extension: '.jpeg',
      mimeType: 'image/jpeg',
    });
  });

  it('accepts a valid PNG', () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);

    expect(
      validateVerificationFile(
        makeFile({
          originalname: 'documento.png',
          mimetype: 'image/png',
          size: buffer.length,
          buffer,
        }),
      ),
    ).toMatchObject({
      extension: '.png',
      mimeType: 'image/png',
    });
  });

  it('rejects a fake extension', () => {
    expectErrorCode(
      () =>
        validateVerificationFile(
          makeFile({
            originalname: 'documento.png',
            mimetype: 'image/png',
          }),
        ),
      'VERIFICATION_FILE_EXTENSION_MISMATCH',
    );
  });

  it('rejects a file above the size limit', () => {
    const buffer = Buffer.alloc(
      MAX_VERIFICATION_FILE_SIZE_BYTES + 1,
    );

    Buffer.from('%PDF-').copy(buffer);

    expectErrorCode(
      () =>
        validateVerificationFile(
          makeFile({
            size: buffer.length,
            buffer,
          }),
        ),
      'VERIFICATION_FILE_TOO_LARGE',
    );
  });

  it('rejects SVG files', () => {
    const buffer = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );

    expectErrorCode(
      () =>
        validateVerificationFile(
          makeFile({
            originalname: 'documento.svg',
            mimetype: 'image/svg+xml',
            size: buffer.length,
            buffer,
          }),
        ),
      'UNSUPPORTED_VERIFICATION_FILE',
    );
  });

  it('rejects an executable renamed as PDF', () => {
    const buffer = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
    ]);

    expectErrorCode(
      () =>
        validateVerificationFile(
          makeFile({
            originalname: 'documento.pdf',
            mimetype: 'application/pdf',
            size: buffer.length,
            buffer,
          }),
        ),
      'UNSUPPORTED_VERIFICATION_FILE',
    );
  });

  it('rejects unsafe original names', () => {
    expectErrorCode(
      () =>
        validateVerificationFile(
          makeFile({
            originalname: '../crm.pdf',
          }),
        ),
      'INVALID_VERIFICATION_FILE_NAME',
    );
  });
});
