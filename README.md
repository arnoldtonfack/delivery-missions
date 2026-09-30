# Delivery Missions — gestion des missions de livraison

Socle backend prêt à accueillir un domaine métier. Aucune fonctionnalité métier n'est
implémentée : seulement la configuration, l'infrastructure et les conventions, pour
commencer directement par le besoin.

> Démarche : **Observer → comprendre le besoin → choisir l'architecture adaptée →
> implémenter → tester → déployer → vérifier.**

---

## Démarrage rapide

Prérequis : Node 22, pnpm 11 (`corepack enable`), Docker.

```bash
cp .env.example .env
pnpm install
make infra                # PostgreSQL (localhost:5440) + Redis (localhost:6390)
pnpm prisma:generate
pnpm dev                  # http://localhost:3000
```

| URL | Rôle |
| --- | --- |
| `http://localhost:3000/health` | Santé (db + redis), 503 si dégradé — hors préfixe |
| `http://localhost:3000/docs` | Swagger |
| `http://localhost:3000/api/v1.0.0/...` | Routes REST |

Tout en Docker (image de prod + migrations) : `make up`.

> Les ports publiés (5440 / 6390) sont volontairement non standards pour cohabiter avec
> d'autres projets locaux. Modifiables dans `.env`.

---

## Scripts

| Commande | Effet |
| --- | --- |
| `pnpm dev` | API en watch |
| `pnpm build` / `pnpm start:prod` | Build puis exécution de `dist/src/main` |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | Qualité |
| `pnpm test` / `pnpm test:cov` | Tests unitaires |
| `pnpm test:e2e` | E2E contre la vraie infra (`make infra` avant) |
| `pnpm prisma:migrate --name <nom>` | Crée + applique une migration (dev) |
| `pnpm prisma:migrate:prod` | Applique les migrations (`migrate deploy`) |
| `pnpm prisma:studio` / `pnpm prisma:reset` | Studio / reset de la base |
| `pnpm seed` | Seed idempotent (`scripts/seed.ts`) |

`make help` liste les raccourcis Docker (infra, up, down, logs, db-shell, redis-shell, redis-flush…).

---

## Architecture

```
├── prisma/schema.prisma          # modèles (vide) — client généré dans generated/prisma
├── prisma.config.ts              # migrations dans src/database/migrations
├── scripts/seed.ts
├── test/                         # e2e
└── src/
    ├── main.ts                   # helmet, CORS, ValidationPipe, préfixe, Swagger
    ├── app.module.ts             # Config, Cache (Redis), BullMQ, Throttler, Prisma, Redis, Health
    ├── config/                   # redis.config.ts, required-env.ts (garde de démarrage)
    ├── database/                 # PrismaModule (global), PrismaService, migrations/
    ├── health/                   # GET /health
    ├── common/
    │   ├── cache/                # CacheService (cache-aside), cacheKey()
    │   ├── constants/            # API_VERSION, GLOBAL_PREFIX
    │   ├── decorators/  errors/  guards/  pipes/  validators/
    │   ├── filters/              # HttpExceptionFilter (erreurs Prisma → HTTP)
    │   ├── interceptors/         # ResponseInterceptor → { success, data, timestamp }
    │   ├── redis/                # client ioredis global partagé (REDIS_CLIENT)
    │   ├── swagger/              # helpers de réponses d'erreur
    │   └── utils/                # withTimeout
    └── modules/                  # un dossier par domaine métier
```

### Ajouter un domaine

```bash
pnpm nest g resource modules/<domaine> --no-spec   # REST API, puis adapter
```

- `controller` : routing uniquement ; `service` : logique + Prisma ; `dto/` : class-validator ;
  `tests/` : specs du service.
- Ajouter les modèles dans `prisma/schema.prisma`, puis `pnpm prisma:migrate --name <nom>`.
- Enregistrer le module dans `app.module.ts`.

### Contrat de réponse

- Succès : `{ "success": true, "data": ..., "timestamp": "..." }`
- Erreur : `{ "statusCode": 404, "message": "RESOURCE_NOT_FOUND", "error": "Not Found" }`
  (P2002 → 409, P2003 → 400, P2025 → 404 ; toute erreur inattendue → 500 générique, loggée).

