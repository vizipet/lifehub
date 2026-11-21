import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/client';
import { AdminVerificationQueriesService } from './admin-verification-queries.service';
import { ListVerificationsQueryDto } from './dto/list-verifications-query.dto';

@ApiTags('Admin verification')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Autenticação necessária.' })
@ApiForbiddenResponse({ description: 'Conta administrativa ativa necessária.' })
@ApiBadRequestResponse({ description: 'UUID ou paginação inválidos.' })
@Controller('admin/verifications')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminVerificationQueriesController {
  constructor(private readonly verification: AdminVerificationQueriesService) {}

  @Get('professionals')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Listar solicitações pendentes de profissionais' })
  @ApiOkResponse({ description: 'Fila paginada, sem documentos ou links privados.' })
  listPendingProfessionals(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListVerificationsQueryDto) {
    return this.verification.listPendingProfessionals(actor.id, query);
  }

  @Get('professionals/:id/documents')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Listar metadados dos documentos de um profissional' })
  @ApiOkResponse({ description: 'Metadados paginados, sem caminhos ou links privados.' })
  @ApiNotFoundResponse({ description: 'Perfil profissional não encontrado.' })
  listDocuments(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) professionalId: string,
    @Query() query: ListVerificationsQueryDto,
  ) {
    return this.verification.listProfessionalDocuments(actor.id, professionalId, query);
  }
}
