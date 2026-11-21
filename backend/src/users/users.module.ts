import { Module } from '@nestjs/common';
import { SecurityModule } from '../common/security/security.module';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PasswordHashService } from '../auth/services/password-hash.service';
import { AuthSessionsService } from '../auth/services/auth-sessions.service';

@Module({
  imports: [SecurityModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    PasswordHashService,
    AuthSessionsService,
    JwtAuthGuard,
    ActiveUserGuard,
  ],
  exports: [UsersService],
})
export class UsersModule {}