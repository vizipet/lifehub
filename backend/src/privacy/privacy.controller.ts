import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PrivacyService } from './privacy.service';
import { UpdateNotificationPreferencesDto } from './update-notification-preferences.dto';
import { RequestAccountDeletionDto } from './request-account-deletion.dto';
import { RegisterLegalAcceptanceDto } from './register-legal-acceptance.dto';

@ApiTags('Privacy')
@ApiBearerAuth()
@Controller('privacy')
@UseGuards(JwtAuthGuard, ActiveUserGuard)
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('notification-preferences')
  @ApiOperation({
    summary: 'Consultar minhas preferências de notificação',
  })
  @ApiOkResponse({
    description: 'Preferências de notificação do usuário autenticado.',
  })
  async getNotificationPreferences(@CurrentUser() user: AuthenticatedUser) {
    const preferences = await this.privacyService.getNotificationPreferences(
      user.id,
    );

    return {
      data: preferences,
    };
  }

  @Patch('notification-preferences')
  @ApiOperation({
    summary: 'Atualizar minhas preferências de notificação',
  })
  @ApiOkResponse({
    description: 'Preferências de notificação atualizadas com sucesso.',
  })
  async updateNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    const preferences = await this.privacyService.updateNotificationPreferences(
      user.id,
      dto,
    );

    return {
      data: preferences,
    };
  }

  @Get('export')
  @ApiOperation({
    summary: 'Exportar meus dados',
  })
  @ApiOkResponse({
    description: 'Exportação dos dados pertencentes ao usuário autenticado.',
  })
  async exportUserData(@CurrentUser() user: AuthenticatedUser) {
    const exportData = await this.privacyService.exportUserData(user.id);

    return {
      data: exportData,
    };
  }

  @Post('account-deletion')
  @ApiOperation({
    summary: 'Solicitar exclusão da minha conta',
  })
  @ApiOkResponse({
    description: 'Solicitação de exclusão criada e sessões revogadas.',
  })
  async requestAccountDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestAccountDeletionDto,
  ) {
    const request = await this.privacyService.requestAccountDeletion(
      user.id,
      dto.currentPassword,
    );

    return {
      data: request,
    };
  }
  @Post('legal-acceptances')
  @ApiOperation({
    summary: 'Registrar aceite de documento legal',
  })
  @ApiOkResponse({
    description: 'Aceite do documento legal registrado com sucesso.',
  })
  async registerLegalAcceptance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterLegalAcceptanceDto,
  ) {
    const acceptance = await this.privacyService.registerLegalAcceptance(
      user.id,
      dto,
    );

    return {
      data: acceptance,
    };
  }
}
