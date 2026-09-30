import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'src/database/migrations',
  },
  datasource: {
    // Migrations (`prisma migrate deploy/dev`) prennent une connexion DIRECTE à
    // Postgres si `DIRECT_DATABASE_URL` est défini, sinon `DATABASE_URL`. En prod,
    // `DATABASE_URL` pointe vers pgbouncer (pooling transaction) : or `migrate`
    // pose un `pg_advisory_lock` lié à la SESSION, incompatible avec le pooler →
    // erreur P1002 (« timed out trying to acquire advisory lock »). On bypasse donc
    // pgbouncer pour les migrations via `DIRECT_DATABASE_URL` (Postgres en direct).
    // Le runtime (PrismaService + adapter) continue d'utiliser `DATABASE_URL`.
    url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'],
  },
});
