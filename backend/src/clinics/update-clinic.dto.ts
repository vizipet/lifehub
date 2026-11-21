import {
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';
import {
  IsOptional,
  IsUUID,
} from 'class-validator';
import { CreateClinicDto } from './create-clinic.dto';

export class UpdateClinicDto extends PartialType(
  CreateClinicDto,
) {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description:
      'Profissional responsável técnico pela clínica.',
  })
  @IsOptional()
  @IsUUID()
  technicalResponsibleProfessionalId?: string;
}