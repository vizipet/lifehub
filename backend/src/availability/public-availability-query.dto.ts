import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PublicAvailabilityQueryDto {
  @ApiProperty({ format: 'uuid', description: 'ID do serviço selecionado.' })
  @IsUUID()
  serviceId!: string;

  @ApiProperty({ format: 'uuid', description: 'ID do profissional selecionado.' })
  @IsUUID()
  professionalId!: string;

  @ApiPropertyOptional({
    example: 30,
    minimum: 1,
    maximum: 50,
    description: 'Quantidade máxima de horários futuros a consultar.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
