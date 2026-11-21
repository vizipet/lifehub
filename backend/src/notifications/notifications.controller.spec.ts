import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ListNotificationsQueryDto } from './list-notifications-query.dto';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  const listForUserMock = jest.fn();

  let controller: NotificationsController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new NotificationsController({
      listForUser: listForUserMock,
    } as unknown as NotificationsService);
  });

  it('deve listar notificações usando o ID do usuário autenticado', async () => {
    const user = {
      id: 'user-1',
      role: 'PATIENT',
    } as AuthenticatedUser;

    const query = {
      page: 1,
      limit: 20,
    } as ListNotificationsQueryDto;

    const result = {
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    };

    listForUserMock.mockResolvedValue(result);

    const response = await controller.list(user, query);

    expect(listForUserMock).toHaveBeenCalledTimes(1);
    expect(listForUserMock).toHaveBeenCalledWith(
      user.id,
      query,
    );
    expect(response).toEqual(result);
  });

  it('deve utilizar o ID correspondente a cada usuário autenticado', async () => {
    const firstUser = {
      id: 'user-1',
      role: 'PATIENT',
    } as AuthenticatedUser;

    const secondUser = {
      id: 'user-2',
      role: 'PATIENT',
    } as AuthenticatedUser;

    const query = {
      page: 1,
      limit: 20,
    } as ListNotificationsQueryDto;

    listForUserMock.mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });

    await controller.list(firstUser, query);
    await controller.list(secondUser, query);

    expect(listForUserMock).toHaveBeenNthCalledWith(
      1,
      'user-1',
      query,
    );

    expect(listForUserMock).toHaveBeenNthCalledWith(
      2,
      'user-2',
      query,
    );
  });
});