import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/enums';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './create-appointment.dto';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  const getMethodRoles = (
  methodName: 'create' | 'cancel' | 'complete' | 'list',
) => {
  const method = Object.getOwnPropertyDescriptor(
    AppointmentsController.prototype,
    methodName,
  )?.value;

  return Reflect.getMetadata(
    ROLES_KEY,
    method,
  );
};

  const appointmentsService = {
  create: jest.fn(),
  listForUser: jest.fn(),
  cancelByPatient: jest.fn(),
  cancelByProfessional: jest.fn(),
  completeByProfessional: jest.fn(),
};

  const authenticatedUser: AuthenticatedUser = {
    id: 'user-id',
    role: UserRole.PATIENT,
    sessionId: 'session-id',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: appointmentsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(ActiveUserGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = moduleRef.get(AppointmentsController);
  });

  it('usa o tutor autenticado ao criar o agendamento', async () => {
    const dto: CreateAppointmentDto = {
      patientId: '550e8400-e29b-41d4-a716-446655440000',
      serviceId: '550e8400-e29b-41d4-a716-446655440001',
      professionalId:
        '550e8400-e29b-41d4-a716-446655440002',
      clinicId: '550e8400-e29b-41d4-a716-446655440003',
      slotId: '550e8400-e29b-41d4-a716-446655440004',
    };

    appointmentsService.create.mockResolvedValue({
      id: 'appointment-id',
      status: 'CONFIRMED',
    });

    const response = await controller.create(
      authenticatedUser,
      'idempotency-key-1',
      dto,
    );

    expect(
      appointmentsService.create,
    ).toHaveBeenCalledWith(
      'user-id',
      dto,
      'idempotency-key-1',
    );

    expect(response).toEqual({
      data: {
        id: 'appointment-id',
        status: 'CONFIRMED',
      },
    });
  });

  it('restringe a criação ao papel TUTOR', () => {
    const roles = getMethodRoles('create');

  expect(roles).toEqual([
    UserRole.PATIENT,
  ]);
});

it('permite cancelamento para TUTOR e PROFESSIONAL', () => {
  const roles = getMethodRoles('cancel');

  expect(roles).toEqual([
    UserRole.PATIENT,
    UserRole.PROFESSIONAL,
  ]);
});

it('restringe conclusão ao papel PROFESSIONAL', () => {
  const roles = getMethodRoles('complete');

  expect(roles).toEqual([
    UserRole.PROFESSIONAL,
  ]);
});

it('encaminha cancelamento do paciente, com o motivo, para cancelByPatient', async () => {
  appointmentsService.cancelByPatient.mockResolvedValue({
    id: 'appointment-id',
    status: 'CANCELLED_BY_PATIENT',
  });

  const response = await controller.cancel(
    authenticatedUser,
    'appointment-id',
    { reason: 'Encontrei outro horário' },
  );

  expect(
    appointmentsService.cancelByPatient,
  ).toHaveBeenCalledWith(
    'user-id',
    'appointment-id',
    'Encontrei outro horário',
  );

  expect(
    appointmentsService.cancelByProfessional,
  ).not.toHaveBeenCalled();

  expect(response).toEqual({
    data: {
      id: 'appointment-id',
      status: 'CANCELLED_BY_PATIENT',
    },
  });
});

it('encaminha cancelamento do profissional com motivo', async () => {
  const professionalUser: AuthenticatedUser = {
    ...authenticatedUser,
    role: UserRole.PROFESSIONAL,
  };

  appointmentsService.cancelByProfessional.mockResolvedValue({
    id: 'appointment-id',
    status: 'CANCELLED_BY_PROVIDER',
  });

  const response = await controller.cancel(
    professionalUser,
    'appointment-id',
    {
      reason: 'Imprevisto profissional.',
    },
  );

  expect(
    appointmentsService.cancelByProfessional,
  ).toHaveBeenCalledWith(
    'user-id',
    'appointment-id',
    'Imprevisto profissional.',
  );

  expect(
    appointmentsService.cancelByPatient,
  ).not.toHaveBeenCalled();

  expect(response).toEqual({
    data: {
      id: 'appointment-id',
      status: 'CANCELLED_BY_PROVIDER',
    },
  });
});

it('encaminha conclusão para o profissional autenticado', async () => {
  const professionalUser: AuthenticatedUser = {
    ...authenticatedUser,
    role: UserRole.PROFESSIONAL,
  };

  appointmentsService.completeByProfessional.mockResolvedValue({
    id: 'appointment-id',
    status: 'COMPLETED',
  });

  const response = await controller.complete(
    professionalUser,
    'appointment-id',
  );

  expect(
    appointmentsService.completeByProfessional,
  ).toHaveBeenCalledWith(
    'user-id',
    'appointment-id',
  );

  expect(response).toEqual({
    data: {
      id: 'appointment-id',
      status: 'COMPLETED',
    },
  });
});

it('permite listagem para TUTOR e PROFESSIONAL', () => {
  const roles = getMethodRoles('list');
  expect(roles).toEqual([
    UserRole.PATIENT,
    UserRole.PROFESSIONAL,
  ]);
});

it('encaminha listagem com usuário, papel e filtros', async () => {
  const professionalUser: AuthenticatedUser = {
    ...authenticatedUser,
    role: UserRole.PROFESSIONAL,
  };

  const query = {};

  appointmentsService.listForUser.mockResolvedValue([
    {
      id: 'appointment-id',
      status: 'CONFIRMED',
    },
  ]);

  const response = await controller.list(
    professionalUser,
    query,
  );

  expect(
    appointmentsService.listForUser,
  ).toHaveBeenCalledWith(
    'user-id',
    UserRole.PROFESSIONAL,
    query,
  );

  expect(response).toEqual({
    data: [
      {
        id: 'appointment-id',
        status: 'CONFIRMED',
      },
    ],
  });
});

});