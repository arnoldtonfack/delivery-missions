import type { ConfigService } from '@nestjs/config';

/** 8 h : une journée de tournée sans reconnexion. */
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 28_800;

/** Durée de vie du jeton d'accès (`JWT_EXPIRES_IN_SECONDS`), défaut 8 h. */
export const readJwtExpiresInSeconds = (config: ConfigService): number => {
  const raw = Number(config.get<string>('JWT_EXPIRES_IN_SECONDS'));
  return Number.isInteger(raw) && raw > 0
    ? raw
    : DEFAULT_JWT_EXPIRES_IN_SECONDS;
};
