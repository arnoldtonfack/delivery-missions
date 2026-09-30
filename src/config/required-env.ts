/**
 * Garde de démarrage des variables d'environnement indispensables.
 *
 * Pourquoi : une variable manquante doit faire échouer le BOOT (panne immédiate et
 * visible, le health check ne passe pas, le déploiement n'est pas promu) plutôt que
 * la première requête qui en a besoin, des heures plus tard.
 *
 * Appelée dans `main.ts` APRÈS `NestFactory.create` : c'est `ConfigModule.forRoot`
 * qui charge `.env` dans `process.env`.
 */

interface IRequiredVariable {
  /** Nom exact de la variable d'environnement. */
  readonly name: string;
  /** Ce que la variable configure — repris tel quel dans le message d'erreur. */
  readonly purpose: string;
}

/**
 * N'ajouter ici QUE des variables dont l'absence est fatale : une variable
 * optionnelle ou pourvue d'un défaut bloquerait le boot sans raison.
 */
const REQUIRED_VARIABLES: readonly IRequiredVariable[] = [
  { name: 'DATABASE_URL', purpose: 'connexion PostgreSQL (PrismaService)' },
  { name: 'REDIS_HOST', purpose: 'hôte Redis (cache applicatif, BullMQ)' },
  { name: 'REDIS_PORT', purpose: 'port Redis (cache applicatif, BullMQ)' },
  { name: 'JWT_SECRET', purpose: 'signature des jetons d’accès (AuthModule)' },
];

/**
 * Vérifie la présence des variables requises et signale TOUS les manques en une
 * fois. Ne divulgue jamais une valeur dans le message d'erreur.
 * @throws Error si au moins une variable requise est absente ou vide.
 */
export const validateRequiredEnv = (
  env: NodeJS.ProcessEnv = process.env,
): void => {
  const problems: string[] = [];

  for (const { name, purpose } of REQUIRED_VARIABLES) {
    if (!env[name]?.trim()) {
      problems.push(`- ${name} manquante (${purpose})`);
    }
  }

  if (env.NODE_ENV === 'production' && !env.CORS_ORIGIN?.trim()) {
    problems.push('- CORS_ORIGIN manquante (obligatoire en production)');
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuration invalide — démarrage annulé :\n${problems.join('\n')}`,
    );
  }
};
