import { Transform } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { Modality } from '../generated/prisma/client';

export class CreateServiceDto {
  @ApiProperty({
    example: 'Consulta de clínica médica',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({
    example: 'Consulta clínica geral.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: Modality,
    example: Modality.IN_PERSON,
  })
  @IsEnum(Modality)
  modality!: Modality;

  @ApiProperty({
    example: 30,
    description: 'Duração do serviço em minutos.',
  })
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @ApiPropertyOptional({
    example: 15000,
    description: 'Preço informativo em centavos.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Profissionais vinculados à clínica que podem realizar o serviço.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  professionalIds!: string[];
}
