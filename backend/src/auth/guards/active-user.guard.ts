import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../types/authenticated-user';
import { AuthSessionsService } from '../services/auth-sessions.service';

@Injectable()
export class ActiveUserGuard implements CanActivate {
    constructor(
    private readonly usersService: UsersService,
    private readonly authSessionsService: AuthSessionsService,
    ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;

    if (!user) {
      return false;
    }

    await this.usersService.assertUserActive(user.id);

    await this.authSessionsService.assertSessionActive(
        user.sessionId,
        user.id,
    );

    return true;
  }
}