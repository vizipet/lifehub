import { Equals, IsBase64, IsBoolean, IsString, MaxLength } from 'class-validator';
import { MAX_PATIENT_PHOTO_BASE64_LENGTH } from './patient-photo';

export class UploadPatientPhotoDto {
  @IsString()
  @IsBase64()
  @MaxLength(MAX_PATIENT_PHOTO_BASE64_LENGTH)
  base64!: string;

  @IsBoolean()
  @Equals(true)
  authorized!: boolean;
}
