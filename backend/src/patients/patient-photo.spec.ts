import { BadRequestException } from '@nestjs/common';
import { decodePatientPhotoBase64, MAX_PATIENT_PHOTO_BYTES, MAX_PATIENT_PHOTO_JSON_BYTES, validatePatientPhoto } from './patient-photo';

// Synthetic JPEG frame header; tests the size/type/dimension gate (not image decoding).
function frame(width: number, height: number) {
  const b = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08, 0, 0, 0, 0, 1, 0xff, 0xd9]);
  b.writeUInt16BE(height, 7);
  b.writeUInt16BE(width, 9);
  return { buffer: b, size: b.length };
}

describe('Patient photo validation', () => {
  it('accepts bounded JPEG dimensions', () => {
    const file = frame(512, 512);
    expect(validatePatientPhoto(file)).toEqual(file.buffer);
  });
  it('rejects oversized dimensions', () => {
    expect(() => validatePatientPhoto(frame(1025, 512))).toThrow(BadRequestException);
  });
  it('rejects oversized file', () => {
    expect(() => validatePatientPhoto({ buffer: Buffer.alloc(MAX_PATIENT_PHOTO_BYTES + 1), size: MAX_PATIENT_PHOTO_BYTES + 1 })).toThrow(BadRequestException);
  });
  it('rejects unknown file formats and missing images', () => {
    expect(() => validatePatientPhoto({ buffer: Buffer.from('<svg>'), size: 5 })).toThrow(BadRequestException);
    expect(() => validatePatientPhoto()).toThrow(BadRequestException);
  });
});

describe('Mobile JSON photo transport', () => {
  it('decodes a canonical JPEG payload', () => {
    const file = frame(512, 512);
    expect(decodePatientPhotoBase64(file.buffer.toString('base64'))).toEqual(file.buffer);
  });
  it('rejects malformed base64', () => {
    expect(() => decodePatientPhotoBase64('not a photo!')).toThrow(BadRequestException);
  });
  it('rejects payloads above the mobile limit', () => {
    expect(() => decodePatientPhotoBase64(Buffer.alloc(MAX_PATIENT_PHOTO_JSON_BYTES + 1).toString('base64'))).toThrow(BadRequestException);
  });
});
