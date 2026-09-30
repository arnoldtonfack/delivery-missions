# AGENTS.md

Règles communes à tous les agents (Claude Code, Codex) qui travaillent sur ce repo.

## Contexte

Épreuve pratique CAMTRACK (8 h, notée /100) — **Thème 3 : gestion des missions de livraison**.
Priorité : les fonctionnalités obligatoires qui **marchent** (le jury installe via le README ;
une fonctionnalité non fonctionnelle vaut 0 même si le code existe). Les bonus ne comptent
que si tout l'obligatoire marche.

- Rôles : `DISPATCHER` (gère chauffeurs et missions) et `DRIVER` (ne voit que SES missions,
  met à jour leur statut).
- Workflow imposé côté serveur : `PLANNED → STARTED → DELIVERED | FAILED` (raison obligatoire
  si `FAILED`). Toute autre transition est refusée par l'API.
- Chaque changement de statut est historisé (qui, quand).
- Le jury regarde en particulier : machine à états côté serveur, contrôle d'accès (un
  chauffeur ne voit/modifie jamais la mission d'un autre), simplicité des écrans chauffeur.

## Stack

- Ce dépôt = **l'API uniquement** (code à la racine). Le front est construit ensuite, une
  fois l'API terminée et testée.
- **API** : NestJS 11 (Express), TypeScript strict, Prisma 7 (adapter `pg`), PostgreSQL.
  Auth JWT (`@nestjs/jwt` **v11** : la v12 est ESM-only, incompatible avec notre build
  CommonJS/Jest) + bcrypt via `bcryptjs` (pur JS, pas de module natif dans l'image Alpine).
- **Redis** : présent (health check, BullMQ prêt) mais **aucune donnée métier** et jamais sur
  le chemin des fonctionnalités obligatoires. Seul usage prévu : le bonus « notification au
  chauffeur à l'assignation ». Ne PAS cacher le dashboard (invalidation risquée, GROUP BY
  indexé déjà rapide).
- Gestionnaire de paquets : **pnpm** uniquement (pas de npm/yarn pour installer).
- Validation des entrées : class-validator + class-transformer, `ValidationPipe` global
  (`whitelist`, `forbidNonWhitelisted`). DTO obligatoire sur chaque endpoint.

## Organisation du code

- Modules métier dans `src/modules/<domaine>/` : `<domaine>.module.ts`,
  `<domaine>.controller.ts` (routing uniquement), `<domaine>.service.ts` (logique métier +
  requêtes Prisma), `dto/`, `tests/`.
- Transverse dans `src/common/` (filters, interceptors, decorators, guards, swagger…).
- Schéma : `prisma/schema.prisma` ; migrations dans `src/database/migrations/`
  (`pnpm prisma:migrate --name <nom>`) ; seed idempotent dans `scripts/seed.ts`.
- Erreurs : exceptions NestJS avec un **code métier** en message (`MISSION_NOT_FOUND`,
  `INVALID_STATUS_TRANSITION`…), jamais un message interne.
- Swagger sur chaque endpoint : `@ApiOperation`, `*ResponseDto` typé, erreurs via
  `common/swagger/api-error-responses.ts`. Jamais de modèle Prisma brut ni de hash renvoyé.
- Le détail des standards backend est dans `CLAUDE.md` ; suivre le style du module voisin
  le plus proche plutôt qu'inventer une nouvelle structure.

## Style

- Prettier : guillemets simples, virgules finales (`pnpm format`).
- Lint : `pnpm lint` ; types : `pnpm typecheck`.
- Zéro `any`, types de retour explicites, `Logger` NestJS (jamais `console.log`).

## Tests

- Unitaires (Jest) : `src/modules/<domaine>/tests/*.spec.ts`, dépendances mockées,
  `pnpm test`. Minimum exigé par l'épreuve : 3 ; cibler en priorité la machine à états,
  le contrôle d'accès et l'authentification.
- E2E : `test/**/*.e2e-spec.ts`, `pnpm test:e2e`, contre la vraie infra (`make infra`).
- Toute nouvelle fonctionnalité ou correction s'accompagne d'un test qui la couvre.

## Git

- Branche : `main`. Commits **réguliers** et atomiques (le jury pénalise un commit unique
  en fin d'épreuve) : un commit par étape fonctionnelle qui compile.
- Commits en français, format Conventional Commits avec scope : `feat(missions): …`,
  `fix(auth): …`, `test(missions): …`.
- **Aucune mention d'assistance IA** dans les commits (pas de trailer `Co-Authored-By`,
  pas de « Generated with … »). L'usage de l'IA est déclaré **uniquement dans le README**,
  section dédiée — c'est une exigence du règlement de l'épreuve.
