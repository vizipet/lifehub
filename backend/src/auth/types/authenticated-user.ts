import { UserRole } from '../../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  sessionId: string;
}
