import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsUUID, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  patientId!: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  professionalId!: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsUUID()
  clinicId!: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440004',
  })
  @IsUUID()
  slotId!: string;

  @ApiPropertyOptional({ default: false, description: 'Autorização opcional para compartilhar a foto com o médico desta consulta.' })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  sharePatientPhoto?: boolean;
}