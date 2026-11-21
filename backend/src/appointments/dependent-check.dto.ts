import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DependentCheckDto {
  @ApiProperty({
    enum: ['CONFIRMED', 'MISMATCH'],
    description: 'CONFIRMED: documentos conferem. MISMATCH: não foi possível confirmar o vínculo.',
  })
  @IsIn(['CONFIRMED', 'MISMATCH'], { message: 'Informe se o vínculo conferiu ou não.' })
  result!: 'CONFIRMED' | 'MISMATCH';

  @ApiPropertyOptional({ description: 'O que foi observado (vai só para a administração).' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  note?: string;
}
