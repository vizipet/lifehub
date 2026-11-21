import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { CreateAvailabilitySlotDto } from './create-availability-slot.dto';

export class CreateAvailabilityBatchDto {
  @ApiProperty({
    type: [CreateAvailabilitySlotDto],
    description:
      'Lista de horários explícitos. O lote não pode ultrapassar uma janela de 90 dias.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateAvailabilitySlotDto)
  slots!: CreateAvailabilitySlotDto[];
}
