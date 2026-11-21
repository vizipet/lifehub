import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

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
}