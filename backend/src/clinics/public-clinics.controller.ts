import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClinicsService } from './clinics.service';
import { PublicClinicsQueryDto } from './public-clinics-query.dto';

@ApiTags('Public Clinics')
@Controller('public/clinics')
export class PublicClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar clínicas públicas aprovadas',
  })
  @ApiOkResponse({
    description: 'Lista pública de clínicas com status aprovado.',
  })
  async listPublic(@Query() query: PublicClinicsQueryDto) {
    const clinics = await this.clinicsService.listPublic(
      query.page,
      query.limit,
    );

    return {
      data: clinics.slice(0, query.limit),
      meta: {
        page: query.page,
        limit: query.limit,
        hasNextPage: clinics.length > query.limit,
      },
    };
  }
}
