import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'session-id.refresh-secret',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
