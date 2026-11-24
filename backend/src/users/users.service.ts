import type { Prisma } from '../generated/prisma/client';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UpdateMeDto } from './update-me.dto';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole, UserStatus } from '../generated/prisma/client';
import { PasswordHashService } from '../auth/services/password-hash.service';
import { AuthSessionsService } from '../auth/services/auth-sessions.service';

import { CpfProtector, maskCpf, normalizeCpf } from '../common/security/cpf';
import {
  CURRENT_LEGAL_VERSIONS,
  REQUIRED_AT_SIGNUP,
} from '../common/legal/legal-documents';

/** Após 5 senhas erradas seguidas, a conta fica bloqueada por 15 minutos. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

type CreateUserInput = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  birthDate: string;
  passwordHash: string;
  role: UserRole;
};

/** Campos que podem sair da API. CPF só aparece mascarado. */
export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  birthDate: true,
  cpfLast2: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function toPublicUser<T extends { cpfLast2: string; birthDate: Date }>(user: T) {
  const { cpfLast2, birthDate, ...rest } = user;
  return {
    ...rest,
    birthDate: birthDate.toISOString().slice(0, 10),
    cpfMasked: maskCpf(cpfLast2),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashService: PasswordHashService,
    private readonly authSessionsService: AuthSessionsService,
    private readonly cpf: CpfProtector,
  ) {}
  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }

    const normalizedEmail = dto.email
      ? this.normalizeEmail(dto.email)
      : undefined;

    const emailWillChange =
      normalizedEmail !== undefined && normalizedEmail !== user.email;

    const passwordWillChange = dto.newPassword !== undefined;

    const sensitiveChange = emailWillChange || passwordWillChange;

    if (sensitiveChange && !dto.currentPassword) {
      throw new UnauthorizedException({
        code: 'CURRENT_PASSWORD_REQUIRED',
        message: 'A senha atual é obrigatória para esta alteração.',
      });
    }

    if (sensitiveChange) {
      const passwordMatches = await this.passwordHashService.verify(
        user.passwordHash,
        dto.currentPassword!,
      );

      if (!passwordMatches) {
        throw new UnauthorizedException({
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Senha atual inválida.',
        });
      }
    }

    if (emailWillChange) {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'Este e-mail já está cadastrado.',
        });
      }
    }

    const newPasswordHash = passwordWillChange
      ? await this.passwordHashService.hash(dto.newPassword!)
      : undefined;

    const update = async (db: Prisma.TransactionClient | PrismaService) => {
      const updatedUser = await db.user.update({
        where: {
          id: userId,
        },
        data: {
          ...(dto.name !== undefined && {
            name: dto.name.trim(),
          }),
          ...(dto.phone !== undefined && {
            phone: dto.phone.trim(),
          }),
          ...(emailWillChange && {
            email: normalizedEmail,
          }),
          ...(newPasswordHash !== undefined && {
            passwordHash: newPasswordHash,
          }),
        },
        select: PUBLIC_USER_SELECT,
      });

      if (dto.name !== undefined) {
        // Keep the account and the SELF patient in sync, without changing dependent names.
        await db.patient.updateMany({
          where: { holderId: userId, relationship: 'SELF', deletedAt: null },
          data: { name: updatedUser.name },
        });
      }

      if (passwordWillChange) {
        await this.authSessionsService.revokeAllForUser(
          userId,
          db as Prisma.TransactionClient,
        );
      }

      return toPublicUser(updatedUser);
    };

    if (!sensitiveChange && dto.name === undefined) return update(this.prisma);

    return this.prisma.$transaction(async (tx) => {
      // Serialize credential changes with password recovery and deletion requests.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: userId } });
      if (
        !current ||
        (sensitiveChange && (current.passwordHash !== user.passwordHash || current.email !== user.email))
      ) {
        throw new UnauthorizedException({
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'A conta foi alterada. Confirme sua senha atual novamente.',
        });
      }
      if (current.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException({
          code: 'ACCOUNT_NOT_ACTIVE',
          message: 'Esta conta não está disponível para acesso.',
        });
      }
      return update(tx);
    });
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
        // Senha nova desfaz o bloqueio por tentativas erradas.
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }

  async findPublicById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: PUBLIC_USER_SELECT,
    });
    return user ? toPublicUser(user) : null;
  }

  async assertUserActive(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'Esta conta não está disponível para acesso.',
      });
    }
  }

  async findByEmail(email: string) {
    const normalizedEmail = this.normalizeEmail(email);

    return this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });
  }

  /** Aceita e-mail ou CPF. O CPF é procurado pelo HMAC, nunca em texto puro. */
  async findByLogin(login: string) {
    const value = login.trim();
    if (value.includes('@')) return this.findByEmail(value);
    const digits = normalizeCpf(value);
    if (digits.length !== 11) return null;
    return this.prisma.user.findUnique({
      where: { cpfHash: this.cpf.hash(digits) },
    });
  }

  async registerFailedLogin(userId: string): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (user.failedLoginCount >= MAX_FAILED_LOGINS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
        },
      });
    }
  }

  async clearFailedLogins(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  /**
   * Cria a conta numa única transação: usuário, paciente titular (SELF),
   * aceites legais com versão e preferências de notificação.
   */
  async create(input: CreateUserInput) {
    const normalizedEmail = this.normalizeEmail(input.email);
    const protectedCpf = this.cpf.protect(input.cpf);

    const [emailTaken, cpfTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { cpfHash: protectedCpf.cpfHash }, select: { id: true } }),
    ]);

    // Mensagem única para não revelar qual dado já pertence a outra conta.
    if (emailTaken || cpfTaken) {
      throw new ConflictException({
        code: 'ACCOUNT_ALREADY_REGISTERED',
        message: 'Já existe uma conta com este e-mail ou CPF.',
      });
    }

    const birthDate = new Date(`${input.birthDate}T00:00:00Z`);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: input.name.trim(),
            email: normalizedEmail,
            phone: input.phone.trim(),
            birthDate,
            ...protectedCpf,
            passwordHash: input.passwordHash,
            role: input.role,
          },
        });

        await tx.patient.create({
          data: {
            holderId: user.id,
            relationship: 'SELF',
            name: user.name,
            birthDate,
            ...protectedCpf,
          },
        });

        await tx.legalAcceptance.createMany({
          data: REQUIRED_AT_SIGNUP.map((documentType) => ({
            userId: user.id,
            documentType,
            version: CURRENT_LEGAL_VERSIONS[documentType],
          })),
        });

        await tx.notificationPreference.create({
          data: { userId: user.id },
        });

        return user;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: 'ACCOUNT_ALREADY_REGISTERED',
          message: 'Já existe uma conta com este e-mail ou CPF.',
        });
      }
      throw error;
    }
  }
}
