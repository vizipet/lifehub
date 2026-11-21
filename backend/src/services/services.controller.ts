import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateServiceDto } from './create-service.dto';
import { UpdateServiceDto } from './update-service.dto';
import { ServicesService } from './services.service';

@ApiTags('Services')
@ApiBearerAuth()
@Controller('clinics/:clinicId/services')
@UseGuards(
  JwtAuthGuard,
  ActiveUserGuard,
  RolesGuard,
)
@Roles(UserRole.PROFESSIONAL)
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar serviços da minha clínica',
  })
  @ApiOkResponse({
    description:
      'Serviços da clínica vinculada ao profissional autenticado.',
  })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
  ) {
    const services = await this.servicesService.listMine(
      clinicId,
      user.id,
    );

    return {
      data: services,
    };
  }

  @Get(':serviceId')
  @ApiOperation({
    summary: 'Visualizar serviço da minha clínica',
  })
  @ApiOkResponse({
    description: 'Serviço encontrado com sucesso.',
  })
  async findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    const service =
      await this.servicesService.findMineById(
        clinicId,
        serviceId,
        user.id,
      );

    return {
      data: service,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Cadastrar serviço na minha clínica',
  })
  @ApiCreatedResponse({
    description: 'Serviço cadastrado com sucesso.',
  })
  async createMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Body() dto: CreateServiceDto,
  ) {
    const service = await this.servicesService.createMine(
      clinicId,
      user.id,
      dto,
    );

    return {
      data: service,
    };
  }

  @Patch(':serviceId')
  @ApiOperation({
    summary: 'Atualizar serviço da minha clínica',
  })
  @ApiOkResponse({
    description: 'Serviço atualizado com sucesso.',
  })
  async updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const service = await this.servicesService.updateMine(
      clinicId,
      serviceId,
      user.id,
      dto,
    );

    return {
      data: service,
    };
  }

  @Delete(':serviceId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Excluir serviço nunca usado (senão, desative)' })
  async deleteMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ): Promise<void> {
    await this.servicesService.deleteMine(clinicId, serviceId, user.id);
  }
}
