import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export class CreateProfessionalDto {
  @ApiProperty({ example: '123456', description: 'Número do CRM (somente dígitos).' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{4,8}$/, { message: 'CRM deve ter de 4 a 8 dígitos.' })
  crm!: string;

  @ApiProperty({ example: 'PE', description: 'UF do Conselho Regional de Medicina.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(BRAZILIAN_STATES, { message: 'UF do CRM inválida.' })
  crmState!: string;

  @ApiProperty({ format: 'uuid', description: 'Especialidade principal (lista em /specialties).' })
  @IsUUID('4', { message: 'Especialidade inválida.' })
  specialtyId!: string;

  @ApiPropertyOptional({
    example: 'Atendimento humanizado com foco em prevenção.',
    description: 'Apresentação curta exibida no perfil público.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(600)
  bio?: string;
}
