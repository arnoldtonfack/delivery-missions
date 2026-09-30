import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Seed de données de démonstration / référence.
 *
 * Doit rester IDEMPOTENT (upsert plutôt que create) : il peut être relancé sans
 * dupliquer de données, en local comme au déploiement.
 *
 * Usage : `pnpm seed`
 */
const logger = new Logger('Seed');

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });

  try {
    // Exemple : await prisma.item.upsert({ where: { slug }, create: {...}, update: {} });
    await prisma.$queryRaw`SELECT 1`;
    logger.log('Seed terminé (aucune donnée à insérer pour le moment).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
