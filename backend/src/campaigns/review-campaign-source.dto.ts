import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { SourceStatus } from '../generated/prisma/client';

export class ListAdminCampaignsQueryDto {
  @ApiPropertyOptional({ enum: SourceStatus, description: 'Filtrar pelo estado da fonte.' })
  @IsOptional()
  @IsEnum(SourceStatus)
  sourceStatus?: SourceStatus;
}

export class ReviewCampaignSourceDto {
  @ApiProperty({ enum: [SourceStatus.VALID, SourceStatus.OUTDATED] })
  @IsIn([SourceStatus.VALID, SourceStatus.OUTDATED])
  sourceStatus!: typeof SourceStatus.VALID | typeof SourceStatus.OUTDATED;

  @ApiProperty({ description: 'Versão retornada pela consulta administrativa mais recente.' })
  @IsString()
  @Matches(/^\d{1,10}$/)
  expectedVersion!: string;

  @ApiProperty({ description: 'Justificativa da verificação humana.', maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
