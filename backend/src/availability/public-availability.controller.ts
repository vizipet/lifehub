import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { PublicAvailabilityQueryDto } from './public-availability-query.dto';

@ApiTags('Public Availability')
@Controller('public/clinics/:clinicId/availability')
export class PublicAvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar horários futuros disponíveis de um serviço e profissional',
  })
  @ApiOkResponse({
    description: 'Retorna somente horários disponíveis de prestadores aprovados.',
  })
  async listPublic(
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Query() query: PublicAvailabilityQueryDto,
  ) {
    return {
      data: await this.availabilityService.listPublic(clinicId, query),
    };
  }
}