---

## Cache Redis (cache-aside, opt-in)

```ts
// lecture
return this.cache.getOrSet(cacheKey('items', 'detail', id), () =>
  this.prisma.item.findUniqueOrThrow({ where: { id } }), 300);

// écriture → invalidation explicite
await this.prisma.item.update({ where: { id }, data });
await this.cache.del(cacheKey('items', 'detail', id), cacheKey('items', 'list'));
```

1. Le client demande la ressource → 2. l'API lit Redis → 3. hit : réponse directe →
4. miss : lecture PostgreSQL → 5. écriture Redis avec TTL → 6. les requêtes suivantes sont servies depuis le cache.

- **À cacher** : lectures fréquentes, données stables (référentiels, détails publics, listes peu volatiles).
- **À ne pas cacher** : données par utilisateur sensibles, données qui changent à chaque requête,
  tout ce qui doit être strictement à jour (stock, solde, statut de paiement…).
- **Invalidation** : clés déterministes (`cacheKey`) supprimées juste après chaque écriture ; le TTL
  borne l'obsolescence en cas d'oubli.
- **Fail-open** : Redis indisponible ou lent (> 500 ms) → la lecture part directement en base, avec un warning.
  `null` n'est jamais mis en cache.

## BullMQ — seulement si le besoin le justifie

Redis est une infrastructure disponible dès le départ ; **BullMQ n'est utilisé que lorsqu'un besoin
réel de traitement asynchrone apparaît** (rapport lourd, traitement de fichier, envoi massif,
tâche avec retry qui ne doit pas bloquer la requête HTTP). La connexion est déclarée dans
`app.module.ts` ; aucune queue n'existe tant qu'elle n'est pas nécessaire.

```ts
// <domaine>.module.ts
imports: [BullModule.registerQueue({ name: 'reports' })],
providers: [ReportsProcessor],

// <domaine>.service.ts
constructor(@InjectQueue('reports') private readonly queue: Queue) {}
await this.queue.add('generate', { reportId }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });

// reports.processor.ts
@Processor('reports')
export class ReportsProcessor extends WorkerHost {
  async process(job: Job<{ reportId: string }>): Promise<void> { /* ... */ }
}
```

Redis tourne en `maxmemory-policy noeviction` : requis par BullMQ (un job évincé est un job perdu).

---

## Déploiement (Render ou équivalent)

1. **PostgreSQL** managé + **Redis** (Key Value) managé.
2. **Web Service** Docker sur ce dépôt (`Dockerfile`, cible `production`), health check `/health`.
3. Variables : `NODE_ENV=production`, `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`,
   `CORS_ORIGIN` (URL du front, obligatoire en prod), `RUN_MIGRATIONS=true`
   (l'entrypoint applique `prisma migrate deploy` avant le démarrage).
4. Vérifier : `curl https://<service>/health` → `status: ok`, puis `/docs`.

---

## Pourquoi ces choix

| Techno | Raison |
| --- | --- |
| **NestJS** | Architecture modulaire imposée (modules, DI, guards, pipes, filters) : structure lisible et testable dès le premier endpoint. |
| **PostgreSQL** | Relationnel, transactions ACID, contraintes d'intégrité, index : le bon défaut pour des données métier. |
| **Prisma** | Schéma déclaratif unique, migrations versionnées, client typé de bout en bout. |
| **class-validator** | Validation déclarative des DTOs, intégrée au `ValidationPipe` et à Swagger. |
| **Redis** | Cache applicatif ciblé (latence, charge DB) + socle de BullMQ ; une seule brique pour deux usages. |
| **BullMQ** | Jobs persistants avec retry/backoff — uniquement quand une tâche ne doit pas bloquer HTTP. |
| **Docker / Compose** | Même environnement en local et en production ; infra locale en une commande. |
| **Throttler + helmet** | Rate limiting et en-têtes de sécurité par défaut, sans coût de mise en place. |
