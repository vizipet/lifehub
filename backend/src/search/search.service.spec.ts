import { BadRequestException } from '@nestjs/common';
import { Modality } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  resolveRecifeDayUtcRange,
  SearchService,
} from './search.service';

type SqlLike = {
  strings: readonly string[];
  values: readonly unknown[];
};

describe('resolveRecifeDayUtcRange', () => {
  it('converte o dia civil de Recife para UTC', () => {
    const range = resolveRecifeDayUtcRange('2026-10-10');

    expect(range.start).toEqual(
      new Date('2026-10-10T03:00:00.000Z'),
    );

    expect(range.end).toEqual(
      new Date('2026-10-11T03:00:00.000Z'),
    );
  });

  it('mantém horários do início e fim do dia de Recife dentro da janela', () => {
    const { start, end } =
      resolveRecifeDayUtcRange('2026-10-10');

    const meiaHoraDepoisDaMeiaNoite = new Date(
      '2026-10-10T03:30:00.000Z',
    );

    const vinteETresETrinta = new Date(
      '2026-10-11T02:30:00.000Z',
    );

    const meiaNoiteDoDiaSeguinte = new Date(
      '2026-10-11T03:00:00.000Z',
    );

    expect(
      meiaHoraDepoisDaMeiaNoite >= start &&
        meiaHoraDepoisDaMeiaNoite < end,
    ).toBe(true);

    expect(
      vinteETresETrinta >= start &&
        vinteETresETrinta < end,
    ).toBe(true);

    expect(
      meiaNoiteDoDiaSeguinte >= start &&
        meiaNoiteDoDiaSeguinte < end,
    ).toBe(false);
  });

  it('rejeita data civil inexistente', () => {
    expect(() =>
      resolveRecifeDayUtcRange('2026-02-30'),
    ).toThrow(BadRequestException);
  });
});

