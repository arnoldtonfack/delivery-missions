import { compare, hash } from 'bcryptjs';

/**
 * Hachage des mots de passe — bcrypt (implémentation `bcryptjs`, pur JavaScript :
 * aucun module natif à compiler dans l'image Alpine).
 *
 * 10 tours : ~70 ms par hash, compromis usuel entre coût d'une attaque par force
 * brute et latence du login.
 */
const BCRYPT_ROUNDS = 10;

/**
 * Hash factice (bcrypt valide) comparé quand l'e-mail est inconnu : la réponse
 * prend alors le même temps que pour un mauvais mot de passe, ce qui empêche de
 * deviner par chronométrage quels comptes existent.
 */
const TIMING_SAFE_DUMMY_HASH =
  '$2b$10$zfJgZ3Mpynwu9kstnTm0sud1Jbiugv9E/6nwEjS8LaV3fhqma1sC2';

/** Hache un mot de passe en clair. */
export const hashPassword = (plain: string): Promise<string> =>
  hash(plain, BCRYPT_ROUNDS);

/**
 * Compare un mot de passe à son hash. Sans hash (utilisateur inconnu), compare
 * quand même contre un hash factice pour un temps de réponse constant.
 */
export const verifyPassword = async (
  plain: string,
  passwordHash: string | null,
): Promise<boolean> => {
  const matches = await compare(plain, passwordHash ?? TIMING_SAFE_DUMMY_HASH);
  return passwordHash !== null && matches;
};
