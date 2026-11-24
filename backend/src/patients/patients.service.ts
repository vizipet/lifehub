import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Relationship } from '../generated/prisma/enums';
import { PrismaService } from '../common/prisma/prisma.service';
import { CpfProtector, maskCpf } from '../common/security/cpf';
import { AuditService } from '../audit/audit.service';
import {
  MANY_MINORS_THRESHOLD,
  MANY_MINORS_WINDOW_MS,
  openSafetyAlert,
} from '../safety/safety-alerts';
import { CreateDependentDto, UpdatePatientDto } from './patient.dto';
import { validatePatientPhoto } from './patient-photo';

/** Limite simples para evitar abuso de cadastro de dependentes. */
export const MAX_DEPENDENTS = 10;
// Regra de coerência cadastral, não uma afirmação sobre fertilidade.
export const MIN_PARENT_AGE_GAP = 12;

export interface OwnedPatient {
  id: string;
  holderId: string;
  name: string;
}

const PATIENT_SELECT = {
  id: true,
  holderId: true,
  relationship: true,
  name: true,
  birthDate: true,
  sex: true,
  cpfLast2: true,
  guardianConsentAt: true,
  createdAt: true,
  updatedAt: true,
  photo: { select: { updatedAt: true } },
} as const;

type PatientRow = {
  id: string;
  holderId: string;
  relationship: Relationship;
  name: string;
  birthDate: Date;
  sex: string;
  cpfLast2: string | null;
  guardianConsentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  photo?: { updatedAt: Date } | null;
};

export function calculateAge(birthDate: Date, today = new Date()): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDifference = today.getUTCMonth() - birthDate.getUTCMonth();
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

