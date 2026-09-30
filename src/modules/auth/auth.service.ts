import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verifyPassword } from '../../common/crypto/password.util';
import type { IAccessTokenPayload } from '../../common/guards/authenticated-request';
import { PrismaService } from '../../database/prisma.service';
import type { UserResponseDto } from '../users/dto/user-response.dto';
import { toUserResponse, USER_RESPONSE_SELECT } from '../users/user.mapper';
import { readJwtExpiresInSeconds } from './auth.constants';
import type { LoginDto } from './dto/login.dto';
import type { LoginResponseDto } from './dto/login-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly expiresIn: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.expiresIn = readJwtExpiresInSeconds(config);
  }

  /**
   * E-mail / mot de passe → jeton d'accès.
   *
   * E-mail inconnu et mauvais mot de passe renvoient la MÊME erreur (et le même
   * temps de réponse, cf. `verifyPassword`) : impossible de deviner les comptes.
   * Le statut « désactivé » n'est révélé qu'avec un mot de passe correct.
   */
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...USER_RESPONSE_SELECT, passwordHash: true },
    });

    const passwordMatches = await verifyPassword(
      dto.password,
      user?.passwordHash ?? null,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }
    if (!user.isActive) {
      throw new ForbiddenException('ACCOUNT_DISABLED');
    }

    const payload: IAccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwtService.signAsync({ ...payload });
    this.logger.log(`Connexion réussie (utilisateur ${user.id})`);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.expiresIn,
      user: toUserResponse(user),
    };
  }

  /** Profil de l'utilisateur connecté. */
  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: USER_RESPONSE_SELECT,
    });
    return toUserResponse(user);
  }
}
