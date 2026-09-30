/**
 * Dates « jour » (sans heure) du métier.
 *
 * « Aujourd'hui » est calculé côté serveur dans le fuseau de l'entreprise, jamais
 * avec l'horloge du navigateur ni celle du conteneur (UTC en production). Les
 * colonnes `@db.Date` sont lues/écrites par Prisma comme un `Date` à minuit UTC :
 * on convertit donc entre `YYYY-MM-DD` et ce `Date` sans jamais passer par le
 * fuseau local du processus.
 */
export const BUSINESS_TIME_ZONE = 'Africa/Douala';

/** Format `YYYY-MM-DD` (la locale `en-CA` formate déjà ainsi). */
const businessDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Jour courant `YYYY-MM-DD` dans le fuseau métier. */
export const businessToday = (now: Date = new Date()): string =>
  businessDayFormatter.format(now);

/** `YYYY-MM-DD` → `Date` à minuit UTC, la valeur attendue par une colonne `@db.Date`. */
export const dateOnlyToDate = (day: string): Date =>
  new Date(`${day}T00:00:00.000Z`);

/** `Date` lue d'une colonne `@db.Date` → `YYYY-MM-DD`. */
export const dateToDateOnly = (date: Date): string =>
  date.toISOString().slice(0, 10);
