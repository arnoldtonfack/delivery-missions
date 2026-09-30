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

- Monorepo : `api/` (backend) et `web/` (frontend), `docker-compose.yml` à la racine.
- **API** : NestJS 11 (Express), TypeScript strict, Prisma 7 (adapter `pg`), PostgreSQL,
  Redis (cache opt-in). Auth JWT + bcrypt.
- **Web** : Next.js (App Router), TypeScript strict.
- Gestionnaire de paquets : **pnpm** uniquement (pas de npm/yarn pour installer).
- Validation des entrées : class-validator + class-transformer, `ValidationPipe` global
  (`whitelist`, `forbidNonWhitelisted`). DTO obligatoire sur chaque endpoint.

## Organisation du code (API)

- Modules métier dans `api/src/modules/<domaine>/` : `<domaine>.module.ts`,
  `<domaine>.controller.ts` (routing uniquement), `<domaine>.service.ts` (logique métier +
  requêtes Prisma), `dto/`, `tests/`.
- Transverse dans `api/src/common/` (filters, interceptors, decorators, guards, swagger…).
- Schéma : `api/prisma/schema.prisma` ; migrations dans `api/src/database/migrations/`
  (`pnpm prisma:migrate --name <nom>`) ; seed idempotent dans `api/scripts/seed.ts`.
- Erreurs : exceptions NestJS avec un **code métier** en message (`MISSION_NOT_FOUND`,
  `INVALID_STATUS_TRANSITION`…), jamais un message interne.
- Swagger sur chaque endpoint : `@ApiOperation`, `*ResponseDto` typé, erreurs via
  `common/swagger/api-error-responses.ts`. Jamais de modèle Prisma brut ni de hash renvoyé.
- Le détail des standards backend est dans `CLAUDE.md` ; suivre le style du module voisin
  le plus proche plutôt qu'inventer une nouvelle structure.

## Organisation du code (Web)

- Un seul client HTTP (`web/src/lib/api.ts`) : URL de l'API via `NEXT_PUBLIC_API_URL`,
  jeton JWT joint, erreurs `{ statusCode, message, error }` traduites en message lisible.
- Chaque écran gère explicitement : chargement, erreurs de formulaire, erreurs serveur.
- Écrans chauffeur pensés mobile (gros boutons, retour clair après chaque action).

## Style

- Prettier : guillemets simples, virgules finales (`pnpm format`).
- Lint : `pnpm lint` ; types : `pnpm typecheck`.
- Zéro `any`, types de retour explicites, `Logger` NestJS (jamais `console.log`).

## Tests

- Unitaires (Jest) : `api/src/modules/<domaine>/tests/*.spec.ts`, dépendances mockées,
  `pnpm test`. Minimum exigé par l'épreuve : 3 ; cibler en priorité la machine à états,
  le contrôle d'accès et l'authentification.
- E2E : `api/test/**/*.e2e-spec.ts`, `pnpm test:e2e`, contre la vraie infra (`make infra`).
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

## Collaboration entre agents

- Un seul agent modifie une zone de code donnée à la fois. Pour travailler en parallèle,
  chaque agent a son propre `git worktree`.
- L'agent relecteur ne modifie pas le code : il signale les problèmes (fichier:ligne +
  scénario concret), l'agent auteur corrige.
- En cas de désaccord entre agents, c'est l'humain qui tranche.
