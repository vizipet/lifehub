import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { CreateDependentDto, UpdatePatientDto } from './patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('Pacientes e dependentes')
@ApiBearerAuth()
@Controller('patients')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar titular e dependentes da conta' })
  @ApiOkResponse({ description: 'Titular primeiro, depois os dependentes.' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.patients.listByHolder(user.id) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver um paciente da conta' })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.patients.findOwnedById(id, user.id) };
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar dependente' })
  @ApiCreatedResponse({ description: 'Dependente cadastrado.' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDependentDto,
  ) {
    return { data: await this.patients.createDependent(user.id, dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dependente (ou o sexo do titular)' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return { data: await this.patients.updateOwned(id, user.id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remover dependente' })
  @ApiNoContentResponse({ description: 'Dependente removido.' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.patients.removeOwned(id, user.id);
  }
}
