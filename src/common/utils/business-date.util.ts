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

const businessDayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Jour courant `YYYY-MM-DD` dans le fuseau métier. Assemblé depuis les parties
 * (année, mois, jour) plutôt que depuis la chaîne formatée d'une locale, dont
 * l'ordre et les séparateurs dépendent de la version d'ICU/CLDR.
 */
export const businessToday = (now: Date = new Date()): string => {
  const parts = businessDayFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

/** `YYYY-MM-DD` → `Date` à minuit UTC, la valeur attendue par une colonne `@db.Date`. */
export const dateOnlyToDate = (day: string): Date =>
  new Date(`${day}T00:00:00.000Z`);

/** `Date` lue d'une colonne `@db.Date` → `YYYY-MM-DD`. */
export const dateToDateOnly = (date: Date): string =>
  date.toISOString().slice(0, 10);
