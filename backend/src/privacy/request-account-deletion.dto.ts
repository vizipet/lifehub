import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RequestAccountDeletionDto {
  @ApiProperty({
    example: 'MinhaSenha@123',
  })
  @IsString()
  @MinLength(1)
  currentPassword!: string;
}
