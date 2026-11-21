import {
  Controller, Get, Header, HttpCode, HttpStatus, MethodNotAllowedException, Param, ParseUUIDPipe, Post, Query, Req, StreamableFile, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/client';
import { AdminVerificationService } from './admin-verification.service';
import { DocumentContentQueryDto } from './dto/document-content-query.dto';

// G5.3: concessão e requisição de abertura auditadas separadamente.
@ApiTags('Admin verification')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Autenticação necessária.' })
@ApiForbiddenResponse({ description: 'Conta administrativa ativa necessária.' })
@Controller('admin/verifications')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminVerificationController {
  constructor(private readonly verification: AdminVerificationService) {}

  @Post('documents/:id/access')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Conceder acesso temporário e auditado a um documento' })
  @ApiOkResponse({ description: 'Link temporário com validade de 60 segundos.' })
  @ApiNotFoundResponse({ description: 'Documento não encontrado.' })
  grantDocumentAccess(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) documentId: string,
  ) {
    return this.verification.grantDocumentAccess(actor.id, documentId, actor.sessionId);
  }

  @Get('documents/:id/content')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', 'sandbox')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Abrir documento privado por acesso temporário e registrar a abertura' })
  @ApiOkResponse({ description: 'Conteúdo do documento, liberado somente após auditoria.' })
  @ApiNotFoundResponse({ description: 'Documento não encontrado.' })
  async openDocument(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Query() query: DocumentContentQueryDto,
    @Req() req: { method: string },
  ) {
    // Express encaminha HEAD para handlers GET; HEAD não é abertura do conteúdo.
    if (req.method !== 'GET') throw new MethodNotAllowedException();
    const file = await this.verification.openDocument(actor.id, documentId, actor.sessionId, query.ticket);
    return new StreamableFile(file.buffer, {
      type: file.mimeType, length: file.buffer.length,
      disposition: `inline; filename="${file.filename}"`,
    });
  }
}
