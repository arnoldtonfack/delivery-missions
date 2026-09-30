# CLAUDE.md — Standards de développement Backend

> Ce fichier est lu automatiquement par Claude Code à chaque session.
> Les règles ci-dessous s'appliquent à chaque fichier produit ou modifié.

---

## Stack technique

- **Framework** : NestJS 11
- **Base de données** : PostgreSQL (via Prisma 7, adapter `pg`)
- **Cache / queues** : Redis (cache-manager + ioredis), BullMQ si besoin asynchrone réel
- **Langage** : TypeScript strict (`strict: true` dans tsconfig)
- **Validation** : class-validator + class-transformer (`ValidationPipe` global)

---

## 1. TypeScript — règles strictes

- Zéro `any` — utiliser `unknown` si le type est incertain, puis le narrower
- Zéro `as Type` sans guard explicite
- Toutes les fonctions ont un type de retour explicite
- Pas de `!` (non-null assertion) sans commentaire justifiant pourquoi
- Utiliser `readonly` sur les propriétés qui ne doivent pas être mutées
- Préférer `type` pour les unions/intersections, `interface` pour les objets extensibles

---

## 2. Architecture NestJS

- **Un module par domaine** dans `src/modules/<domaine>/` — pas de logique métier dans les controllers
- **Controllers** : uniquement réception de la requête + appel service + retour réponse
- **Services** : toute la logique métier **et les requêtes base de données** (via `PrismaService` injecté)
- **DTOs obligatoires** sur tous les endpoints (class-validator + class-transformer)
- **Guards** pour l'authentification/autorisation, **Interceptors** pour la transformation de réponse
- Le transverse va dans `src/common/` (filters, interceptors, decorators, guards, pipes, cache, redis, utils)

```
src/modules/<domaine>/
├── <domaine>.module.ts
├── <domaine>.controller.ts   ← routing only
├── <domaine>.service.ts      ← business logic + DB queries (PrismaService)
├── dto/
│   ├── create-<domaine>.dto.ts
│   └── <domaine>-response.dto.ts
└── tests/
    └── <domaine>.service.spec.ts
```

---

## 3. Sécurité

- Zéro secret hardcodé ; `.env.example` à jour (sans valeurs réelles)
- Toute variable d'env **fatale si absente** est ajoutée à `src/config/required-env.ts`
- `ValidationPipe` global avec `whitelist: true` et `forbidNonWhitelisted: true`
- Prisma uniquement : jamais `$queryRawUnsafe()` ; `$queryRaw` en template literal si SQL brut
- Pas de `update()`/`delete()` sans `where` explicite
- Mots de passe (si auth) : bcrypt, jamais loggés ni renvoyés

---

## 4. Gestion des erreurs

- Utiliser les **exceptions NestJS** (`BadRequestException`, `NotFoundException`, `ConflictException`…)
- Les erreurs métier portent un **code explicite** (ex. `RESOURCE_NOT_FOUND`), jamais un message interne
- `HttpExceptionFilter` global : format `{ statusCode, message, error }`, erreurs Prisma
  connues traduites (P2002 → 409, P2003 → 400, P2025 → 404), 500 générique sinon

---

## 5. Base de données & Prisma

- Chaque modèle a `createdAt` et `updatedAt` (`@default(now())` et `@updatedAt`)
- Migrations : `prisma migrate dev` (dev) et `prisma migrate deploy` (prod) — jamais de `db push` en prod
- `@@index([field])` sur les colonnes filtrées fréquemment ; relations explicites (`@relation`)
- `select`/`omit` pour ne renvoyer que le nécessaire ; `prisma.$transaction` pour les écritures multi-tables
- Pas de requête N+1 : `include`/`select` imbriqués plutôt que des boucles d'appels DB

---

## 6. Cache (Redis) — opt-in

- Passer par `CacheService.getOrSet(cacheKey(...), loader, ttl)` **uniquement** sur des lectures
  fréquentes et peu modifiées. Pas de cache aveugle.
- Toute écriture d'une ressource cachée appelle `CacheService.del(...)` sur les clés concernées.

## 7. Traitement asynchrone (BullMQ)

- Redis est disponible dès le départ ; une queue BullMQ n'est créée que si un besoin réel
  le justifie (traitement lourd, retry, tâche qui ne doit pas bloquer la requête HTTP).

---

## 8. Logging

- `private readonly logger = new Logger(ServiceName.name)` — jamais de `console.log`
- Jamais logger : mots de passe, tokens, données personnelles

---

## 9. Tests

- Chaque service a ses tests unitaires (Jest), dépendances mockées (`PrismaService`, `CacheService`…)
- E2E dans `test/` contre la vraie infra (`make infra`)

---

## 10. Documentation API (Swagger)

- Chaque endpoint : `@ApiOperation` + réponse de succès typée (`*ResponseDto`) + chaque erreur
  possible (helpers de `src/common/swagger/api-error-responses.ts`)
- Jamais renvoyer un modèle Prisma brut ; toujours un `*ResponseDto` annoté
