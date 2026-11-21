import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Relationship, Sex } from '../generated/prisma/enums';
import { IsCpf, IsPastIsoDate } from '../common/validation/is-cpf.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const DEPENDENT_RELATIONSHIPS = Object.values(Relationship).filter(
  (value) => value !== Relationship.SELF,
);

export class CreateDependentDto {
  @ApiProperty({ example: 'Lucas Costa' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '2018-03-02' })
  @IsPastIsoDate()
  birthDate!: string;

  @ApiProperty({ enum: Sex, example: Sex.MALE })
  @IsEnum(Sex)
  sex!: Sex;

  @ApiProperty({ enum: DEPENDENT_RELATIONSHIPS, example: Relationship.CHILD })
  @IsIn(DEPENDENT_RELATIONSHIPS, { message: 'Parentesco inválido.' })
  relationship!: Relationship;

  @ApiPropertyOptional({ example: '123.456.789-09', description: 'Opcional para dependentes.' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @IsCpf()
  cpf?: string;

  @ApiProperty({
    example: true,
    description:
      'Declaração de que o titular é responsável legal pelo dependente ou tem a autorização dele.',
  })
  @IsBoolean()
  @Equals(true, { message: 'Confirme a declaração de responsável legal por este dependente.' })
  guardianConsent!: boolean;
}

export class UpdatePatientDto {
  @ApiPropertyOptional({ example: 'Lucas Costa' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '2018-03-02' })
  @IsOptional()
  @IsPastIsoDate()
  birthDate?: string;

  @ApiPropertyOptional({ enum: Sex })
  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @ApiPropertyOptional({ enum: DEPENDENT_RELATIONSHIPS })
  @IsOptional()
  @IsIn(DEPENDENT_RELATIONSHIPS, { message: 'Parentesco inválido.' })
  relationship?: Relationship;
}
