import { Module } from '@nestjs/common';
import { OutboxPersistenceModule } from '../notifications/outbox-persistence.module';
import { PasswordResetEnvelope } from '../common/security/password-reset-envelope';
import { PasswordResetFlowService } from './services/password-reset-flow.service';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSessionsService } from './services/auth-sessions.service';
import { PasswordHashService } from './services/password-hash.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ActiveUserGuard } from './guards/active-user.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordResetTokensService } from './services/password-reset-tokens.service';

@Module({
  imports: [
    UsersModule,
    OutboxPersistenceModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: '15m',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHashService,
    AuthSessionsService,
    JwtStrategy,
    JwtAuthGuard,
    ActiveUserGuard,
    RolesGuard,
    PasswordResetTokensService,
    PasswordResetEnvelope,
    PasswordResetFlowService,
  ],
  exports: [
    UsersModule,
    AuthService,
    PasswordHashService,
    AuthSessionsService,
    JwtAuthGuard,
    ActiveUserGuard,
    RolesGuard,
  ],
})
export class AuthModule {}