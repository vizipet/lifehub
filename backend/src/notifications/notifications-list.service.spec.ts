import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService - listagem', () => {
  let service: NotificationsService;

  const findMany = jest.fn();
  const count = jest.fn();

  const prisma = {
    notification: {
      findMany,
      count,
    },
  } as unknown as PrismaService;

  const holderId = '11111111-1111-4111-8111-111111111111';

  const notification = {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'APPOINTMENT_CONFIRMED',
    title: 'Consulta confirmada',
    message: 'Sua consulta foi confirmada.',
    readAt: null,
    createdAt: new Date('2026-10-17T18:00:00.000Z'),
  };

  beforeEach(() => {
    jest.resetAllMocks();

    findMany.mockResolvedValue([notification]);
    count.mockResolvedValue(1);

    service = new NotificationsService(prisma);
  });

  it('lista somente notificações do usuário informado', async () => {
    const result = await service.listForUser(holderId, {
      page: 1,
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: holderId,
      },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip: 0,
      take: 20,
    });

    expect(count).toHaveBeenCalledWith({
      where: {
        userId: holderId,
      },
    });

    expect(result).toEqual({
      data: [notification],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('usa o identificador do usuário solicitado no filtro', async () => {
    const anotherUserId =
      '33333333-3333-4333-8333-333333333333';

    await service.listForUser(anotherUserId, {
      page: 1,
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: anotherUserId,
        },
      }),
    );

    expect(count).toHaveBeenCalledWith({
      where: {
        userId: anotherUserId,
      },
    });
  });

  it('calcula corretamente a segunda página', async () => {
    count.mockResolvedValue(45);

    const result = await service.listForUser(holderId, {
      page: 2,
      limit: 10,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );

    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 45,
      totalPages: 5,
    });
  });

  it('retorna lista vazia quando não existem notificações', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    const result = await service.listForUser(holderId, {
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
  });
});