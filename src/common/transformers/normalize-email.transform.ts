import { Transform } from 'class-transformer';

/**
 * Normalise un e-mail (trim + minuscules) avant validation : `Jean@Demo.cm ` et
 * `jean@demo.cm` désignent le même compte. Utilisé partout où un e-mail entre
 * dans l'API (connexion, création/modification de chauffeur).
 */
export const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
