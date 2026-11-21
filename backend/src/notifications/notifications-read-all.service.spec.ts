import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService - markAllAsRead', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const updateManyMock = jest.fn();
  let service: NotificationsService;

  beforeEach(() => {
    updateManyMock.mockReset();

    const prisma = {
      notification: {
        updateMany: updateManyMock,
      },
    } as unknown as PrismaService;

    service = new NotificationsService(prisma);
  });

  it('atualiza somente notificações próprias ainda não lidas', async () => {
    updateManyMock.mockResolvedValue({ count: 2 });

    const result = await service.markAllAsRead(userId);

    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: expect.any(Date),
      },
    });
    expect(result).toEqual({ data: { updatedCount: 2 } });
  });

  it('usa o usuário solicitado como escopo da atualização', async () => {
    const otherUserId = '22222222-2222-4222-8222-222222222222';
    updateManyMock.mockResolvedValue({ count: 1 });

    await service.markAllAsRead(otherUserId);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        userId: otherUserId,
        readAt: null,
      },
      data: {
        readAt: expect.any(Date),
      },
    });
  });

  it('retorna zero quando não há notificações pendentes', async () => {
    updateManyMock.mockResolvedValue({ count: 0 });

    await expect(service.markAllAsRead(userId)).resolves.toEqual({
      data: { updatedCount: 0 },
    });
  });

  it('propaga a falha do banco sem retornar sucesso', async () => {
    const error = new Error('Falha simulada no banco.');
    updateManyMock.mockRejectedValue(error);

    await expect(service.markAllAsRead(userId)).rejects.toBe(error);
  });
});