import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AUTHENTICATED_REQUEST_KEY,
  type IAuthenticatedUser,
  type TAuthenticatedRequest,
} from './authenticated-request';

/**
 * Guard global (APP_GUARD) : toute route exige un jeton Bearer valide, sauf
 * celles marquées `@Public()`.
 *
 * Le jeton seul ne fait pas autorité : l'utilisateur est RELU EN BASE à chaque
 * requête (lecture par clé primaire). Un compte désactivé ou dont le rôle change
 * est donc coupé immédiatement, sans liste de révocation de jetons.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TAuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('AUTH_TOKEN_MISSING');
    }

    const userId = await this.verifyToken(token);
    request[AUTHENTICATED_REQUEST_KEY] = await this.loadActiveUser(userId);
    return true;
  }

  /** Vérifie signature + expiration et renvoie l'identifiant (`sub`). */
  private async verifyToken(token: string): Promise<string> {
    let payload: Record<string, unknown>;
    try {
      payload =
        await this.jwtService.verifyAsync<Record<string, unknown>>(token);
    } catch {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    const { sub } = payload;
    if (typeof sub !== 'string' || !isUUID(sub)) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    return sub;
  }

  private async loadActiveUser(userId: string): Promise<IAuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('ACCOUNT_DISABLED');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}

const extractBearerToken = (header: string | undefined): string | undefined => {
  const [type, token] = header?.split(' ') ?? [];
  return type === 'Bearer' && token ? token : undefined;
};
