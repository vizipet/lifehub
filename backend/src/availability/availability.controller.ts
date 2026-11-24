import {
  Body,
  Delete,
  HttpCode,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/client';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityBatchDto } from './create-availability-batch.dto';
import { CreateAvailabilitySlotDto } from './create-availability-slot.dto';

@ApiTags('Availability')
@ApiBearerAuth()
@Controller('clinics/:clinicId/availability')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles(UserRole.PROFESSIONAL)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar horário disponível',
  })
  @ApiCreatedResponse({
    description: 'Horário criado com sucesso.',
  })
  async createMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: CreateAvailabilitySlotDto,
  ) {
    const slot = await this.availabilityService.createMine(
      clinicId,
      user.id,
      dto,
    );

    return {
      data: slot,
    };
  }

  @Post('batch')
  @ApiOperation({
    summary: 'Criar horários disponíveis em lote',
  })
  @ApiCreatedResponse({
    description: 'Horários criados com sucesso.',
  })
  async createBatchMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: CreateAvailabilityBatchDto,
  ) {
    const slots = await this.availabilityService.createBatchMine(
      clinicId,
      user.id,
      dto,
    );

    return {
      data: slots,
    };
  }

  @Patch(':slotId/block')
  @ApiOperation({
    summary: 'Bloquear horário disponível',
  })
  @ApiOkResponse({
    description: 'Horário bloqueado com sucesso.',
  })
  async blockMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
  ) {
    const slot = await this.availabilityService.blockMine(
      clinicId,
      slotId,
      user.id,
    );

    return {
      data: slot,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Listar meus horários nesta clínica (padrão: próximos 14 dias)' })
  @ApiOkResponse({ description: 'Horários livres, reservados e bloqueados.' })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return { data: await this.availabilityService.listMine(clinicId, user.id, from, to) };
  }

  @Delete(':slotId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Excluir horário futuro sem histórico de consultas' })
  async deleteMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
  ) {
    await this.availabilityService.deleteMine(clinicId, slotId, user.id);
  }

  @Patch(':slotId/unblock')
  @ApiOperation({ summary: 'Liberar horário bloqueado' })
  @ApiOkResponse({ description: 'Horário voltou a ficar disponível.' })
  async unblockMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
  ) {
    return { data: await this.availabilityService.unblockMine(clinicId, slotId, user.id) };
  }
}
