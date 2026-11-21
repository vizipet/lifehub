import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Get,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import {
  MAX_VERIFICATION_FILE_SIZE_BYTES,
  type VerificationUploadFile,
} from './verification-file.validator';
import { VerificationService } from './verification.service';

@ApiTags('Verification')
@ApiBearerAuth()
@Controller('verification')
@UseGuards(
  JwtAuthGuard,
  ActiveUserGuard,
  RolesGuard,
)
@Roles(UserRole.PROFESSIONAL)
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
  ) {}

  @Post('documents')
  @ApiOperation({
    summary: 'Enviar documento privado para verificacao',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Documento privado recebido com sucesso.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_VERIFICATION_FILE_SIZE_BYTES,
        files: 1,
      },
    }),
  )
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: VerificationUploadFile,
  ) {
    const document =
      await this.verificationService.uploadDocument(
        user.id,
        file,
      );

    return {
      data: document,
    };
  }

  @Get('documents')
  @ApiOperation({ summary: 'Listar os documentos que eu já enviei (sem o arquivo)' })
  async listDocuments(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.verificationService.listMyDocuments(user.id) };
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar perfil profissional para analise',
  })
  @ApiOkResponse({
    description:
      'Solicitacao de verificacao enviada para analise.',
  })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const verification =
      await this.verificationService.submit(user.id);

    return {
      data: verification,
    };
  }
}
