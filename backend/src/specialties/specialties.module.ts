import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class SpecialtiesService {
  constructor(private readonly prisma: PrismaService) {}

  listActive() {
    return this.prisma.specialty.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  }
}

@ApiTags('Especialidades')
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialties: SpecialtiesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar especialidades médicas ativas' })
  @ApiOkResponse({ description: 'Especialidades em ordem alfabética.' })
  async list() {
    return { data: await this.specialties.listActive() };
  }
}

@Module({
  controllers: [SpecialtiesController],
  providers: [SpecialtiesService],
  exports: [SpecialtiesService],
})
export class SpecialtiesModule {}
