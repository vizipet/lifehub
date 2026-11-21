import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ListNotificationsQueryDto } from './list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, ActiveUserGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar minhas notificações',
  })
  @ApiOkResponse({
    description:
      'Notificações do usuário autenticado, com paginação.',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.listForUser(
      user.id,
      query,
    );
  }
  @Patch('read-all')
@ApiOperation({
  summary: 'Marcar todas as minhas notificações como lidas',
})
@ApiOkResponse({
  description: 'Quantidade de notificações marcadas como lidas.',
})
@ApiUnauthorizedResponse({ description: 'Autenticação necessária.' })
@ApiForbiddenResponse({ description: 'Acesso bloqueado.' })
async markAllAsRead(
  @CurrentUser() user: AuthenticatedUser,
) {
  return this.notificationsService.markAllAsRead(user.id);
}
  @Patch(':id/read')
@ApiOperation({
  summary: 'Marcar minha notificação como lida',
})
@ApiOkResponse({
  description: 'Notificação marcada como lida.',
})
@ApiBadRequestResponse({ description: 'UUID inválido.' })
@ApiUnauthorizedResponse({ description: 'Autenticação necessária.' })
@ApiForbiddenResponse({ description: 'Acesso bloqueado.' })
@ApiNotFoundResponse({ description: 'Notificação não encontrada.' })
async markAsRead(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id', ParseUUIDPipe) notificationId: string,
) {
  return this.notificationsService.markAsRead(
    user.id,
    notificationId,
  );
}
}