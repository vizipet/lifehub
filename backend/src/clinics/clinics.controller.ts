import {
  UploadedFile,
  UseInterceptors,
  Body,
  Controller,
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
import { CreateClinicDto } from './create-clinic.dto';
import { UpdateClinicDto } from './update-clinic.dto';
import { ClinicsService } from './clinics.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import {
  MAX_VERIFICATION_FILE_SIZE_BYTES,
  type VerificationUploadFile,
} from '../verification/verification-file.validator';

@ApiTags('Clinics')
@ApiBearerAuth()
@Controller('clinics')
@UseGuards(
  JwtAuthGuard,
  ActiveUserGuard,
  RolesGuard,
)
@Roles(UserRole.PROFESSIONAL)
export class ClinicsController {
  constructor(
    private readonly clinicsService: ClinicsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar minhas clínicas',
  })
  @ApiOkResponse({
    description: 'Clínicas vinculadas ao profissional autenticado.',
  })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const clinics =
      await this.clinicsService.listMine(user.id);

    return {
      data: clinics,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Visualizar minha clínica',
  })
  @ApiOkResponse({
    description: 'Clínica vinculada ao profissional autenticado.',
  })
  async findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) clinicId: string,
  ) {
    const clinic =
      await this.clinicsService.findMineById(
        clinicId,
        user.id,
      );

    return {
      data: clinic,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Cadastrar clínica',
  })
  @ApiCreatedResponse({
    description: 'Clínica cadastrada com sucesso.',
  })
  async createMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateClinicDto,
  ) {
    const clinic =
      await this.clinicsService.createMine(
        user.id,
        dto,
      );

    return {
      data: clinic,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar minha clínica',
  })
  @ApiOkResponse({
    description: 'Clínica atualizada com sucesso.',
  })
  async updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) clinicId: string,
    @Body() dto: UpdateClinicDto,
  ) {
    const clinic =
      await this.clinicsService.updateMine(
        clinicId,
        user.id,
        dto,
      );

    return {
      data: clinic,
    };
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Documentos do local (alvará, comprovante)' })
  async listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) clinicId: string,
  ) {
    return { data: await this.clinicsService.listDocuments(clinicId, user.id) };
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Enviar documento do local (PDF, JPG ou PNG, até 10 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VERIFICATION_FILE_SIZE_BYTES, files: 1 } }))
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) clinicId: string,
    @UploadedFile() file: VerificationUploadFile,
  ) {
    return { data: await this.clinicsService.uploadDocument(clinicId, user.id, file) };
  }
}
