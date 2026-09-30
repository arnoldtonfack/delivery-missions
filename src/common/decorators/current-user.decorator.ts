import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  AUTHENTICATED_REQUEST_KEY,
  type IAuthenticatedUser,
  isAuthenticatedUser,
  type TAuthenticatedRequest,
} from '../guards/authenticated-request';

/**
 * Injecte l'utilisateur authentifié posé par `JwtAuthGuard` sur `request.user`.
 *
 * Utilisé sur une route `@Public()` (guard non exécuté), il lève une erreur 500
 * explicite : c'est une erreur de câblage, pas une erreur du client.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IAuthenticatedUser => {
    const request = context.switchToHttp().getRequest<TAuthenticatedRequest>();
    const user = request[AUTHENTICATED_REQUEST_KEY];

    if (!isAuthenticatedUser(user)) {
      throw new InternalServerErrorException('AUTH_CONTEXT_MISSING');
    }
    return user;
  },
);
