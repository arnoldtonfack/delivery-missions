import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { IAuthenticatedUser } from '../../common/guards/authenticated-request';
import { ApiDataResponse } from '../../common/swagger/api-data-response.decorator';
import {
  badRequestResponse,
  forbiddenResponse,
  unauthorizedResponse,
} from '../../common/swagger/api-error-responses';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Anti force brute : 10 tentatives / minute / IP (en plus des limites globales).
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par e-mail / mot de passe → jeton JWT' })
  @ApiDataResponse(LoginResponseDto)
  @ApiBadRequestResponse(
    badRequestResponse('Corps de requête invalide', ['email must be an email']),
  )
  @ApiUnauthorizedResponse(
    unauthorizedResponse(
      'E-mail ou mot de passe incorrect',
      'INVALID_CREDENTIALS',
    ),
  )
  @ApiForbiddenResponse(
    forbiddenResponse('Compte désactivé', 'ACCOUNT_DISABLED'),
  )
  @ApiTooManyRequestsResponse({
    description: 'Trop de tentatives de connexion',
  })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil de l’utilisateur connecté' })
  @ApiDataResponse(UserResponseDto)
  @ApiUnauthorizedResponse(unauthorizedResponse())
  me(@CurrentUser() user: IAuthenticatedUser): Promise<UserResponseDto> {
    return this.authService.me(user.id);
  }
}