describe('SearchService', () => {
  let service: SearchService;

  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const providerRow = {
    clinicId: 'clinic-id',
    clinicName: 'Clínica São José',
    clinicAddress: 'Rua A, 100',
    clinicCity: 'Recife',
    clinicNeighborhood: 'Boa Viagem',
    clinicLatitude: -8.0476,
    clinicLongitude: -34.877,
    professionalId: 'professional-id',
    professionalName: 'Maria Silva',
    specialty: 'Dermatologia veterinária',
    nextAvailableAt: new Date('2030-01-10T12:00:00.000Z'),
    nextSlotId: 'slot-id',
    nextServiceId: 'service-id',
    nextServiceName: 'Consulta dermatológica',
    nextServiceModality: Modality.IN_PERSON,
  };

  const sqlAt = (callIndex: number) =>
    prisma.$queryRaw.mock.calls[callIndex][0] as SqlLike;

  const sqlText = (sql: SqlLike) =>
    sql.strings.join('?').replace(/\s+/g, ' ').trim();

  const searchPatterns = (sql: SqlLike) =>
    sql.values.filter(
      (value): value is string =>
        typeof value === 'string' &&
        value.startsWith('%') &&
        value.endsWith('%'),
    );

  const mockResult = (
    rows: (typeof providerRow)[] = [providerRow],
    total = rows.length,
  ) => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          total: BigInt(total),
        },
      ])
      .mockResolvedValueOnce(rows);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      async (queries: Promise<unknown>[]) =>
        Promise.all(queries),
    );

    service = new SearchService(
      prisma as unknown as PrismaService,
    );
  });

  it('separa múltiplos termos e combina a busca por campos diferentes', async () => {
    mockResult();

    const result = await service.searchProviders({
      q: 'dermatologia recife',
      page: 1,
      limit: 20,
    });

    const dataSql = sqlAt(1);
    const text = sqlText(dataSql);
    const patterns = searchPatterns(dataSql);

    expect(patterns).toContain('%dermatologia%');
    expect(patterns).toContain('%recife%');
    expect(patterns).not.toContain('%dermatologia recife%');

    expect(text).toContain(
      "lower(COALESCE(spec.name, ''))",
    );
    expect(text).toContain('unaccent(lower(c.city))');
    expect(text).toContain('unaccent(lower(sn.name))');

    expect(result.data).toHaveLength(1);
  });

  it.each([
    'Clinica Sao Jose',
    'Clínica São José',
  ])(
    'mantém busca com unaccent para "%s"',
    async (q) => {
      mockResult();

      const result = await service.searchProviders({
        q,
        page: 1,
        limit: 20,
      });

      const dataSql = sqlAt(1);
      const text = sqlText(dataSql);

      expect(text).toContain('unaccent(lower(c.name))');
      expect(text).toContain('unaccent(lower(u.name))');
      expect(text).toContain(
        "lower(COALESCE(spec.name, ''))",
      );
      expect(text).toContain('unaccent(lower(sn.name))');

      expect(result.data).toHaveLength(1);
    },
  );

  it('ignora espaços duplicados e espaços no início/fim da busca', async () => {
    mockResult();
    mockResult();

    await service.searchProviders({
      q: 'dermatologia recife',
      page: 1,
      limit: 20,
    });

    await service.searchProviders({
      q: '   dermatologia    recife   ',
      page: 1,
      limit: 20,
    });

    const firstPatterns = searchPatterns(sqlAt(1));
    const secondPatterns = searchPatterns(sqlAt(3));

    expect(secondPatterns).toEqual(firstPatterns);
  });

  it('combina texto, modalidade, especialidade, cidade, bairro e data', async () => {
    mockResult();

    await service.searchProviders({
      q: 'consulta recife',
      modality: Modality.IN_PERSON,
      specialtyId:
        '550e8400-e29b-41d4-a716-446655440000',
      city: 'Recife',
      neighborhood: 'Boa Viagem',
      date: '2030-10-10',
      page: 1,
      limit: 20,
    });

    const dataSql = sqlAt(1);
    const text = sqlText(dataSql);

    expect(text).toContain('unaccent(lower(c.city))');
    expect(text).toContain(
      'unaccent(lower(c.neighborhood))',
    );
    expect(text).toContain('p.specialty_id =');
    expect(text).toContain('availability_slots');
    expect(text).toContain('sn.modality');
    expect(text).toContain('an.starts_at <');
    expect(text).toContain('unaccent(lower(sn.name))');

    expect(dataSql.values).toEqual(
      expect.arrayContaining([
        'Recife',
        'Boa Viagem',
        Modality.IN_PERSON,
        '550e8400-e29b-41d4-a716-446655440000',
        new Date('2030-10-10T03:00:00.000Z'),
        new Date('2030-10-11T03:00:00.000Z'),
        '%consulta%',
        '%recife%',
      ]),
    );
  });

  it('usa agora como início quando o dia selecionado é hoje em Recife', async () => {
    jest.useFakeTimers();

    try {
      const now = new Date(
        '2026-10-10T12:00:00.000Z',
      );

      jest.setSystemTime(now);

      mockResult();

      await service.searchProviders({
        date: '2026-10-10',
        page: 1,
        limit: 20,
      });

      const dataSql = sqlAt(1);

      expect(dataSql.values).toEqual(
        expect.arrayContaining([
          now,
          new Date('2026-10-11T03:00:00.000Z'),
        ]),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('retorna vazio para data totalmente passada sem consultar o banco', async () => {
    const result = await service.searchProviders({
      date: '2000-01-01',
      page: 1,
      limit: 20,
    });

    expect(result).toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('retorna INVALID_SEARCH_DATE para data civil inválida', async () => {
    try {
      await service.searchProviders({
        date: '2026-02-30',
        page: 1,
        limit: 20,
      });

      throw new Error('A busca deveria rejeitar a data.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);

      const response = (
        error as BadRequestException
      ).getResponse();

      expect(response).toMatchObject({
        code: 'INVALID_SEARCH_DATE',
      });
    }

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('funciona sem localização do tutor e não calcula distância', async () => {
    mockResult();

    const result = await service.searchProviders({
      page: 1,
      limit: 20,
    });

    expect(result.data[0].distanceKm).toBeNull();
  });

  it('não envia coordenadas do tutor para a consulta SQL', async () => {
    mockResult();

    const result = await service.searchProviders({
      latitude: -8.05,
      longitude: -34.88,
      page: 1,
      limit: 20,
    });

    const countSql = sqlAt(0);
    const dataSql = sqlAt(1);

    expect(countSql.values).not.toContain(-8.05);
    expect(countSql.values).not.toContain(-34.88);
    expect(dataSql.values).not.toContain(-8.05);
    expect(dataSql.values).not.toContain(-34.88);

    expect(result.data[0].distanceKm).not.toBeNull();
  });

  it('recusa coordenadas incompletas do tutor', async () => {
    await expect(
      service.searchProviders({
        latitude: -8.05,
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('filtra clínica, profissional e usuário para exposição pública', async () => {
    mockResult([], 0);

    const result = await service.searchProviders({
      page: 1,
      limit: 20,
    });

    const countText = sqlText(sqlAt(0));
    const dataText = sqlText(sqlAt(1));

    for (const text of [countText, dataText]) {
      expect(text).toContain(
        'c.verification_status =',
      );
      expect(text).toContain(
        'p.verification_status =',
      );
      expect(text).toContain(
        '\'APPROVED\'::"VerificationStatus"',
      );
      expect(text).toContain(
        'u.status = \'ACTIVE\'::"UserStatus"',
      );
    }

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('exige slot futuro AVAILABLE mesmo quando date não é informado', async () => {
    mockResult();

    await service.searchProviders({
      page: 1,
      limit: 20,
    });

    const countText = sqlText(sqlAt(0));
    const dataText = sqlText(sqlAt(1));

    expect(countText).toContain(
      'FROM availability_slots ad',
    );
    expect(countText).toContain(
      '\'AVAILABLE\'::"AvailabilityStatus"',
    );

    expect(dataText).toContain(
      'INNER JOIN LATERAL',
    );
    expect(dataText).toContain(
      '\'AVAILABLE\'::"AvailabilityStatus"',
    );
  });

  it('considera somente o primeiro slot elegível e retorna serviço/modalidade', async () => {
    mockResult();

    const result = await service.searchProviders({
      page: 1,
      limit: 20,
    });

    const text = sqlText(sqlAt(1));

    expect(text).toContain(
      'an.status = \'AVAILABLE\'::"AvailabilityStatus"',
    );
    expect(text).toContain(
      'ORDER BY an.starts_at ASC, an.id ASC',
    );
    expect(text).toContain('LIMIT 1');

    expect(result.data[0].nextSlotId).toBe('slot-id');
    expect(text).toContain('an.id');
    expect(result.data[0].nextAvailableAt).toEqual(
      new Date('2030-01-10T12:00:00.000Z'),
    );

    expect(result.data[0].nextService).toEqual({
      id: 'service-id',
      name: 'Consulta dermatológica',
      modality: Modality.IN_PERSON,
    });
  });

  it('aplica todos os termos também ao serviço da próxima disponibilidade', async () => {
    mockResult();

    await service.searchProviders({
      q: 'dermatologia recife',
      page: 1,
      limit: 20,
    });

    const dataSql = sqlAt(1);
    const text = sqlText(dataSql);
    const patterns = searchPatterns(dataSql);

    expect(text).toContain(
      'unaccent(lower(sn.name))',
    );

    expect(patterns).toContain('%dermatologia%');
    expect(patterns).toContain('%recife%');
  });

  it('retorna vazio para termo inexistente quando a consulta não encontra candidatos', async () => {
    mockResult([], 0);

    const result = await service.searchProviders({
      q: 'termo-inexistente',
      page: 1,
      limit: 20,
    });

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('mantém paginação e ordenação estáveis', async () => {
    mockResult([providerRow], 31);

    const result = await service.searchProviders({
      page: 2,
      limit: 10,
    });

    const dataSql = sqlAt(1);
    const text = sqlText(dataSql);

    // LifeHub: quem tem o horário mais próximo aparece primeiro, com desempate estável.
    expect(text).toContain('next_slot.starts_at ASC');
    expect(text).toContain(
      'unaccent(lower(u.name)) ASC',
    );
    expect(text).toContain('p.id ASC');
    expect(text).toContain('c.id ASC');

    expect(dataSql.values).toEqual(
      expect.arrayContaining([10]),
    );

    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 31,
      totalPages: 4,
    });
  });
});