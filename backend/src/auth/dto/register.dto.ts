import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsCpf, IsPastIsoDate } from '../../common/validation/is-cpf.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'Mariana Costa' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'mariana@lifehub.local' })
  @Transform(trim)
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: '(81) 99999-9999' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{10,11}$/, { message: 'Celular deve ter DDD e 8 ou 9 dígitos.' })
  phone!: string;

  @ApiProperty({ example: '529.982.247-25', description: 'CPF com ou sem pontuação.' })
  @IsString()
  @IsCpf()
  cpf!: string;

  @ApiProperty({ example: '1996-04-12', description: 'Data de nascimento (AAAA-MM-DD).' })
  @IsPastIsoDate()
  birthDate!: string;

  @ApiProperty({ example: 'Senha123!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'A senha deve ter letras e números.',
  })
  password!: string;

  @ApiProperty({ example: true, description: 'Aceite dos Termos de Uso vigentes.' })
  @IsBoolean()
  @Equals(true, { message: 'É preciso aceitar os Termos de Uso.' })
  acceptTerms!: boolean;

  @ApiProperty({ example: true, description: 'Ciência da Política de Privacidade vigente.' })
  @IsBoolean()
  @Equals(true, { message: 'É preciso aceitar a Política de Privacidade.' })
  acceptPrivacyPolicy!: boolean;

  @ApiProperty({
    example: true,
    description:
      'Consentimento específico para tratamento de dados de saúde (LGPD, art. 11).',
  })
  @IsBoolean()
  @Equals(true, { message: 'É preciso consentir com o uso dos dados de saúde.' })
  acceptHealthData!: boolean;
}
