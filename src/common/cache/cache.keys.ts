/**
 * Convention de nommage des clés de cache : `<domaine>:<segment>:<segment>…`
 * (ex. `products:detail:42`, `products:list:page=1:limit=20`).
 *
 * Des clés DÉTERMINISTES permettent d'invalider précisément après une écriture :
 * le service qui modifie une ressource sait exactement quelles clés supprimer.
 */
export const cacheKey = (
  domain: string,
  ...segments: ReadonlyArray<string | number>
): string => [domain, ...segments.map(String)].join(':');

/** TTL par défaut (secondes) quand l'appelant n'en précise pas. */
export const DEFAULT_CACHE_TTL_SECONDS = 300;
