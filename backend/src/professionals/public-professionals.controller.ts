import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProfessionalsService } from './professionals.service';

@ApiTags('Médicos (público)')
@Controller('public/professionals')
export class PublicProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Perfil público de um médico aprovado' })
  @ApiOkResponse({ description: 'Nome, CRM, especialidade, locais e serviços.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.professionals.findPublic(id) };
  }
}