function present(patient: PatientRow) {
  const { cpfLast2, birthDate, photo, ...rest } = patient;
  return {
    ...rest,
    birthDate: birthDate.toISOString().slice(0, 10),
    age: calculateAge(birthDate),
    isHolder: patient.relationship === Relationship.SELF,
    cpfMasked: maskCpf(cpfLast2),
    photoVersion: photo?.updatedAt.toISOString() ?? null,
  };
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cpf: CpfProtector,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sinais de cadastro falso: o mesmo CPF em outra conta, ou muitas crianças
   * cadastradas em pouco tempo. Não bloqueia (pai e mãe podem ter contas
   * separadas); vira alerta para a administração analisar.
   */
  private async flagSuspiciousDependent(
    holderId: string,
    patient: { id: string; relationship: Relationship; birthDate: Date },
    cpfHash: string | undefined,
  ) {
    if (cpfHash) {
      const [otherPatients, adultAccount] = await Promise.all([
        this.prisma.patient.findMany({
          where: { cpfHash, deletedAt: null, holderId: { not: holderId } },
          select: { holderId: true },
        }),
        this.prisma.user.findFirst({ where: { cpfHash, id: { not: holderId } }, select: { id: true } }),
      ]);
      const otherHolderIds = [...new Set(otherPatients.map((row) => row.holderId))];
      if (otherHolderIds.length > 0 || adultAccount) {
        await openSafetyAlert(this.prisma, {
          kind: 'DUPLICATE_CPF',
          holderId,
          patientId: patient.id,
          details: {
            relationship: patient.relationship,
            otherHolderIds,
            hasOwnAccount: Boolean(adultAccount),
          },
        });
      }
    }

    if (calculateAge(patient.birthDate) < 18) {
      const since = new Date(Date.now() - MANY_MINORS_WINDOW_MS);
      const adultCutoff = new Date();
      adultCutoff.setUTCFullYear(adultCutoff.getUTCFullYear() - 18);
      // Conta também os já removidos: cadastrar e apagar não esconde o padrão.
      const recentMinors = await this.prisma.patient.count({
        where: {
          holderId,
          relationship: { not: Relationship.SELF },
          createdAt: { gte: since },
          birthDate: { gt: adultCutoff },
        },
      });
      if (recentMinors >= MANY_MINORS_THRESHOLD) {
        await openSafetyAlert(this.prisma, {
          kind: 'MANY_MINORS',
          holderId,
          details: { count: recentMinors, hours: MANY_MINORS_WINDOW_MS / 3_600_000 },
        });
      }
    }
  }

  async listByHolder(holderId: string) {
    const patients = await this.prisma.patient.findMany({
      where: { holderId, deletedAt: null },
      select: PATIENT_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    // Titular sempre primeiro.
    patients.sort(
      (a, b) =>
        Number(b.relationship === Relationship.SELF) -
        Number(a.relationship === Relationship.SELF),
    );
    return patients.map(present);
  }

  async findOwnedById(patientId: string, holderId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, holderId, deletedAt: null },
      select: PATIENT_SELECT,
    });
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }
    return present(patient);
  }

  /** Usado pelo agendamento: garante que o paciente pertence à conta. */
  async assertPatientOwnership(
    patientId: string,
    holderId: string,
  ): Promise<OwnedPatient> {
    const patient = await this.findOwnedById(patientId, holderId);
    return { id: patient.id, holderId: patient.holderId, name: patient.name };
  }

  private async validateFamilyAge(holderId: string, relationship: Relationship, birthDate: string) {
    if (relationship !== Relationship.CHILD && relationship !== Relationship.PARENT) return;
    const holder = await this.prisma.patient.findFirst({
      where: { holderId, relationship: Relationship.SELF, deletedAt: null },
      select: { birthDate: true },
    });
    if (!holder) throw new NotFoundException('Cadastro do titular não encontrado.');
    const dependentBirth = new Date(`${birthDate}T00:00:00Z`);
    const gap = relationship === Relationship.CHILD
      ? calculateAge(holder.birthDate, dependentBirth)
      : calculateAge(dependentBirth, holder.birthDate);
    if (gap < MIN_PARENT_AGE_GAP) {
      throw new BadRequestException({
        code: 'INVALID_FAMILY_AGE_GAP',
        message: relationship === Relationship.CHILD
          ? `O filho deve ser pelo menos ${MIN_PARENT_AGE_GAP} anos mais novo que o titular. Confira o parentesco e a data de nascimento.`
          : `O pai ou a mãe deve ser pelo menos ${MIN_PARENT_AGE_GAP} anos mais velho que o titular. Confira o parentesco e a data de nascimento.`,
      });
    }
  }

  async createDependent(holderId: string, dto: CreateDependentDto) {
    const count = await this.prisma.patient.count({
      where: { holderId, deletedAt: null, relationship: { not: Relationship.SELF } },
    });
    if (count >= MAX_DEPENDENTS) {
      throw new BadRequestException({
        code: 'DEPENDENT_LIMIT_REACHED',
        message: `Cada conta pode ter até ${MAX_DEPENDENTS} dependentes.`,
      });
    }

    const protectedCpf = dto.cpf ? this.cpf.protect(dto.cpf) : undefined;

    if (protectedCpf) {
      const duplicate = await this.prisma.patient.findFirst({
        where: { holderId, cpfHash: protectedCpf.cpfHash, deletedAt: null },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'PATIENT_ALREADY_REGISTERED',
          message: 'Este CPF já está cadastrado na sua conta.',
        });
      }
    }

    await this.validateFamilyAge(holderId, dto.relationship, dto.birthDate);

    try {
      const patient = await this.prisma.patient.create({
        data: {
          holderId,
          relationship: dto.relationship,
          name: dto.name,
          birthDate: new Date(`${dto.birthDate}T00:00:00Z`),
          sex: dto.sex,
          guardianConsentAt: new Date(),
          ...protectedCpf,
        },
        select: PATIENT_SELECT,
      });
      // Prova da declaração: quem declarou, quando e qual parentesco.
      await this.audit.record({
        actorId: holderId,
        action: 'DEPENDENT_CREATED',
        entityType: 'PATIENT',
        entityId: patient.id,
        details: {
          relationship: patient.relationship,
          minor: calculateAge(patient.birthDate) < 18,
          cpfInformed: Boolean(protectedCpf),
          declaration: 'GUARDIAN_UNDER_PENALTY_ART_299',
        },
      });
      await this.flagSuspiciousDependent(holderId, patient, protectedCpf?.cpfHash);
      return present(patient);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: 'PATIENT_ALREADY_REGISTERED',
          message: 'Este CPF já está cadastrado na sua conta.',
        });
      }
      throw error;
    }
  }

  async updateOwned(patientId: string, holderId: string, dto: UpdatePatientDto) {
    const current = await this.findOwnedById(patientId, holderId);

    // Nome e nascimento do titular vêm do perfil da conta.
    if (
      current.isHolder &&
      (dto.name !== undefined || dto.birthDate !== undefined || dto.relationship !== undefined)
    ) {
      throw new ForbiddenException({
        code: 'HOLDER_FIELDS_LOCKED',
        message: 'Altere seus próprios dados em "Meu perfil".',
      });
    }

    if (!current.isHolder) {
      await this.validateFamilyAge(holderId, dto.relationship ?? current.relationship, dto.birthDate ?? current.birthDate);
    }

    const patient = await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.birthDate !== undefined && {
          birthDate: new Date(`${dto.birthDate}T00:00:00Z`),
        }),
        ...(dto.sex !== undefined && { sex: dto.sex }),
        ...(dto.relationship !== undefined && { relationship: dto.relationship }),
      },
      select: PATIENT_SELECT,
    });
    return present(patient);
  }

  async readPhoto(patientId: string, holderId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, holderId, deletedAt: null, holder: { status: 'ACTIVE' } },
      select: { photo: { select: { bytes: true } } },
    });
    if (!patient?.photo) throw new NotFoundException('Foto não encontrada.');
    return { base64: Buffer.from(patient.photo.bytes).toString('base64') };
  }

  async uploadPhoto(patientId: string, holderId: string, file: { buffer: Buffer; size: number }, authorized: boolean) {
    if (!authorized) throw new BadRequestException('Confirme a autorização para cadastrar a foto.');
    const bytes = validatePatientPhoto(file);
    return this.prisma.$transaction(async (tx) => {
      // Lock the patient row before changing its photo, serializing with removal.
      const owned = await tx.patient.updateMany({
        where: { id: patientId, holderId, deletedAt: null, holder: { status: 'ACTIVE' },
          OR: [{ relationship: Relationship.SELF }, { guardianConsentAt: { not: null } }] },
        data: { updatedAt: new Date() },
      });
      if (owned.count !== 1) throw new NotFoundException('Paciente não encontrado.');
      const photo = await tx.patientPhoto.upsert({
        where: { patientId },
        create: { patientId, bytes: new Uint8Array(bytes) },
        update: { bytes: new Uint8Array(bytes) },
        select: { updatedAt: true },
      });
      return { photoVersion: photo.updatedAt.toISOString() };
    });
  }

  async removePhoto(patientId: string, holderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const owned = await tx.patient.updateMany({
        where: { id: patientId, holderId, deletedAt: null, holder: { status: 'ACTIVE' } },
        data: { updatedAt: new Date() },
      });
      if (owned.count !== 1) throw new NotFoundException('Paciente não encontrado.');
      await tx.patientPhoto.deleteMany({ where: { patientId } });
    });
  }

  async removeOwned(patientId: string, holderId: string): Promise<void> {
    const patient = await this.findOwnedById(patientId, holderId);

    if (patient.isHolder) {
      throw new ForbiddenException({
        code: 'HOLDER_CANNOT_BE_REMOVED',
        message: 'O titular não pode ser removido. Para isso, exclua a conta.',
      });
    }

    const upcoming = await this.prisma.appointment.count({
      where: {
        patientId,
        status: AppointmentStatus.CONFIRMED,
        slot: { startsAt: { gt: new Date() } },
      },
    });
    if (upcoming > 0) {
      throw new ConflictException({
        code: 'PATIENT_HAS_UPCOMING_APPOINTMENTS',
        message: 'Cancele as consultas futuras deste dependente antes de removê-lo.',
      });
    }

    // Exclusão lógica: o histórico de consultas continua íntegro.
    await this.prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: patientId },
        data: { deletedAt: new Date(), cpfHash: null, cpfEncrypted: null, cpfLast2: null },
      });
      await tx.patientPhoto.deleteMany({ where: { patientId } });
    });
  }
}
