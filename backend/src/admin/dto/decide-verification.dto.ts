import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { VERIFICATION_DECISIONS, type VerificationDecision } from '../../notifications/verification-decision.event';

export class DecideVerificationDto {
  @IsIn(VERIFICATION_DECISIONS)
  decision: VerificationDecision;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;

  @IsString()
  @IsDateString({ strict: true })
  @MaxLength(40)
  expectedSubmittedAt: string;
}
