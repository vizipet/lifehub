import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { LegalDocumentType } from '../generated/prisma/enums';

export class RegisterLegalAcceptanceDto {
  @ApiProperty({
    enum: LegalDocumentType,
    example: LegalDocumentType.TERMS_OF_USE,
  })
  @IsEnum(LegalDocumentType)
  documentType!: LegalDocumentType;

  @ApiProperty({
    example: '1.0',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  version!: string;
}
