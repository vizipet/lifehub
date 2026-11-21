
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService - markAsRead', () => {
  const userId =
    '11111111-1111-4111-8111-111111111111';

  const notificationId =
    '22222222-2222-4222-8222-222222222222';

  const updateManyMock = jest.fn();
  const findFirstMock = jest.fn();

  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();

    const prisma = {
      notification: {
        updateMany: updateManyMock,
        findFirst: findFirstMock,
      },
    } as unknown as PrismaService;

    service = new NotificationsService(prisma);

    updateManyMock.mockResolvedValue({ count: 1 });
  });

  it('marca uma notificação própria como lida', async () => {
    const readAt = new Date();

    findFirstMock.mockResolvedValue({
      id: notificationId,
      readAt,
    });

    const result = await service.markAsRead(
      userId,
      notificationId,
    );

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        id: notificationId,
        userId,
        readAt: null,
      },
      data: {
        readAt: expect.any(Date),
      },
    });

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        id: notificationId,
        userId,
      },
      select: {
        id: true,
        readAt: true,
      },
    });

    expect(result).toEqual({
      data: {
        id: notificationId,
        readAt,
      },
    });
  });

  it('não permite marcar notificação de outro usuário', async () => {
    updateManyMock.mockResolvedValue({ count: 0 });
    findFirstMock.mockResolvedValue(null);

    await expect(
      service.markAsRead(userId, notificationId),
    ).rejects.toThrow(NotFoundException);

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: notificationId,
          userId,
        }),
      }),
    );

    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: notificationId,
          userId,
        },
      }),
    );
  });

  it('retorna 404 quando a notificação não existe', async () => {
    updateManyMock.mockResolvedValue({ count: 0 });
    findFirstMock.mockResolvedValue(null);

    await expect(
      service.markAsRead(userId, notificationId),
    ).rejects.toThrow(NotFoundException);
  });

  it('preserva a data de uma notificação já lida', async () => {
    const originalReadAt = new Date(
      '2026-10-01T12:00:00.000Z',
    );

    updateManyMock.mockResolvedValue({ count: 0 });

    findFirstMock.mockResolvedValue({
      id: notificationId,
      readAt: originalReadAt,
    });

    const result = await service.markAsRead(
      userId,
      notificationId,
    );

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          readAt: null,
        }),
      }),
    );

    expect(result.data.readAt).toEqual(
      originalReadAt,
    );
  });
});
