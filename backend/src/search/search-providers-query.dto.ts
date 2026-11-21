import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Modality } from '../generated/prisma/client';

export const SEARCH_DEFAULT_PAGE = 1;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_PAGE = 100;
export const SEARCH_MAX_LIMIT = 50;

export class SearchProvidersQueryDto {
  @ApiPropertyOptional({
    example: 'dermatologia recife',
    description:
      'Busca por clínica, profissional, serviço, especialidade ou localidade. Múltiplos termos são combinados.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    enum: Modality,
    example: Modality.IN_PERSON,
  })
  @IsOptional()
  @IsEnum(Modality)
  modality?: Modality;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Especialidade médica (lista em /specialties).',
  })
  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @ApiPropertyOptional({
    enum: ['soonest', 'name'],
    default: 'soonest',
    description: 'soonest = horário mais próximo primeiro (padrão); name = ordem alfabética.',
  })
  @IsOptional()
  @IsIn(['soonest', 'name'])
  sort?: 'soonest' | 'name';

  @ApiPropertyOptional({
    example: 'Recife',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({
    example: 'Boa Viagem',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @ApiPropertyOptional({
    example: '2026-10-10',
    description: 'Dia civil em America/Recife no formato YYYY-MM-DD.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({
    example: -8.0476,
    description:
      'Latitude temporária do paciente. Não é persistida nem registrada.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: -34.877,
    description:
      'Longitude temporária do paciente. Não é persistida nem registrada.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    example: SEARCH_DEFAULT_PAGE,
    default: SEARCH_DEFAULT_PAGE,
    minimum: 1,
    maximum: SEARCH_MAX_PAGE,
    description:
      'Página da busca. Limitada para evitar paginação profunda excessiva.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_PAGE)
  page: number = SEARCH_DEFAULT_PAGE;

  @ApiPropertyOptional({
    example: SEARCH_DEFAULT_LIMIT,
    default: SEARCH_DEFAULT_LIMIT,
    minimum: 1,
    maximum: SEARCH_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_LIMIT)
  limit: number = SEARCH_DEFAULT_LIMIT;
}
