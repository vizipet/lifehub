import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'mariana@lifehub.local' })
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(160)
  email!: string;
}
