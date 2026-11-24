import { Controller, Header, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/client';
import { TeleconsultationService } from './teleconsultation.service';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
export class TeleconsultationController {
  constructor(private readonly video: TeleconsultationService) {}
  @Post(':id/teleconsultation')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.PATIENT, UserRole.PROFESSIONAL)
  async join(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.video.join(user.id, user.role, id) };
  }
}
