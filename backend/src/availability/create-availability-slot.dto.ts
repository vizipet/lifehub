import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID } from 'class-validator';

export class CreateAvailabilitySlotDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Profissional que atenderá neste horário.',
  })
  @IsUUID('4')
  professionalId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Serviço oferecido neste horário.',
  })
  @IsUUID('4')
  serviceId!: string;

  @ApiProperty({
    example: '2030-01-10T12:00:00.000Z',
    description:
      'Início do horário em ISO 8601. Datas com offset são normalizadas para UTC.',
  })
  @IsISO8601({ strict: true })
  startsAt!: string;

  @ApiProperty({
    example: '2030-01-10T12:30:00.000Z',
    description: 'Fim do horário em ISO 8601. Deve ser posterior ao início.',
  })
  @IsISO8601({ strict: true })
  endsAt!: string;
}
