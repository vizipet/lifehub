import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../generated/prisma/client';
import { MAX_PHOTO_BYTES } from './professional-photo';
import { ProfessionalPhotoService } from './professional-photo.service';

@ApiTags('Professionals')
@ApiBearerAuth()
@Controller('professionals/me/photo')
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Roles(UserRole.PROFESSIONAL)
export class ProfessionalPhotoController {
  constructor(private readonly photos: ProfessionalPhotoService) {}

  @Post()
  @ApiOperation({ summary: 'Enviar ou trocar minha foto de perfil (JPG, PNG ou WebP, até 2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: { buffer: Buffer; size: number }) {
    return { data: await this.photos.upload(user.id, file) };
  }

  @Delete()
  @ApiOperation({ summary: 'Remover minha foto de perfil' })
  async remove(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.photos.remove(user.id) };
  }
}

@ApiTags('Médicos (público)')
@Controller('public/professionals')
export class PublicProfessionalPhotoController {
  constructor(private readonly photos: ProfessionalPhotoService) {}

  @Get(':id/photo')
  // O endereço muda a cada troca de foto (?v=...), então pode ficar em cache.
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  // O site (porta 5173) mostra imagens da API (porta 3000).
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @ApiOperation({ summary: 'Foto de perfil do médico' })
  async photo(@Param('id', ParseUUIDPipe) id: string) {
    const photo = await this.photos.read(id);
    return new StreamableFile(photo.buffer, { type: photo.mimeType, length: photo.buffer.length, disposition: 'inline' });
  }
}
