import { AuditService } from '../audit/audit.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AvailabilityService } from '../availability/availability.service';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AppointmentStatus,
  Modality,
  UserRole,
} from '../generated/prisma/client';
import { PatientsService } from '../patients/patients.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { ServicesService } from '../services/services.service';
import type { OutboxContract } from '../auth/contracts/outbox.contract';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './create-appointment.dto';
import { AppointmentListView } from './list-appointments-query.dto';

describe('AppointmentsService — confirmação transacional G2', () => {
  const dto: CreateAppointmentDto = {
    patientId: '550e8400-e29b-41d4-a716-446655440000',
    serviceId: '550e8400-e29b-41d4-a716-446655440001',
    professionalId: '550e8400-e29b-41d4-a716-446655440002',
    clinicId: '550e8400-e29b-41d4-a716-446655440003',
    slotId: '550e8400-e29b-41d4-a716-446655440004',
  };

  const startsAt = new Date('2030-01-10T12:00:00.000Z');
  const endsAt = new Date('2030-01-10T12:30:00.000Z');
  const createdAt = new Date('2030-01-01T12:00:00.000Z');

  const result = {
    id: 'appointment-id',
    status: 'CONFIRMED',
    holderId: 'holder-id',
    patientId: dto.patientId,
  serviceId: dto.serviceId,
  professionalId: dto.professionalId,
  clinicId: dto.clinicId,
  slotId: dto.slotId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    serviceName: 'Consulta',
    professionalName: 'Dra. Maria',
    clinicName: 'Clínica',
    createdAt: createdAt.toISOString(),
  };

  const findAttempt = jest.fn();
const findAppointments = jest.fn();
const findSharedPhoto = jest.fn();
const revokePhoto = jest.fn();
const findAppointmentForCancellation = jest.fn();
const updateAppointmentForCancellation = jest.fn();
const findCancelledAppointment = jest.fn();
const createAppointment = jest.fn();
const createIdempotencyKey = jest.fn();

const tx = {
  appointment: {
    create: createAppointment,
    findFirst: findAppointmentForCancellation,
    updateMany: updateAppointmentForCancellation,
    findUniqueOrThrow: findCancelledAppointment,
  },
  idempotencyKey: {
    create: createIdempotencyKey,
  },
};

const transaction = jest.fn();

const prisma = {
  appointment: {
    findMany: findAppointments,
    findFirst: findSharedPhoto,
    updateMany: revokePhoto,
  },
  idempotencyKey: {
    findUnique: findAttempt,
  },
  $transaction: transaction,
} as unknown as PrismaService;

  const patientOwnership = jest.fn();
  const findOwnedById = jest.fn();
  const patientsService = {
    assertPatientOwnership: patientOwnership,
    findOwnedById,
  } as unknown as PatientsService;

  const validateService = jest.fn();
  const validateBookingEligibility = jest.fn();
  const servicesService = {
    validateService,
    validateBookingEligibility,
  } as unknown as ServicesService;

  const validateProfessional = jest.fn();
  const findMine = jest.fn();

  const professionalsService = {
    validateProfessional,
    findMine,
  } as unknown as ProfessionalsService;

  const validateClinicForBooking = jest.fn();
  const clinicsService = {
    validateClinicForBooking,
  } as unknown as ClinicsService;

 const validateSlotForBooking = jest.fn();
const reserveSlot = jest.fn();
const releaseSlot = jest.fn();

const availabilityService = {
  validateSlotForBooking,
  reserveSlot,
  releaseSlot,
} as unknown as AvailabilityService;

  const emitOutbox = jest.fn();
  const outbox = { emitOutbox } as unknown as OutboxContract;

  let service: AppointmentsService;

  beforeEach(() => {
  jest.clearAllMocks();

  findAppointments.mockResolvedValue([]);
  revokePhoto.mockResolvedValue({ count: 0 });

  findMine.mockResolvedValue({
    id: 'professional-profile-id',
    userId: 'professional-user-id',
  });

  findAppointmentForCancellation.mockResolvedValue({
  id: 'appointment-id',
  holderId: 'holder-id',
  professionalId: dto.professionalId,
  clinicId: dto.clinicId,
  slotId: dto.slotId,
  status: AppointmentStatus.CONFIRMED,
  slot: {
    startsAt,
  },
});

updateAppointmentForCancellation.mockResolvedValue({
  count: 1,
});


releaseSlot.mockResolvedValue({
  id: dto.slotId,
  status: 'AVAILABLE',
});

findCancelledAppointment.mockResolvedValue({
  id: 'appointment-id',
  holderId: 'holder-id',
  slotId: dto.slotId,
  status: AppointmentStatus.CANCELLED_BY_PATIENT,
});

  findAttempt.mockResolvedValue(null);
    transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    patientOwnership.mockResolvedValue({ id: dto.patientId, holderId: 'holder-id' });
    validateService.mockResolvedValue({ id: dto.serviceId });
    validateProfessional.mockResolvedValue({ id: dto.professionalId, name: 'Dra. Maria' });
    validateClinicForBooking.mockResolvedValue({
      id: dto.clinicId,
      name: 'Clínica',
      address: 'Rua Exemplo, 1',
    });
    validateBookingEligibility.mockResolvedValue({
      id: dto.serviceId,
      name: 'Consulta',
      durationMinutes: 30,
      modality: Modality.IN_PERSON,
      priceCents: 5000,
    });
    validateSlotForBooking.mockResolvedValue({
      id: dto.slotId,
      serviceId: dto.serviceId,
      professionalId: dto.professionalId,
      clinicId: dto.clinicId,
      startsAt,
      endsAt,
    });
    reserveSlot.mockResolvedValue({ id: dto.slotId, status: 'BOOKED' });
    createAppointment.mockResolvedValue({
      id: result.id,
      status: result.status,
      holderId: result.holderId,
      patientId: dto.patientId,
      serviceId: dto.serviceId,
      professionalId: dto.professionalId,
      clinicId: dto.clinicId,
      slotId: dto.slotId,
      createdAt,
    });
    createIdempotencyKey.mockResolvedValue({ id: 'idempotency-id' });
    emitOutbox.mockResolvedValue(undefined);
    service = new AppointmentsService(
      patientsService,
      prisma,
      outbox,
      servicesService,
      professionalsService,
      clinicsService,
      availabilityService,
      { record: jest.fn() } as unknown as AuditService,
    );
  });

  it('confirma consulta e registra snapshots, idempotência e Outbox no mesmo tx', async () => {
    await expect(service.create('holder-id', dto, 'key-1')).resolves.toEqual(result);

    expect(patientOwnership).toHaveBeenCalledWith(dto.patientId, 'holder-id');
    expect(validateService).toHaveBeenCalledWith(dto.serviceId, tx);
    expect(validateProfessional).toHaveBeenCalledWith(dto.professionalId, tx);
    expect(validateClinicForBooking).toHaveBeenCalledWith(dto.clinicId, tx);
    expect(validateBookingEligibility).toHaveBeenCalledWith(
      {
        serviceId: dto.serviceId,
        professionalId: dto.professionalId,
        clinicId: dto.clinicId,
      },
      tx,
    );
    expect(validateSlotForBooking).toHaveBeenCalledWith(
      dto.slotId,
      {
        serviceId: dto.serviceId,
        professionalId: dto.professionalId,
        clinicId: dto.clinicId,
      },
      tx,
    );
    expect(reserveSlot).toHaveBeenCalledWith(dto.slotId, tx);
    expect(createAppointment).toHaveBeenCalledWith({
      data: {
        holderId: 'holder-id',
        patientId: dto.patientId,
        serviceId: dto.serviceId,
        professionalId: dto.professionalId,
        clinicId: dto.clinicId,
        slotId: dto.slotId,
        status: 'CONFIRMED',
        serviceNameSnapshot: 'Consulta',
        serviceDurationMinutesSnapshot: 30,
        serviceModalitySnapshot: Modality.IN_PERSON,
        servicePriceCentsSnapshot: 5000,
        professionalNameSnapshot: 'Dra. Maria',
        clinicNameSnapshot: 'Clínica',
        clinicAddressSnapshot: 'Rua Exemplo, 1',
      },
    });
    expect(emitOutbox).toHaveBeenCalledWith(
      {
        type: 'APPOINTMENT_CONFIRMED',
        payload: {
          appointmentId: 'appointment-id',
          holderId: 'holder-id',
          patientId: dto.patientId,
          slotId: dto.slotId,
          clinicId: dto.clinicId,
        },
      },
      tx,
    );
    expect(createIdempotencyKey).toHaveBeenCalledWith({
      data: {
        userId: 'holder-id',
        operation: 'CREATE_APPOINTMENT',
        key: 'key-1',
        result,
      },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('registra autorização de foto apenas quando marcada e protege a repetição idempotente', async () => {
    await service.create('holder-id', { ...dto, sharePatientPhoto: true }, 'photo-key');
    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ photoConsentAt: expect.any(Date) }),
    }));
    findAttempt.mockResolvedValue({ result: { ...result, sharePatientPhoto: true } });
    await expect(service.create('holder-id', dto, 'photo-key')).rejects.toBeInstanceOf(ConflictException);
  });

  it('restringe consulta da foto ao médico aprovado, atendimento ativo e autorização não revogada', async () => {
    findSharedPhoto.mockResolvedValue({ patient: { photo: { bytes: Buffer.from('photo') } } });
    await expect(service.readSharedPatientPhoto('doctor-id', 'appointment-id')).resolves.toEqual({ base64: 'cGhvdG8=' });
    expect(findSharedPhoto).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'appointment-id', professional: { userId: 'doctor-id', verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } },
        status: 'CONFIRMED', photoConsentAt: { not: null }, photoConsentRevokedAt: null,
        slot: { endsAt: { gt: expect.any(Date) } }, patient: { deletedAt: null }, holder: { status: 'ACTIVE' },
      }),
    }));
    findSharedPhoto.mockResolvedValue(null);
    await expect(service.readSharedPatientPhoto('other-doctor', 'appointment-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revoga autorização somente para agendamento da própria conta', async () => {
    revokePhoto.mockResolvedValue({ count: 1 });
    await service.revokeSharedPatientPhoto('holder-id', 'appointment-id');
    expect(revokePhoto).toHaveBeenCalledWith({
      where: { id: 'appointment-id', holderId: 'holder-id', photoConsentAt: { not: null }, photoConsentRevokedAt: null },
      data: { photoConsentRevokedAt: expect.any(Date) },
    });
    revokePhoto.mockResolvedValue({ count: 0 });
    findSharedPhoto.mockResolvedValue(null);
    await expect(service.revokeSharedPatientPhoto('other-holder', 'appointment-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('devolve resultado anterior da mesma chave sem gravar duas vezes', async () => {
    findAttempt.mockResolvedValue({ result });
    await expect(service.create('holder-id', dto, 'key-1')).resolves.toEqual(result);

    expect(transaction).not.toHaveBeenCalled();
    expect(patientOwnership).not.toHaveBeenCalled();
    expect(reserveSlot).not.toHaveBeenCalled();
  });

  it('recusa mesma chave utilizada com dados diferentes', async () => {
    findAttempt.mockResolvedValue({ result });
    await expect(
      service.create(
  'holder-id',
  {
    patientId: dto.patientId,
    serviceId: dto.serviceId,
    professionalId: dto.professionalId,
    clinicId: dto.clinicId,
    slotId: 'different-slot',
  },
  'key-1',
),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('exige chave de idempotência válida', async () => {
    await expect(service.create('holder-id', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('holder-id', dto, 'chave com espaco')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findAttempt).not.toHaveBeenCalled();
  });

  it('bloqueia pet que não pertence ao tutor', async () => {
    patientOwnership.mockRejectedValue(new NotFoundException('Pet não encontrado'));
    await expect(service.create('holder-id', dto, 'key-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('recusa serviço ou espécie incompatível antes de reservar horário', async () => {
    validateBookingEligibility.mockRejectedValue(
      new ConflictException('Serviço incompatível'),
    );
    await expect(service.create('holder-id', dto, 'key-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(reserveSlot).not.toHaveBeenCalled();
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it('recusa horário mais curto que o serviço', async () => {
    validateBookingEligibility.mockResolvedValue({
      id: dto.serviceId,
      name: 'Consulta longa',
      durationMinutes: 60,
      modality: Modality.IN_PERSON,
      priceCents: null,
    });
    await expect(service.create('holder-id', dto, 'key-1')).rejects.toMatchObject({
      response: { code: 'SLOT_DURATION_MISMATCH' },
    });
    expect(reserveSlot).not.toHaveBeenCalled();
  });

  it('rejeita slot já reservado e não cria appointment', async () => {
    reserveSlot.mockRejectedValue(new ConflictException('Horário indisponível'));
    await expect(service.create('holder-id', dto, 'key-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(createAppointment).not.toHaveBeenCalled();
    expect(createIdempotencyKey).not.toHaveBeenCalled();
  });

  it('recarrega resultado vencedor após concorrência com a mesma chave', async () => {
    findAttempt.mockResolvedValueOnce(null).mockResolvedValueOnce({ result });
    transaction.mockRejectedValue({ code: 'P2002' });

    await expect(service.create('holder-id', dto, 'key-1')).resolves.toEqual(result);
    expect(findAttempt).toHaveBeenCalledTimes(2);
  });

  it('retorna 409 quando ocorre colisão de unicidade sem registro idempotente', async () => {
    transaction.mockRejectedValue({ code: 'P2002' });
    await expect(service.create('holder-id', dto, 'key-1')).rejects.toMatchObject({
      response: { code: 'APPOINTMENT_CONFLICT' },
    });
  });

  it('interrompe persistência idempotente quando a Outbox falha', async () => {
    emitOutbox.mockRejectedValue(new Error('Outbox indisponível'));
    await expect(service.create('holder-id', dto, 'key-1')).rejects.toThrow(
      'Outbox indisponível',
    );
    expect(createIdempotencyKey).not.toHaveBeenCalled();
    // O rollback efetivo é responsabilidade do Prisma/PostgreSQL e exige
    // teste de integração real, não é comprovado por este mock.
  });
describe('listForUser', () => {
  it('lista agenda futura somente do tutor autenticado', async () => {
    await service.listForUser(
      'holder-id',
      UserRole.PATIENT,
      {
        view: AppointmentListView.UPCOMING,
      },
    );

    expect(findAppointments).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            holderId: 'holder-id',
          },
          {
            status: AppointmentStatus.CONFIRMED,
            OR: [
              { slot: { startsAt: { gt: expect.any(Date) } } },
              { serviceModalitySnapshot: 'REMOTE', slot: { endsAt: { gt: expect.any(Date) } } },
            ],
          },
        ],
      },
      orderBy: {
        slot: {
          startsAt: 'asc',
        },
      },
      select: expect.any(Object),
    });

    expect(findMine).not.toHaveBeenCalled();
  });

  it('lista agenda passada somente do profissional autenticado', async () => {
    await service.listForUser(
      'professional-user-id',
      UserRole.PROFESSIONAL,
      {
        view: AppointmentListView.PAST,
      },
    );

    expect(findMine).toHaveBeenCalledWith(
      'professional-user-id',
    );

    expect(findAppointments).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            professionalId: 'professional-profile-id',
          },
          {
            status: {
              notIn: [
                AppointmentStatus.CANCELLED_BY_PATIENT,
                AppointmentStatus.CANCELLED_BY_PROVIDER,
                AppointmentStatus.CANCELLED_AUTOMATICALLY,
              ],
            },
            slot: {
              startsAt: {
                lte: expect.any(Date),
              },
            },
          },
        ],
      },
      orderBy: {
        slot: {
          startsAt: 'desc',
        },
      },
      select: expect.any(Object),
    });
  });

  it('lista somente appointments cancelados', async () => {
    await service.listForUser(
      'holder-id',
      UserRole.PATIENT,
      {
        view: AppointmentListView.CANCELLED,
      },
    );

    expect(findAppointments).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            holderId: 'holder-id',
          },
          {
            status: {
              in: [
                AppointmentStatus.CANCELLED_BY_PATIENT,
                AppointmentStatus.CANCELLED_BY_PROVIDER,
                AppointmentStatus.CANCELLED_AUTOMATICALLY,
              ],
            },
          },
        ],
      },
      orderBy: {
        slot: {
          startsAt: 'desc',
        },
      },
      select: expect.any(Object),
    });
  });

  it('bloqueia papel que não pode consultar agenda', async () => {
    await expect(
      service.listForUser(
        'admin-id',
        UserRole.ADMIN,
        {
          view: AppointmentListView.UPCOMING,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findAppointments).not.toHaveBeenCalled();
    expect(findMine).not.toHaveBeenCalled();
  });
});
describe('cancelByPatient', () => {
  it('cancela appointment do tutor e libera o slot', async () => {
    await expect(
      service.cancelByPatient(
        'holder-id',
        'appointment-id',
      ),
    ).resolves.toMatchObject({
      id: 'appointment-id',
      status: AppointmentStatus.CANCELLED_BY_PATIENT,
  });
    expect(
      findAppointmentForCancellation,
    ).toHaveBeenCalledWith({
      where: {
        id: 'appointment-id',
        holderId: 'holder-id',
      },
      select: {
        id: true,
        holderId: true,
        professionalId: true,
        clinicId: true,
        slotId: true,
        status: true,
        slot: {
          select: {
            startsAt: true,
          },
        },
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).toHaveBeenCalledWith({
      where: {
        id: 'appointment-id',
        holderId: 'holder-id',
        status: AppointmentStatus.CONFIRMED,
      },
      data: {
        status:
          AppointmentStatus.CANCELLED_BY_PATIENT,
        cancelledAt: expect.any(Date),
        cancellationReason: null,
      },
    });

    expect(releaseSlot).toHaveBeenCalledWith(
      dto.slotId,
      tx,
    );

    expect(emitOutbox).toHaveBeenCalledWith(
      {
        type: 'APPOINTMENT_CANCELLED',
        payload: {
          appointmentId: 'appointment-id',
          holderId: 'holder-id',
          professionalId: dto.professionalId,
          clinicId: dto.clinicId,
          slotId: dto.slotId,
          cancelledBy: UserRole.PATIENT,
        },
      },
      tx,
    );
  });

  it('bloqueia cancelamento de consulta que já começou', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      holderId: 'holder-id',
      professionalId: dto.professionalId,
      clinicId: dto.clinicId,
      slotId: dto.slotId,
      status: AppointmentStatus.CONFIRMED,
      slot: {
        startsAt: new Date(
          '2020-01-01T12:00:00.000Z',
        ),
      },
    });

    await expect(
      service.cancelByPatient(
        'holder-id',
        'appointment-id',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_ALREADY_STARTED',
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).not.toHaveBeenCalled();
    expect(releaseSlot).not.toHaveBeenCalled();
  });

  it('bloqueia cancelamento repetido', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      holderId: 'holder-id',
      professionalId: dto.professionalId,
      clinicId: dto.clinicId,
      slotId: dto.slotId,
      status:
        AppointmentStatus.CANCELLED_BY_PATIENT,
      slot: {
        startsAt,
      },
    });

    await expect(
      service.cancelByPatient(
        'holder-id',
        'appointment-id',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_NOT_CONFIRMED',
      },
    });

    expect(releaseSlot).not.toHaveBeenCalled();
  });

  it('não permite tutor cancelar appointment de terceiro', async () => {
    findAppointmentForCancellation.mockResolvedValue(
      null,
    );

    await expect(
      service.cancelByPatient(
        'outro-tutor-id',
        'appointment-id',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_NOT_FOUND',
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).not.toHaveBeenCalled();
    expect(releaseSlot).not.toHaveBeenCalled();
    expect(emitOutbox).not.toHaveBeenCalled();
  });

  it('interrompe cancelamento quando a liberação do slot falha', async () => {
    releaseSlot.mockRejectedValue(
      new ConflictException({
        code: 'SLOT_NOT_BOOKED',
        message:
          'Somente um horário BOOKED pode ser liberado.',
      }),
    );

    await expect(
      service.cancelByPatient(
        'holder-id',
        'appointment-id',
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(emitOutbox).not.toHaveBeenCalled();
    expect(
      findCancelledAppointment,
    ).not.toHaveBeenCalled();
  });

  it('propaga falha da Outbox durante o cancelamento', async () => {
    emitOutbox.mockRejectedValue(
      new Error('Outbox indisponível'),
    );

    await expect(
      service.cancelByPatient(
        'holder-id',
        'appointment-id',
      ),
    ).rejects.toThrow('Outbox indisponível');

    expect(releaseSlot).toHaveBeenCalledWith(
      dto.slotId,
      tx,
    );

    expect(
      findCancelledAppointment,
    ).not.toHaveBeenCalled();

    // O rollback real será comprovado no teste PostgreSQL.
    });
  });

  describe('cancelByProfessional', () => {
  it('cancela appointment do profissional com motivo e libera o slot', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      holderId: 'holder-id',
      professionalId: 'professional-profile-id',
      clinicId: dto.clinicId,
      slotId: dto.slotId,
      status: AppointmentStatus.CONFIRMED,
      slot: {
        startsAt,
      },
    });

    findCancelledAppointment.mockResolvedValue({
      id: 'appointment-id',
      holderId: 'holder-id',
      slotId: dto.slotId,
      status: AppointmentStatus.CANCELLED_BY_PROVIDER,
    });

    await expect(
      service.cancelByProfessional(
        'professional-user-id',
        'appointment-id',
        '  Imprevisto profissional.  ',
      ),
    ).resolves.toMatchObject({
      id: 'appointment-id',
      status: AppointmentStatus.CANCELLED_BY_PROVIDER,
    });

    expect(findMine).toHaveBeenCalledWith(
      'professional-user-id',
    );

    expect(
      findAppointmentForCancellation,
    ).toHaveBeenCalledWith({
      where: {
        id: 'appointment-id',
        professionalId: 'professional-profile-id',
      },
      select: {
        id: true,
        holderId: true,
        professionalId: true,
        clinicId: true,
        slotId: true,
        status: true,
        slot: {
          select: {
            startsAt: true,
          },
        },
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).toHaveBeenCalledWith({
      where: {
        id: 'appointment-id',
        professionalId: 'professional-profile-id',
        status: AppointmentStatus.CONFIRMED,
      },
      data: {
        status:
          AppointmentStatus.CANCELLED_BY_PROVIDER,
        cancelledAt: expect.any(Date),
        cancellationReason:
          'Imprevisto profissional.',
      },
    });

    expect(releaseSlot).toHaveBeenCalledWith(
      dto.slotId,
      tx,
    );

    expect(emitOutbox).toHaveBeenCalledWith(
      {
        type: 'APPOINTMENT_CANCELLED',
        payload: {
          appointmentId: 'appointment-id',
          holderId: 'holder-id',
          professionalId: 'professional-profile-id',
          clinicId: dto.clinicId,
          slotId: dto.slotId,
          cancelledBy: UserRole.PROFESSIONAL,
          reason: 'Imprevisto profissional.',
        },
      },
      tx,
    );
  });

  it('exige motivo no cancelamento do profissional', async () => {
    await expect(
      service.cancelByProfessional(
        'professional-user-id',
        'appointment-id',
        undefined,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'CANCELLATION_REASON_REQUIRED',
      },
    });

    await expect(
      service.cancelByProfessional(
        'professional-user-id',
        'appointment-id',
        '   ',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'CANCELLATION_REASON_REQUIRED',
      },
    });

    expect(findMine).not.toHaveBeenCalled();
    expect(
      findAppointmentForCancellation,
    ).not.toHaveBeenCalled();
  });

  it('não permite profissional cancelar appointment de outro profissional', async () => {
    findAppointmentForCancellation.mockResolvedValue(
      null,
    );

    await expect(
      service.cancelByProfessional(
        'professional-user-id',
        'appointment-id',
        'Motivo válido',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_NOT_FOUND',
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).not.toHaveBeenCalled();
    expect(releaseSlot).not.toHaveBeenCalled();
    expect(emitOutbox).not.toHaveBeenCalled();
  });

  it('bloqueia profissional se a consulta já começou', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      holderId: 'holder-id',
      professionalId: 'professional-profile-id',
      clinicId: dto.clinicId,
      slotId: dto.slotId,
      status: AppointmentStatus.CONFIRMED,
      slot: {
        startsAt: new Date(
          '2020-01-01T12:00:00.000Z',
        ),
      },
    });

    await expect(
      service.cancelByProfessional(
        'professional-user-id',
        'appointment-id',
        'Motivo válido',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_ALREADY_STARTED',
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).not.toHaveBeenCalled();
    expect(releaseSlot).not.toHaveBeenCalled();
  });

  it('bloqueia cancelamento profissional repetido', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      holderId: 'holder-id',
      professionalId: 'professional-profile-id',
      clinicId: dto.clinicId,
      slotId: dto.slotId,
      status:
        AppointmentStatus.CANCELLED_BY_PROVIDER,
      slot: {
        startsAt,
      },
    });

    await expect(
      service.cancelByProfessional(
        'professional-user-id',
        'appointment-id',
        'Motivo válido',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_NOT_CONFIRMED',
      },
    });

    expect(releaseSlot).not.toHaveBeenCalled();
  });
});
describe('completeByProfessional', () => {
  it('conclui consulta encerrada pelo profissional autorizado', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      professionalId: 'professional-profile-id',
      status: AppointmentStatus.CONFIRMED,
      dependentCheckResult: null,
      attendanceRecordedAt: new Date('2020-01-01T12:00:00.000Z'),
      patient: { relationship: 'SELF' },
      slot: {
        endsAt: new Date(
          '2020-01-01T12:30:00.000Z',
        ),
      },
    });

    findCancelledAppointment.mockResolvedValue({
      id: 'appointment-id',
      professionalId: 'professional-profile-id',
      status: AppointmentStatus.COMPLETED,
    });

    await expect(
      service.completeByProfessional(
        'professional-user-id',
        'appointment-id',
      ),
    ).resolves.toMatchObject({
      id: 'appointment-id',
      status: AppointmentStatus.COMPLETED,
    });

    expect(findMine).toHaveBeenCalledWith(
      'professional-user-id',
    );

    expect(
      findAppointmentForCancellation,
    ).toHaveBeenCalledWith({
      where: {
        id: 'appointment-id',
        professionalId: 'professional-profile-id',
      },
      select: {
        id: true,
        professionalId: true,
        status: true,
        dependentCheckResult: true,
        attendanceRecordedAt: true,
        patient: { select: { relationship: true } },
        slot: {
          select: {
            endsAt: true,
          },
        },
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).toHaveBeenCalledWith({
      where: {
        id: 'appointment-id',
        professionalId: 'professional-profile-id',
        status: AppointmentStatus.CONFIRMED,
      },
      data: {
        status: AppointmentStatus.COMPLETED,
      },
    });
  });

  it('não conclui consulta de dependente sem conferir o vínculo', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      professionalId: 'professional-profile-id',
      status: AppointmentStatus.CONFIRMED,
      dependentCheckResult: null,
      patient: { relationship: 'CHILD' },
      slot: { endsAt: new Date('2020-01-01T12:30:00.000Z') },
    });

    await expect(
      service.completeByProfessional('professional-user-id', 'appointment-id'),
    ).rejects.toMatchObject({ response: { code: 'DEPENDENT_LINK_NOT_CHECKED' } });
    expect(updateAppointmentForCancellation).not.toHaveBeenCalled();
  });

  it('bloqueia conclusão antes do término da consulta', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      professionalId: 'professional-profile-id',
      status: AppointmentStatus.CONFIRMED,
      dependentCheckResult: null,
      patient: { relationship: 'SELF' },
      slot: {
        endsAt: new Date(
          '2030-01-10T12:30:00.000Z',
        ),
      },
    });

    await expect(
      service.completeByProfessional(
        'professional-user-id',
        'appointment-id',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_NOT_FINISHED',
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).not.toHaveBeenCalled();
  });

  it('não permite profissional concluir appointment de outro profissional', async () => {
    findAppointmentForCancellation.mockResolvedValue(
      null,
    );

    await expect(
      service.completeByProfessional(
        'professional-user-id',
        'appointment-id',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_NOT_FOUND',
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).not.toHaveBeenCalled();
  });

  it('bloqueia conclusão repetida ou de appointment não confirmado', async () => {
    findAppointmentForCancellation.mockResolvedValue({
      id: 'appointment-id',
      professionalId: 'professional-profile-id',
      status: AppointmentStatus.COMPLETED,
      dependentCheckResult: null,
      patient: { relationship: 'SELF' },
      slot: {
        endsAt: new Date(
          '2020-01-01T12:30:00.000Z',
        ),
      },
    });

    await expect(
      service.completeByProfessional(
        'professional-user-id',
        'appointment-id',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'APPOINTMENT_NOT_CONFIRMED',
      },
    });

    expect(
      updateAppointmentForCancellation,
    ).not.toHaveBeenCalled();
  });
});
});
