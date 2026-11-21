import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum AppointmentListView {
  UPCOMING = 'upcoming',
  /** Confirmadas ainda não concluídas, inclusive as que já começaram. */
  OPEN = 'open',
  PAST = 'past',
  CANCELLED = 'cancelled',
}

export class ListAppointmentsQueryDto {
  @ApiPropertyOptional({
    enum: AppointmentListView,
    default: AppointmentListView.UPCOMING,
    description:
      'Filtra a agenda: próximas, em aberto (ainda não concluídas), anteriores ou canceladas.',
  })
  @IsOptional()
  @IsEnum(AppointmentListView)
  view?: AppointmentListView;
}