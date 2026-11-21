import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DocumentContentQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  ticket: string;
}
