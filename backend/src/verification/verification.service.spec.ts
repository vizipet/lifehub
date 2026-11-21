import { AuditService } from '../audit/audit.service';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VerificationStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.service';
import { VerificationService } from './verification.service';
import type { VerificationUploadFile } from './verification-file.validator';

describe('VerificationService', () => {
  let service: VerificationService;

  const prisma = {
    professional: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    verificationDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const storage = {
    uploadPrivate: jest.fn(),
    createSignedReadUrl: jest.fn(),
    remove: jest.fn(),
  };

  const makePdf = (): VerificationUploadFile => {
    const buffer = Buffer.from('%PDF-1.7\nconteudo');

    return {
      originalname: 'crm.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    };
  };

  const completeProfessional = (
    overrides: Record<string, unknown> = {},
  ) => ({
    id: 'professional-id',
    crm: '123456',
    crmState: 'PE',
    specialtyId: 'specialty-id',
    verificationStatus: VerificationStatus.PENDING,
    verificationSubmittedAt: null,
    user: {
      name: 'Profissional Teste',
      email: 'profissional@example.com',
      phone: '81999999999',
    },
    _count: {
      verificationDocuments: 1,
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: AuditService, useValue: { record: jest.fn() } },
        VerificationService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: STORAGE_SERVICE,
          useValue: storage,
        },
      ],
    }).compile();

    service = moduleRef.get(VerificationService);
  });

  it('envia documento valido para storage privado e salva apenas metadados', async () => {
    prisma.professional.findUnique.mockResolvedValue({
      id: 'professional-id',
      verificationStatus: VerificationStatus.PENDING,
      verificationSubmittedAt: null,
    });

    storage.uploadPrivate.mockResolvedValue(undefined);

    const createdAt = new Date();

    prisma.verificationDocument.create.mockResolvedValue({
      id: 'document-id',
      originalName: 'crm.pdf',
      mimeType: 'application/pdf',
      sizeBytes: makePdf().size,
      createdAt,
    });

    const result = await service.uploadDocument(
      'user-id',
      makePdf(),
    );

    expect(storage.uploadPrivate).toHaveBeenCalledTimes(1);

    const upload =
      storage.uploadPrivate.mock.calls[0][0];

    expect(upload.path).toMatch(
      /^professionals\/professional-id\/verification\/[0-9a-f-]{36}\.pdf$/,
    );
    expect(upload.contentType).toBe('application/pdf');

    expect(
      prisma.verificationDocument.create,
    ).toHaveBeenCalledWith({
      data: {
        professionalId: 'professional-id',
        originalName: 'crm.pdf',
        storagePath: upload.path,
        mimeType: 'application/pdf',
        sizeBytes: makePdf().size,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    expect(result).not.toHaveProperty('storagePath');
    expect(result).not.toHaveProperty('url');
  });

  it('remove o arquivo do storage se a gravacao no banco falhar', async () => {
    prisma.professional.findUnique.mockResolvedValue({
      id: 'professional-id',
      verificationStatus: VerificationStatus.PENDING,
      verificationSubmittedAt: null,
    });

    storage.uploadPrivate.mockResolvedValue(undefined);
    storage.remove.mockResolvedValue(undefined);

    prisma.verificationDocument.create.mockRejectedValue(
      new Error('database failure'),
    );

    await expect(
      service.uploadDocument('user-id', makePdf()),
    ).rejects.toThrow('database failure');

    const upload =
      storage.uploadPrivate.mock.calls[0][0];

    expect(storage.remove).toHaveBeenCalledWith(
      upload.path,
    );
  });

  it('impede alterar documentos enquanto a solicitacao PENDING esta em analise', async () => {
    prisma.professional.findUnique.mockResolvedValue({
      id: 'professional-id',
      verificationStatus: VerificationStatus.PENDING,
      verificationSubmittedAt: new Date(),
    });

    await expect(
      service.uploadDocument('user-id', makePdf()),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storage.uploadPrivate).not.toHaveBeenCalled();
  });

  it('recusa envio para analise quando faltam dados obrigatorios', async () => {
    prisma.professional.findUnique.mockResolvedValue(
      completeProfessional({
        user: {
          name: 'Profissional Teste',
          email: 'profissional@example.com',
          phone: '',
        },
      }),
    );

    await expect(
      service.submit('user-id'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.professional.update).not.toHaveBeenCalled();
  });

  it('envia para análise quando CRM, UF, especialidade e documento estão completos', async () => {
    prisma.professional.findUnique.mockResolvedValue(
      completeProfessional(),
    );

    prisma.professional.update.mockResolvedValue({
      id: 'professional-id',
      verificationStatus: VerificationStatus.PENDING,
      verificationSubmittedAt: new Date(),
    });

    await service.submit('user-id');

    expect(prisma.professional.update).toHaveBeenCalledWith({
      where: {
        id: 'professional-id',
      },
      data: {
        verificationStatus: VerificationStatus.PENDING,
        verificationSubmittedAt: expect.any(Date),
      },
      select: {
        id: true,
        verificationStatus: true,
        verificationSubmittedAt: true,
      },
    });
  });

  it.each([
    [{ crm: null, crmState: null }],
    [{ specialtyId: null }],
    [{ _count: { verificationDocuments: 0 } }],
  ])('recusa envio sem os dados obrigatórios do médico: %j', async (missing) => {
    prisma.professional.findUnique.mockResolvedValue(completeProfessional(missing));
    await expect(service.submit('user-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.professional.update).not.toHaveBeenCalled();
  });

  it('recusa perfil com somente uma parte do CRM', async () => {
    prisma.professional.findUnique.mockResolvedValue(
      completeProfessional({
        crm: '12345',
        crmState: null,
      }),
    );

    await expect(
      service.submit('user-id'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.professional.update).not.toHaveBeenCalled();
  });

  it('permite reenvio depois de CHANGES_REQUESTED e volta para PENDING', async () => {
    prisma.professional.findUnique.mockResolvedValue(
      completeProfessional({
        crm: '12345',
        crmState: 'PE',
        verificationStatus:
          VerificationStatus.CHANGES_REQUESTED,
        verificationSubmittedAt: new Date(
          '2026-10-01T12:00:00.000Z',
        ),
      }),
    );

    prisma.professional.update.mockResolvedValue({
      id: 'professional-id',
      verificationStatus: VerificationStatus.PENDING,
      verificationSubmittedAt: new Date(),
    });

    const result = await service.submit('user-id');

    expect(prisma.professional.update).toHaveBeenCalledWith({
      where: {
        id: 'professional-id',
      },
      data: {
        verificationStatus: VerificationStatus.PENDING,
        verificationSubmittedAt: expect.any(Date),
      },
      select: {
        id: true,
        verificationStatus: true,
        verificationSubmittedAt: true,
      },
    });

    expect(result.verificationStatus).toBe(
      VerificationStatus.PENDING,
    );
  });

  it('recusa segundo envio enquanto ja esta PENDING em analise', async () => {
    prisma.professional.findUnique.mockResolvedValue(
      completeProfessional({
        verificationSubmittedAt: new Date(),
      }),
    );

    await expect(
      service.submit('user-id'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.professional.update).not.toHaveBeenCalled();
  });
});
