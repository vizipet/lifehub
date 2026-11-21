import {
  Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse,
  ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/client';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './create-campaign.dto';
import { ListAdminCampaignsQueryDto, ReviewCampaignSourceDto } from './review-campaign-source.dto';
import { UpdateCampaignDto } from './update-campaign.dto';

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar campanhas publicadas e vigentes' })
  @ApiOkResponse({ description: 'Fonte e data de verificação, sem dados administrativos internos.' })
  async findAllPublic() { return { data: await this.campaigns.findAllPublic() }; }

  @Get('admin')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar campanhas e sinais de fontes para revisão humana' })
  @ApiOkResponse({ description: 'Campanhas administrativas; filtro opcional sourceStatus.' })
  @ApiUnauthorizedResponse({ description: 'Autenticação necessária.' })
  @ApiForbiddenResponse({ description: 'Conta ADMIN ativa necessária.' })
  @ApiBadRequestResponse({ description: 'Filtro inválido.' })
  async findAllAdmin(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListAdminCampaignsQueryDto) {
    return { data: await this.campaigns.findAllAdmin(actor.id, query) };
  }

  @Get('admin/:id')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consultar campanha e versão para revisão' })
  @ApiOkResponse({ description: 'Dados administrativos sem reservas internas dos jobs.' })
  @ApiNotFoundResponse({ description: 'Campanha não encontrada.' })
  async findOneAdmin(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.campaigns.findOneAdmin(id, actor.id) };
  }

  @Post()
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar campanha em DRAFT' })
  @ApiCreatedResponse({ description: 'Campanha criada e aviso de possível duplicidade.' })
  @ApiBadRequestResponse({ description: 'Campos, período ou fonte inválidos.' })
  async create(@Body() dto: CreateCampaignDto, @CurrentUser() actor: AuthenticatedUser) {
    return { data: await this.campaigns.create(dto, actor.id) };
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar campanha; conteúdo alterado exige nova revisão/publicação' })
  @ApiOkResponse({ description: 'Campanha atualizada e auditada.' })
  @ApiBadRequestResponse({ description: 'Atualização vazia ou dados inválidos.' })
  @ApiNotFoundResponse({ description: 'Campanha não encontrada.' })
  @ApiConflictResponse({ description: 'Campanha arquivada.' })
  async updateAdmin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto,
    @CurrentUser() actor: AuthenticatedUser) {
    return { data: await this.campaigns.updateAdmin(id, dto, actor.id) };
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Arquivar campanha sem exclusão física' })
  @ApiOkResponse({ description: 'Campanha arquivada e auditada.' })
  async archiveAdmin(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return { data: await this.campaigns.archiveAdmin(id, actor.id) };
  }

  @Patch('admin/:id/review')
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar DRAFT para UNDER_REVIEW' })
  @ApiOkResponse({ description: 'Campanha enviada para revisão.' })
  @ApiBadRequestResponse({ description: 'Estado ou conteúdo incompatível.' })
  async submitForReviewAdmin(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return { data: await this.campaigns.submitForReviewAdmin(id, actor.id) };
  }

  @Patch('admin/:id/publish')
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirmar revisão humana e publicar campanha' })
  @ApiOkResponse({ description: 'Publicada com administrador e data de verificação.' })
  @ApiBadRequestResponse({ description: 'Estado, fonte ou período incompatível com publicação.' })
  async publishAdmin(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return { data: await this.campaigns.publishAdmin(id, actor.id) };
  }

  @Patch('admin/:id/source-review')
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar revisão humana de fonte; OUTDATED retira da publicação' })
  @ApiOkResponse({ description: 'Decisão auditada; VALID não publica automaticamente.' })
  @ApiBadRequestResponse({ description: 'Decisão, versão ou justificativa inválida.' })
  @ApiConflictResponse({ description: 'Versão mudou; consultar novamente antes de decidir.' })
  async reviewSource(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewCampaignSourceDto,
    @CurrentUser() actor: AuthenticatedUser) {
    return { data: await this.campaigns.reviewSource(id, dto, actor.id) };
  }
}
