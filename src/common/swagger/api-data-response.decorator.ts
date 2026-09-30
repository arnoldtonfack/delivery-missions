import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

interface IApiDataResponseOptions {
  readonly status?: HttpStatus;
  readonly isArray?: boolean;
  readonly description?: string;
}

/**
 * Réponse de succès Swagger telle que le client la reçoit VRAIMENT :
 * `ResponseInterceptor` enveloppe chaque résultat dans `{ success, data, timestamp }`.
 * Documenter le DTO nu ferait lire `response.accessToken` au lieu de
 * `response.data.accessToken`.
 */
export const ApiDataResponse = (
  model: Type<unknown>,
  options: IApiDataResponseOptions = {},
): MethodDecorator & ClassDecorator => {
  const data = options.isArray
    ? { type: 'array', items: { $ref: getSchemaPath(model) } }
    : { $ref: getSchemaPath(model) };

  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description ?? 'Succès',
      schema: {
        type: 'object',
        required: ['success', 'data', 'timestamp'],
        properties: {
          success: { type: 'boolean', example: true },
          data,
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    }),
  );
};
