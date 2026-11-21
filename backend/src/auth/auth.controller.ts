import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cadastrar paciente (titular)',
  })
  @ApiCreatedResponse({
    description: 'Paciente cadastrado com sucesso.',
  })
  @ApiConflictResponse({
    description: 'E-mail ou CPF já cadastrado.',
  })
  async registerPatient(@Body() dto: RegisterDto) {
    const user = await this.authService.registerPatient(dto);

    return {
      data: user,
    };
  }

  @Post('register/professional')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cadastrar profissional',
  })
  @ApiCreatedResponse({
    description: 'Profissional cadastrado com sucesso.',
  })
  @ApiConflictResponse({
    description: 'E-mail ou CPF já cadastrado.',
  })
  async registerProfessional(@Body() dto: RegisterDto) {
    const user = await this.authService.registerProfessional(dto);

    return {
      data: user,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Entrar na conta',
  })
  @ApiCreatedResponse({
    description: 'Login realizado com sucesso.',
  })
  @ApiUnauthorizedResponse({
    description: 'E-mail/CPF ou senha inválidos.',
  })
  async login(@Body() dto: LoginDto) {
    const auth = await this.authService.login(dto);

    return {
      data: auth,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Renovar tokens da sessão',
  })
  @ApiCreatedResponse({
    description: 'Tokens renovados com sucesso.',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token inválido ou expirado.',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    const auth = await this.authService.refresh(dto.refreshToken);

    return {
      data: auth,
    };
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Solicitar recuperação de senha',
  })
  @ApiNoContentResponse({
    description:
      'Solicitação processada sem revelar se o e-mail existe.',
  })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
  ): Promise<void> {
    await this.authService.requestPasswordReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Redefinir senha',
  })
  @ApiNoContentResponse({
    description: 'Senha redefinida com sucesso.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token de recuperação inválido ou expirado.',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.authService.resetPassword(
      dto.token,
      dto.newPassword,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Encerrar sessão',
  })
  @ApiNoContentResponse({
    description: 'Sessão encerrada com sucesso.',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token inválido ou expirado.',
  })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }
}