- Ne jamais committer de secrets (`.env*` sauf `.env.example`, jetons, mots de passe).

## État et décisions (passage de relais entre sessions)

Sujet original (captures) : `/home/lavega/Téléchargements/sujet/`. Ne pas stocker de travail
dans le scratchpad `/tmp/...` : il a déjà été vidé en cours de session.

### Fait (committé et poussé sur `origin/main`)

1. Socle renommé `delivery-missions` ; `docker-compose.yml` (dev, projet `delivery-missions`)
   et `docker-compose.prod.yml` (serveur partagé : seule l'API publiée, projet
   `delivery-missions-demo`).
2. Modèle : `User` (email unique, `passwordHash`, `fullName`, `role`, `isActive`),
   `Mission` (`reference` unique, `customerName`, `pickupAddress`, `deliveryAddress`,
   `plannedDate` DATE, `status`, `failureReason?`, `deliveryComment?`, `startedAt?`,
   `completedAt?`, `version`, `driverId`, `createdById`), `MissionStatusHistory`
   (`fromStatus?`, `toStatus`, `note?`, `actorId`, `createdAt`). Contraintes CHECK écrites à la
   main dans la migration initiale (raison non vide si FAILED ; `startedAt`/`completedAt`
   cohérents avec le statut ; `version >= 0`). Index : `(driverId, plannedDate, status)`,
   `(plannedDate, status)`, `(missionId, createdAt)`.
3. Auth (`src/modules/auth`) : `POST /auth/login` (**email** + mot de passe), `GET /auth/me`.
   `JwtAuthGuard` global (`@Public()` pour les exceptions) qui **relit l'utilisateur en base**
   à chaque requête (compte désactivé → 401 `ACCOUNT_DISABLED`). `RolesGuard` global +
   `@Roles()`, `@CurrentUser()`. Codes : `INVALID_CREDENTIALS` (même réponse et même temps
   pour e-mail inconnu), `ACCOUNT_DISABLED` (403 au login), `INSUFFICIENT_ROLE`,
   `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_INVALID`. Login limité à 10/min ; throttling désactivé
   sous `NODE_ENV=test`.
4. Chauffeurs (`src/modules/drivers`, DISPATCHER uniquement) : `POST /drivers`,
   `GET /drivers?isActive=`, `GET /drivers/:id`, `PATCH /drivers/:id`,
   `PATCH /drivers/:id/status`. Désactivation (jamais de suppression) refusée si missions
   PLANNED/STARTED (`DRIVER_HAS_OPEN_MISSIONS`), sous verrou `SELECT … FOR UPDATE` sur la
   ligne du chauffeur. Mot de passe 8 car. min, **72 octets max** (`@IsByteLength`, limite
   bcrypt). DTO de mise à jour : `PartialType(..., { skipNullProperties: false })`.
5. Transverse : `@NormalizeEmail()`, `@ApiDataResponse()` (Swagger de l'enveloppe réelle
   `{ success, data, timestamp }`), `unauthorizedResponse`/`forbiddenResponse`,
   `test/utils/create-e2e-app.ts` (+ `apiPath()`). Tests : 115 unitaires, 74 e2e.
   Réutiliser `USER_RESPONSE_SELECT` / `toUserResponse` (`src/modules/users/user.mapper.ts`).
6. Missions : `POST /missions` (DISPATCHER), `GET /missions?date&driverId&status`
   (un jour, aujourd'hui par défaut, sans historique), `GET /missions/:id` (détail +
   historique ; portée `visibleBy(viewer)` dans le `where`, à réutiliser pour la liste et
   les transitions → 404 `MISSION_NOT_FOUND` hors portée). Verrou chauffeur partagé
   `DriversService.lockDriver(tx, id)` (MissionsModule importe DriversModule), dates métier
   `src/common/utils/business-date.util.ts` (`businessToday()`, `YYYY-MM-DD` ↔ `@db.Date`),
   `@Trim()`, `MISSION_RESPONSE_SELECT` / `toMissionResponse`. Codes : `DRIVER_NOT_FOUND` et
   `DRIVER_INACTIVE` (400, chauffeur du corps), `PLANNED_DATE_IN_PAST` (400),
   `MISSION_REFERENCE_ALREADY_USED` (409, via P2002). `PATCH /missions/:id` (DISPATCHER) :
   état vérifié AVANT le corps (404 puis 409 `MISSION_NOT_EDITABLE`), corps vide = aucune
   écriture, puis `update where { id, status: PLANNED }` + `version` incrémentée (P2025 →
   409) ; réassignation sous `lockDriver()` du nouveau chauffeur ; pas d'entrée
   d'historique (le statut ne change pas). Chaque endpoint missions a une
   `description` Swagger avec ses règles métier.
