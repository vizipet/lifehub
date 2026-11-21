import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class ListUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['PATIENT', 'PROFESSIONAL', 'ADMIN'] })
  @IsOptional()
  @IsIn(['PATIENT', 'PROFESSIONAL', 'ADMIN'])
  role?: 'PATIENT' | 'PROFESSIONAL' | 'ADMIN';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'BLOCKED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'BLOCKED'])
  status?: 'ACTIVE' | 'BLOCKED';

  @ApiPropertyOptional({ description: 'Nome, e-mail ou CPF completo.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'BLOCKED'] })
  @IsIn(['ACTIVE', 'BLOCKED'])
  status!: 'ACTIVE' | 'BLOCKED';

  @ApiProperty({ example: 'Uso indevido da plataforma.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo.' })
  @MaxLength(500)
  reason!: string;
}

export class ListClinicsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED'])
  status?: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'SUSPENDED';
}

/** O que o admin conferiu antes de aprovar um local. */
export class ClinicChecklistDto {
  @ApiProperty({ description: 'Conferi o CNES no site do DATASUS.' })
  @IsBoolean({ message: 'Marque se o CNES foi conferido.' })
  cnesChecked!: boolean;

  @ApiProperty({ description: 'O nome e o endereço batem com o cadastro do CNES.' })
  @IsBoolean({ message: 'Marque se o endereço confere.' })
  addressMatches!: boolean;

  @ApiProperty({ description: 'O médico responsável aparece no CNES deste local.' })
  @IsBoolean({ message: 'Marque se o médico consta no CNES.' })
  professionalListed!: boolean;

  @ApiProperty({ description: 'Abri o documento do local (alvará ou comprovante) e ele confere.' })
  @IsBoolean({ message: 'Marque se o documento do local foi conferido.' })
  documentChecked!: boolean;
}

export class ClinicDecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED'] })
  @IsIn(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED'])
  decision!: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'SUSPENDED';

  @ApiPropertyOptional({ example: 'Endereço conferido.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ type: ClinicChecklistDto, description: 'Obrigatório para aprovar.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicChecklistDto)
  checklist?: ClinicChecklistDto;
}

export class ListAuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Só as ações desta pessoa (ex.: um médico).' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ enum: ['PROFESSIONAL', 'ADMIN'] })
  @IsOptional()
  @IsIn(['PROFESSIONAL', 'ADMIN'])
  scope?: 'PROFESSIONAL' | 'ADMIN';

  @ApiPropertyOptional({ example: 'SERVICE_DELETED' })
  @IsOptional()
  @Matches(/^[A-Z_]{3,60}$/)
  action?: string;
}

export class ListSafetyAlertsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'RESOLVED'], default: 'OPEN' })
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: 'OPEN' | 'RESOLVED';
}

export class ResolveSafetyAlertDto {
  @ApiProperty({ example: 'Liguei para o titular; é a mãe da criança, documentos enviados.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5, { message: 'Descreva o que foi verificado (mínimo de 5 caracteres).' })
  @MaxLength(2000)
  resolution!: string;
}
