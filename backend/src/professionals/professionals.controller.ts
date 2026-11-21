import {
  Body,
  Controller,
  Get,
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
import { CreateProfessionalDto } from './create-professional.dto';
import { UpdateProfessionalDto } from './update-professional.dto';
import { ProfessionalsService } from './professionals.service';
import { professionalPhotoUrl } from './professional-photo';

@ApiTags('Professionals')
@ApiBearerAuth()
@Controller('professionals')
@UseGuards(
  JwtAuthGuard,
  ActiveUserGuard,
  RolesGuard,
)
@Roles(UserRole.PROFESSIONAL)
export class ProfessionalsController {
  constructor(
    private readonly professionalsService: ProfessionalsService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Visualizar meu perfil profissional',
  })
  @ApiOkResponse({
    description: 'Perfil profissional do usuário autenticado.',
  })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const professional =
      await this.professionalsService.findMine(user.id);
    // O caminho do arquivo é interno; a tela recebe só o endereço da foto.
    const { photoStoragePath, photoMimeType, ...rest } = professional;
    void photoStoragePath;
    void photoMimeType;

    return {
      data: { ...rest, photoUrl: professionalPhotoUrl(professional) },
    };
  }

  @Post('me')
  @ApiOperation({
    summary: 'Criar meu perfil profissional',
  })
  @ApiCreatedResponse({
    description: 'Perfil profissional criado com sucesso.',
  })
  async createMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfessionalDto,
  ) {
    const professional =
      await this.professionalsService.createMine(
        user.id,
        dto,
      );

    return {
      data: professional,
    };
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Atualizar meu perfil profissional',
  })
  @ApiOkResponse({
    description: 'Perfil profissional atualizado com sucesso.',
  })
  async updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfessionalDto,
  ) {
    const professional =
      await this.professionalsService.updateMine(
        user.id,
        dto,
      );

    return {
      data: professional,
    };
  }
}