import { AuditService } from '../audit/audit.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VerificationStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { ClinicsService } from './clinics.service';
import { STORAGE_SERVICE } from '../storage/storage.service';

describe('ClinicsService', () => {
  let service: ClinicsService;

  const prisma = {
    clinic: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clinicProfessional: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  };

  const professionalsService = {
    findMine: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Por padrão, o CNES informado está livre.
    prisma.clinic.findFirst.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: AuditService, useValue: { record: jest.fn() } },
        ClinicsService,
        { provide: STORAGE_SERVICE, useValue: { uploadPrivate: jest.fn(), remove: jest.fn() } },
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ProfessionalsService,
          useValue: professionalsService,
        },
      ],
    }).compile();

    service = moduleRef.get(ClinicsService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('cria clínica e vincula o profissional autenticado', async () => {
    professionalsService.findMine.mockResolvedValue({
      id: 'professional-id',
      userId: 'user-id',
    });

    prisma.clinic.create.mockResolvedValue({
      id: 'clinic-id',
      name: 'Clínica Central',
      address: 'Rua A, 100',
      city: 'Recife',
      neighborhood: 'Boa Viagem',
      verificationStatus: VerificationStatus.PENDING,
    });

    prisma.clinic.findFirst.mockResolvedValue(null);
    const result = await service.createMine('user-id', {
      cnes: '1234567',
      name: ' Clínica Central ',
      address: ' Rua A, 100 ',
      city: ' Recife ',
      neighborhood: ' Boa Viagem ',
    });

    expect(prisma.clinic.create).toHaveBeenCalledWith({
      data: {
        cnes: '1234567',
        name: 'Clínica Central',
        address: 'Rua A, 100',
        city: 'Recife',
        neighborhood: 'Boa Viagem',
        technicalResponsibleProfessionalId: 'professional-id',
        professionalLinks: {
          create: {
            professionalId: 'professional-id',
          },
        },
      },
    });

    expect(result.id).toBe('clinic-id');
  });

  it('recusa acesso a clínica sem vínculo com o profissional', async () => {
    professionalsService.findMine.mockResolvedValue({
      id: 'professional-id',
      userId: 'user-id',
    });

    prisma.clinic.findFirst.mockResolvedValue(null);

    await expect(
      service.findMineById('clinic-id', 'user-id'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.clinic.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'clinic-id',
        professionalLinks: {
          some: {
            professionalId: 'professional-id',
          },
        },
      },
    });
  });

  it('recusa responsável técnico não vinculado à clínica', async () => {
    professionalsService.findMine.mockResolvedValue({
      id: 'professional-id',
      userId: 'user-id',
    });

    prisma.clinic.findFirst.mockResolvedValue({
      id: 'clinic-id',
      technicalResponsibleProfessionalId: null,
    });
    prisma.clinicProfessional.count.mockResolvedValue(1);

    prisma.clinicProfessional.findFirst.mockResolvedValue(null);

    await expect(
      service.updateMine('clinic-id', 'user-id', {
        technicalResponsibleProfessionalId: 'responsavel-nao-vinculado-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.clinic.update).not.toHaveBeenCalled();
  });

  it('volta para PENDING quando o responsável técnico passa a função adiante', async () => {
    professionalsService.findMine.mockResolvedValue({
      id: 'professional-id',
      userId: 'user-id',
    });

    prisma.clinic.findFirst.mockResolvedValue({
      id: 'clinic-id',
      technicalResponsibleProfessionalId: 'professional-id',
    });

    prisma.clinicProfessional.findFirst.mockResolvedValue({
      id: 'link-id',
    });

    prisma.clinic.update.mockResolvedValue({
      id: 'clinic-id',
      technicalResponsibleProfessionalId: 'responsavel-novo-id',
      verificationStatus: VerificationStatus.PENDING,
    });

    await service.updateMine('clinic-id', 'user-id', {
      technicalResponsibleProfessionalId: 'responsavel-novo-id',
    });

    expect(prisma.clinicProfessional.findFirst).toHaveBeenCalledWith({
      where: {
        clinicId: 'clinic-id',
        professionalId: 'responsavel-novo-id',
      },
      select: {
        id: true,
      },
    });

    expect(prisma.clinic.update).toHaveBeenCalledWith({
      where: {
        id: 'clinic-id',
      },
      data: {
        technicalResponsibleProfessionalId: 'responsavel-novo-id',
        verificationStatus: VerificationStatus.PENDING,
      },
    });
  });

  it('médico que não é o responsável técnico não edita a clínica', async () => {
    professionalsService.findMine.mockResolvedValue({ id: 'professional-id' });
    prisma.clinic.findFirst.mockResolvedValue({
      id: 'clinic-id',
      name: 'Clínica Central',
      address: 'Rua A, 100',
      technicalResponsibleProfessionalId: 'outro-medico-id',
    });

    await expect(service.updateMine('clinic-id', 'user-id', { address: 'Rua B, 200' })).rejects.toMatchObject({
      response: { code: 'CLINIC_EDIT_ONLY_RESPONSIBLE' },
    });
    expect(prisma.clinic.update).not.toHaveBeenCalled();
  });

  it('local compartilhado sem responsável técnico não é editado por um médico só', async () => {
    professionalsService.findMine.mockResolvedValue({ id: 'professional-id' });
    prisma.clinic.findFirst.mockResolvedValue({ id: 'clinic-id', technicalResponsibleProfessionalId: null });
    prisma.clinicProfessional.count.mockResolvedValue(2);

    await expect(service.updateMine('clinic-id', 'user-id', { name: 'Novo nome' })).rejects.toMatchObject({
      response: { code: 'CLINIC_EDIT_ONLY_RESPONSIBLE' },
    });
  });

  it('mudar o endereço de clínica aprovada manda de volta para análise', async () => {
    professionalsService.findMine.mockResolvedValue({ id: 'professional-id' });
    prisma.clinic.findFirst.mockResolvedValue({
      id: 'clinic-id',
      name: 'Clínica Central',
      address: 'Rua A, 100',
      city: 'Recife',
      neighborhood: 'Boa Viagem',
      latitude: null,
      longitude: null,
      verificationStatus: VerificationStatus.APPROVED,
      technicalResponsibleProfessionalId: 'professional-id',
    });
    prisma.clinic.update.mockResolvedValue({ id: 'clinic-id' });

    await service.updateMine('clinic-id', 'user-id', { address: 'Rua B, 200' });

    expect(prisma.clinic.update.mock.calls[0][0].data).toMatchObject({
      address: 'Rua B, 200',
      verificationStatus: VerificationStatus.PENDING,
    });
  });

  it('recusa CNES já cadastrado em outro local', async () => {
    professionalsService.findMine.mockResolvedValue({ id: 'professional-id' });
    prisma.clinic.findFirst.mockResolvedValue({ id: 'outra-clinica' });

    await expect(
      service.createMine('user-id', { cnes: '1234567', name: 'X', address: 'Y', city: 'Recife', neighborhood: 'Z' }),
    ).rejects.toMatchObject({ response: { code: 'CNES_ALREADY_REGISTERED' } });
    expect(prisma.clinic.create).not.toHaveBeenCalled();
  });

  it('lista publicamente apenas clínicas aprovadas', async () => {
    prisma.clinic.findMany.mockResolvedValue([
      {
        id: 'clinic-id',
        name: 'Clínica Central',
        address: 'Rua A, 100',
        city: 'Recife',
        neighborhood: 'Boa Viagem',
      },
    ]);

    await service.listPublic();

    expect(prisma.clinic.findMany).toHaveBeenCalledWith({
      where: {
        verificationStatus: VerificationStatus.APPROVED,
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        neighborhood: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 21,
    });
  });
  it('salva latitude e longitude quando informadas juntas', async () => {
    professionalsService.findMine.mockResolvedValue({
      id: 'professional-id',
      userId: 'user-id',
    });

    prisma.clinic.create.mockResolvedValue({
      id: 'clinic-id',
      name: 'Clínica Central',
      address: 'Rua A, 100',
      city: 'Recife',
      neighborhood: 'Boa Viagem',
      latitude: -8.0476,
      longitude: -34.877,
    });

    await service.createMine('user-id', {
      cnes: '1234567',
      name: 'Clínica Central',
      address: 'Rua A, 100',
      city: 'Recife',
      neighborhood: 'Boa Viagem',
      latitude: -8.0476,
      longitude: -34.877,
    });

    expect(prisma.clinic.create).toHaveBeenCalledWith({
      data: {
        cnes: '1234567',
        name: 'Clínica Central',
        address: 'Rua A, 100',
        city: 'Recife',
        neighborhood: 'Boa Viagem',
        latitude: -8.0476,
        longitude: -34.877,
        technicalResponsibleProfessionalId: 'professional-id',
        professionalLinks: {
          create: {
            professionalId: 'professional-id',
          },
        },
      },
    });
  });

  it('recusa coordenadas incompletas', async () => {
    professionalsService.findMine.mockResolvedValue({
      id: 'professional-id',
      userId: 'user-id',
    });

    await expect(
      service.createMine('user-id', {
        cnes: '1234567',
        name: 'Clínica Central',
        address: 'Rua A, 100',
        city: 'Recife',
        neighborhood: 'Boa Viagem',
        latitude: -8.0476,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.clinic.create).not.toHaveBeenCalled();
  });
});
