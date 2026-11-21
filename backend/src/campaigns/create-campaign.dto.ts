import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Campanha de vacinação' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'VACCINATION' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({ example: 'Secretaria Municipal de Saúde' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  agency!: string;

  @ApiProperty({ example: 'Cães e gatos' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  targetAudience!: string;

  @ApiProperty({ example: 'Documento com foto e cartão de vacinação' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  requirements!: string;

  @ApiProperty({ example: 'Centro de Vigilância Ambiental' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  location!: string;

  @ApiProperty({ example: '2026-10-20T12:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: '2026-10-30T21:00:00.000Z' })
  @IsDateString()
  endsAt!: string;

  @ApiProperty({ example: 'https://www.exemplo.gov.br/campanha' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  sourceUrl!: string;
}
