import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    example: 'mariana@lifehub.local',
    description: 'E-mail ou CPF (com ou sem pontuação).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  login!: string;

  @ApiProperty({ example: 'Senha123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
