import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchProvidersQueryDto } from './search-providers-query.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('providers')
  @ApiOperation({
    summary: 'Buscar clínicas e profissionais disponíveis',
  })
  @ApiOkResponse({
    description:
      'Resultados públicos aprovados, com próxima disponibilidade e distância opcional.',
  })
  async searchProviders(@Query() query: SearchProvidersQueryDto) {
    return this.searchService.searchProviders(query);
  }
}
