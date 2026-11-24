import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Headers,
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
  ApiHeader,
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
import { AppointmentsService } from './appointments.service';
import { DependentCheckDto } from './dependent-check.dto';
import { CancelAppointmentDto } from './cancel-appointment.dto';
import { CreateAppointmentDto } from './create-appointment.dto';
import { ListAppointmentsQueryDto } from './list-appointments-query.dto';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
@UseGuards(
  JwtAuthGuard,
  ActiveUserGuard,
  RolesGuard,
)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @Get()
  @Roles(UserRole.PATIENT, UserRole.PROFESSIONAL)
  @ApiOperation({
    summary: 'Listar agenda',
  })
  @ApiOkResponse({
    description: 'Agenda listada com sucesso.',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    const appointments =
      await this.appointmentsService.listForUser(
        user.id,
        user.role,
        query,
      );

    return {
      data: appointments,
    };
  }
  @Get(':id/patient-photo')
  @Roles(UserRole.PROFESSIONAL)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Foto autorizada para esta consulta' })
  async readPatientPhoto(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.appointmentsService.readSharedPatientPhoto(user.id, id) };
  }

  @Delete(':id/patient-photo')
  @Roles(UserRole.PATIENT)
  @HttpCode(204)
  @ApiOperation({ summary: 'Revogar compartilhamento da foto desta consulta' })
  async revokePatientPhoto(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.appointmentsService.revokeSharedPatientPhoto(user.id, id);
  }

@Patch(':id/cancel')
@Roles(UserRole.PATIENT, UserRole.PROFESSIONAL)
@ApiOperation({
  summary: 'Cancelar agendamento',
})
@ApiOkResponse({
  description: 'Agendamento cancelado com sucesso.',
})
async cancel(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id', ParseUUIDPipe) appointmentId: string,
  @Body() dto: CancelAppointmentDto,
) {
  const appointment =
    user.role === UserRole.PROFESSIONAL
      ? await this.appointmentsService.cancelByProfessional(
          user.id,
          appointmentId,
          dto.reason,
        )
      : await this.appointmentsService.cancelByPatient(
          user.id,
          appointmentId,
          dto.reason,
        );

  return {
    data: appointment,
  };
}
  @Post()
  @Roles(UserRole.PATIENT)
  @ApiOperation({
    summary: 'Criar agendamento',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Chave única da tentativa de criação do agendamento.',
  })
  @ApiCreatedResponse({
    description: 'Agendamento criado com sucesso.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key')
    idempotencyKey: string | undefined,
    @Body() dto: CreateAppointmentDto,
  ) {
    const appointment =
      await this.appointmentsService.create(
        user.id,
        dto,
        idempotencyKey,
      );

    return {
      data: appointment,
    };
  }
  @Patch(':id/attendance')
  @Roles(UserRole.PROFESSIONAL)
  @ApiOperation({ summary: 'Registrar presença do paciente' })
  async attendance(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.appointmentsService.recordAttendance(user.id, id) };
  }

  @Patch(':id/complete')
@Roles(UserRole.PROFESSIONAL)
@ApiOperation({
  summary: 'Concluir agendamento',
})
@ApiOkResponse({
  description: 'Agendamento concluído com sucesso.',
})
async complete(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id', ParseUUIDPipe) appointmentId: string,
) {
  const appointment =
    await this.appointmentsService.completeByProfessional(
      user.id,
      appointmentId,
    );

  return {
    data: appointment,
  };
}

  @Patch(':id/dependent-check')
  @Roles(UserRole.PROFESSIONAL)
  @ApiOperation({ summary: 'Conferir o vínculo responsável–dependente na recepção' })
  async dependentCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) appointmentId: string,
    @Body() dto: DependentCheckDto,
  ) {
    return { data: await this.appointmentsService.checkDependentLink(user.id, appointmentId, dto) };
  }
}
