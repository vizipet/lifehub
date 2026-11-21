import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/client';
import {
  ClinicDecisionDto,
  ListClinicsQueryDto,
  ListAuditQueryDto,
  ListUsersQueryDto,
  UpdateUserStatusDto,
  ListSafetyAlertsQueryDto,
  ResolveSafetyAlertDto,
} from './admin-management.dto';
import { AdminManagementService } from './admin-management.service';

@ApiTags('Administração')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminManagementController {
  constructor(private readonly admin: AdminManagementService) {}

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Números gerais do painel administrativo' })
  async overview() {
    return { data: await this.admin.overview() };
  }

  @Get('users')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Listar usuários (CPF sempre mascarado)' })
  @ApiOkResponse({ description: 'Lista paginada.' })
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Bloquear ou desbloquear usuário (fica na auditoria)' })
  async updateUserStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return { data: await this.admin.updateUserStatus(actor.id, id, dto) };
  }

  @Get('clinics')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Listar clínicas por situação (padrão: pendentes)' })
  listClinics(@Query() query: ListClinicsQueryDto) {
    return this.admin.listClinics(query);
  }

  @Patch('clinics/:id/decision')
  @ApiOperation({ summary: 'Aprovar, pedir correção, rejeitar ou suspender clínica' })
  async decideClinic(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClinicDecisionDto,
  ) {
    return { data: await this.admin.decideClinic(actor.id, id, dto) };
  }

  @Get('clinic-documents/:id/content')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', 'sandbox')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Abrir documento de local (registrado na auditoria)' })
  async openClinicDocument(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.admin.openClinicDocument(actor.id, id);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      length: file.buffer.length,
      disposition: `inline; filename="documento-local${file.mimeType === 'application/pdf' ? '.pdf' : file.mimeType === 'image/png' ? '.png' : '.jpg'}"`,
    });
  }

  @Get('safety-alerts')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Alertas de dependentes (CPF em outra conta, vínculo não conferido, muitas crianças)' })
  async safetyAlerts(@Query() query: ListSafetyAlertsQueryDto) {
    return this.admin.listSafetyAlerts(query);
  }

  @Patch('safety-alerts/:id/resolve')
  @ApiOperation({ summary: 'Marcar alerta como resolvido, registrando o que foi verificado' })
  async resolveSafetyAlert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSafetyAlertDto,
  ) {
    return { data: await this.admin.resolveSafetyAlert(actor.id, id, dto) };
  }

  @Get('audit')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Registro de auditoria das ações administrativas' })
  listAudit(@Query() query: ListAuditQueryDto) {
    return this.admin.listAudit(query);
  }

  @Get('audit/actions')
  @ApiOperation({ summary: 'Tipos de ação para o filtro da auditoria' })
  auditActions() {
    return { data: this.admin.auditActions() };
  }
}
