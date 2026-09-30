/**
 * Constantes d'API partagées — SOURCE UNIQUE du versionnage/préfixe global. Importées
 * par `main.ts` (`setGlobalPrefix`) ET par tout code qui doit construire une URL
 * absolue vers une route API. Ne jamais recopier ces valeurs ailleurs : un bump de
 * version se fait ici et se propage partout.
 */

/** Version d'API (segment de version du préfixe global). */
export const API_VERSION = 'v1.0.0';

/** Préfixe global appliqué à toutes les routes REST (`api/<version>`). */
export const GLOBAL_PREFIX = `api/${API_VERSION}`;
