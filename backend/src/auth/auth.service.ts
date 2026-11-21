import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '../generated/prisma/client';
import { toPublicUser, UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthSessionsService } from './services/auth-sessions.service';
import { PasswordHashService } from './services/password-hash.service';
import { PasswordResetFlowService } from './services/password-reset-flow.service';

const INVALID_CREDENTIALS = {
  code: 'INVALID_CREDENTIALS',
  message: 'E-mail/CPF ou senha inválidos.',
};

@Injectable()
export class AuthService {
  /** Hash de referência para gastar o mesmo tempo quando a conta não existe. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHashService: PasswordHashService,
    private readonly jwtService: JwtService,
    private readonly authSessionsService: AuthSessionsService,
    private readonly passwordResetFlow: PasswordResetFlowService,
  ) {}

  registerPatient(dto: RegisterDto) {
    return this.register(dto, UserRole.PATIENT);
  }

  registerProfessional(dto: RegisterDto) {
    return this.register(dto, UserRole.PROFESSIONAL);
  }

  private async register(dto: RegisterDto, role: UserRole) {
    const passwordHash = await this.passwordHashService.hash(dto.password);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      cpf: dto.cpf,
      birthDate: dto.birthDate,
      passwordHash,
      role,
    });
    return this.publicUser(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByLogin(dto.login);

    if (!user) {
      // Evita descobrir contas existentes pelo tempo de resposta.
      this.dummyHash ??= this.passwordHashService.hash('lifehub-timing-guard');
      await this.passwordHashService.verify(await this.dummyHash, dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new ForbiddenException({
        code: 'ACCOUNT_TEMPORARILY_LOCKED',
        message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minuto(s) ou recupere sua senha.`,
      });
    }

    const passwordMatches = await this.passwordHashService.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordMatches) {
      await this.usersService.registerFailedLogin(user.id);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'Esta conta não está disponível para acesso.',
      });
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.usersService.clearFailedLogins(user.id);
    }

    const session = await this.authSessionsService.createSession(
      user.id,
      user.passwordHash,
    );

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      type: 'access',
      sid: session.sessionId,
    });

    return {
      accessToken,
      refreshToken: session.refreshToken,
      expiresIn: 900,
      user: this.publicUser(user),
    };
  }

  async refresh(refreshToken: string) {
    const rotated = await this.authSessionsService.rotateSession(refreshToken);

    if (rotated.session.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'Esta conta não está disponível para acesso.',
      });
    }

    const accessToken = await this.jwtService.signAsync({
      sub: rotated.session.user.id,
      role: rotated.session.user.role,
      type: 'access',
      sid: rotated.session.id,
    });

    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: 900,
    };
  }

  async logout(refreshToken: string) {
    await this.authSessionsService.revokeSession(refreshToken);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.passwordResetFlow.request(email);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.passwordResetFlow.confirm(token, newPassword);
  }

  private publicUser(user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    birthDate: Date;
    cpfLast2: string;
    role: UserRole;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return toPublicUser({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      birthDate: user.birthDate,
      cpfLast2: user.cpfLast2,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }
}
