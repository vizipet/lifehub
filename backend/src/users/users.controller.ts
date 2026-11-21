import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UpdateMeDto } from './update-me.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @ApiOperation({
    summary: 'Consultar minha conta',
  })
  @ApiOkResponse({
    description: 'Dados da conta autenticada.',
  })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const account = await this.usersService.findPublicById(user.id);

    if (!account) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }

    return {
      data: account,
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @ApiOperation({
    summary: 'Atualizar minha conta',
  })
  @ApiOkResponse({
    description: 'Dados da conta atualizados com sucesso.',
  })
  async updateMe(
  @CurrentUser() user: AuthenticatedUser,
  @Body() dto: UpdateMeDto,
  ) {
      const account = await this.usersService.updateMe(
        user.id,
        dto,
      );

  return {
      data: account,
  };
  }
}