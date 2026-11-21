import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Body, Header, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/client';
import { AdminVerificationDecisionsService } from './admin-verification-decisions.service';
import { DecideVerificationDto } from './dto/decide-verification.dto';

@ApiTags('Admin verification')
@ApiBearerAuth()
@Controller('admin/verifications')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminVerificationDecisionsController {
  constructor(private readonly decisions: AdminVerificationDecisionsService) {}

  @Post('professionals/:id/decisions')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Decidir uma submissão profissional com motivo, auditoria e Outbox atômicos' })
  decide(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) professionalId: string,
    @Body() dto: DecideVerificationDto,
  ) {
    return this.decisions.decide(actor.id, actor.sessionId, professionalId, dto);
  }
}
