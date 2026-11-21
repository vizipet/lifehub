import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClinicDto {
  @ApiProperty({
    example: '2345678',
    description:
      'CNES do estabelecimento (7 dígitos). Consultável em cnes.datasus.gov.br.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{7}$/, { message: 'O CNES tem 7 dígitos.' })
  cnes!: string;

  @ApiPropertyOptional({ example: '51020000', description: 'CEP do endereço (8 dígitos).' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{8}$/, { message: 'O CEP tem 8 dígitos.' })
  cep?: string;

  @ApiProperty({
    example: 'Clínica Vida Central',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'Rua das Flores, 100',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  address!: string;

  @ApiProperty({
    example: 'Recife',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city!: string;

  @ApiProperty({
    example: 'Boa Viagem',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  neighborhood!: string;

  @ApiPropertyOptional({
    example: -8.0476,
    description:
      'Latitude pública da clínica, usada somente para cálculo de distância.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: -34.877,
    description:
      'Longitude pública da clínica, usada somente para cálculo de distância.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
