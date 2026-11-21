import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServicesService } from './services.service';

@ApiTags('Public Services')
@Controller('public/clinics/:clinicId/services')
export class PublicServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar serviços públicos ativos de uma clínica',
  })
  @ApiOkResponse({
    description:
      'Lista serviços ativos de uma clínica aprovada, com modalidade, profissionais aptos e espécies aceitas.',
  })
  async listPublic(@Param('clinicId', ParseUUIDPipe) clinicId: string) {
    const services = await this.servicesService.listPublic(clinicId);

    return {
      data: services,
    };
  }
}