7. Transitions (DRIVER assigné uniquement) : `POST /missions/:id/start`, `/deliver`
   (`comment?`, vide après trim = null), `/fail` (`reason` obligatoire, 400 si vide).
   Machine à états seule source des transitions : `mission-status.machine.ts`
   (`canTransition`). Mécanique commune `MissionsService.transition()` : 403 dispatcher
   (aussi dans le service), 404 hors portée, 409 `INVALID_STATUS_TRANSITION`, puis
   `updateMany where { id, version, status }` (0 ligne → 409 `MISSION_CONFLICT`) +
   historique (note = commentaire/raison) dans la même transaction, même horodatage
   serveur pour `startedAt`/`completedAt` et l'entrée d'historique.

### À faire, dans cet ordre (une micro-étape = code + tests + typecheck/lint/test/e2e/build + commit + push)

API terminée : dashboard (`GET /dashboard?date`, module `src/modules/dashboard`), seed
idempotent (`scripts/seed.ts`, `make seed-docker`, comptes `*@livraison.test` /
`Demo1234!`, missions `DEMO-…` recréées à chaque lancement) et README jury (installation
vérifiée sur clone neuf + volume vierge). Tests : 115 unitaires, 74 e2e.

1. **Front** (dépôt séparé `delivery-missions-web`, autre session ; Codex pour le style) :
   écrans chauffeur mobile-first. Côté API : corriger ce que le front révèle.
2. Fin d'épreuve : rendre le dépôt API public ou inviter le jury (demander avant).

### Décisions métier à appliquer (hypothèses à reprendre dans le README)

- « Aujourd'hui » = date dans le fuseau **`Africa/Douala`**, calculée côté serveur (jamais
  l'horloge du navigateur). Liste sans filtre de date = missions du jour, **pour le
  chauffeur comme pour le dispatcher** (liste bornée sans pagination ; le dispatcher
  choisit un autre jour avec `date`).
- Un chauffeur ne voit que SES missions, quel que soit le filtre envoyé (filtre `driverId`
  forcé côté serveur). Mission d'un autre chauffeur → **404 `MISSION_NOT_FOUND`** (pas 403 :
  ne pas révéler son existence). Même règle pour le détail, l'historique et les actions.
- Création et réassignation : le chauffeur doit être un `DRIVER` **actif**, vérifié sous le
  même verrou `SELECT … FOR UPDATE` que la désactivation. Référence normalisée (trim +
  majuscules), unique (`MISSION_REFERENCE_ALREADY_USED`).
- La création écrit une entrée d'historique `null → PLANNED` (acteur = dispatcher).
- Date prévue au format `YYYY-MM-DD`, **aujourd'hui ou plus tard** (fuseau Douala) à la
  création et à la modification (date **effective** : une mission PLANNED déjà en retard
  doit être replanifiée pour être modifiée ou réassignée) : une mission PLANNED dans le
  passé n'apparaîtrait jamais dans « les missions du jour » du chauffeur.
- Modification / réassignation par le dispatcher **uniquement si PLANNED** (sinon 409).
  `DELIVERED` et `FAILED` sont terminaux ; une nouvelle tentative = une nouvelle mission.
- Seul le **chauffeur assigné** fait les transitions. Statut + horodatage + historique dans
  **une transaction**, écriture conditionnée par `version` (`updateMany where { id, version,
  status }` → 0 ligne = 409 `MISSION_CONFLICT`) pour les doubles clics et la concurrence.
- `FAILED` : raison obligatoire, non vide après trim. `DELIVERED` : commentaire optionnel,
  `completedAt` = horodatage serveur.
- Dashboard : missions **prévues aujourd'hui**, par statut actuel ; toutes pour le
  dispatcher, uniquement les siennes pour un chauffeur.

### Rappels

- Dépôt GitHub **privé** (`arnoldtonfack/delivery-missions`) : le rendre public ou inviter
  le jury à la fin — demander à l'utilisateur avant.
- Pousser après chaque commit (le jury juge la régularité).
- Montrer à l'utilisateur ce qui est fait à chaque micro-étape ; il fait relire le code par
  Codex (ChatGPT) en lecture seule, les retours vérifiés sont corrigés par l'auteur.

## Collaboration entre agents

- Un seul agent modifie une zone de code donnée à la fois. Pour travailler en parallèle,
  chaque agent a son propre `git worktree`.
- L'agent relecteur ne modifie pas le code : il signale les problèmes (fichier:ligne +
  scénario concret), l'agent auteur corrige.
- En cas de désaccord entre agents, c'est l'humain qui tranche.
