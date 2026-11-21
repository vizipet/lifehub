import { VerificationStatus } from '../generated/prisma/client';

export const PROFESSIONAL_VERIFICATION_DECIDED = 'PROFESSIONAL_VERIFICATION_DECIDED';
export const VERIFICATION_DECISIONS = [
  VerificationStatus.APPROVED,
  VerificationStatus.CHANGES_REQUESTED,
  VerificationStatus.REJECTED,
] as const;
export type VerificationDecision = typeof VERIFICATION_DECISIONS[number];

export function isVerificationDecision(value: unknown): value is VerificationDecision {
  return VERIFICATION_DECISIONS.some((decision) => decision === value);
}
