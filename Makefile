.PHONY: help up down restart logs ps build rebuild infra \
        db-shell db-reset \
        redis-shell redis-flush \
        migrate migrate-prod migrate-reset prisma-studio prisma-generate seed

# Charge .env pour que DB_USER, REDIS_PASSWORD… soient disponibles dans les recettes.
-include .env
export

# ─── Couleurs ─────────────────────────────────────────────────────────────────
GREEN  := \033[0;32m
YELLOW := \033[0;33m
CYAN   := \033[0;36m
RESET  := \033[0m

# ─── Aide ─────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "$(CYAN)╔══════════════════════════════════════╗$(RESET)"
	@echo "$(CYAN)║     Delivery Missions — Docker       ║$(RESET)"
	@echo "$(CYAN)╚══════════════════════════════════════╝$(RESET)"
	@echo ""
	@echo "$(YELLOW)── Docker ──────────────────────────────$(RESET)"
	@echo "  $(GREEN)make infra$(RESET)           Démarrer PostgreSQL + Redis seulement (dev avec pnpm dev)"
	@echo "  $(GREEN)make up$(RESET)              Démarrer tous les services (app incluse)"
	@echo "  $(GREEN)make down$(RESET)            Arrêter tous les services"
	@echo "  $(GREEN)make restart$(RESET)         Redémarrer tous les services"
	@echo "  $(GREEN)make build$(RESET)           Builder l'image de l'app"
	@echo "  $(GREEN)make rebuild$(RESET)         Rebuild sans cache"
	@echo "  $(GREEN)make logs$(RESET)            Logs de tous les services"
	@echo "  $(GREEN)make logs s=app$(RESET)      Logs d'un service spécifique (app/postgres/redis)"
	@echo "  $(GREEN)make ps$(RESET)              État des conteneurs"
	@echo ""
	@echo "$(YELLOW)── PostgreSQL ───────────────────────────$(RESET)"
	@echo "  $(GREEN)make db-shell$(RESET)        Ouvrir un shell PostgreSQL"
	@echo "  $(GREEN)make db-reset$(RESET)        Supprimer et recréer les données"
	@echo ""
	@echo "$(YELLOW)── Redis ────────────────────────────────$(RESET)"
	@echo "  $(GREEN)make redis-shell$(RESET)     Ouvrir un shell Redis CLI"
	@echo "  $(GREEN)make redis-flush$(RESET)     Vider tout Redis"
	@echo ""
	@echo "$(YELLOW)── Prisma ───────────────────────────────$(RESET)"
	@echo "  $(GREEN)make migrate$(RESET)         Créer et appliquer une migration (dev)"
	@echo "  $(GREEN)make migrate-prod$(RESET)    Appliquer les migrations (prod)"
	@echo "  $(GREEN)make migrate-reset$(RESET)   Reset complet de la base"
	@echo "  $(GREEN)make prisma-studio$(RESET)   Ouvrir Prisma Studio"
	@echo "  $(GREEN)make prisma-generate$(RESET) Régénérer le client Prisma"
	@echo "  $(GREEN)make seed$(RESET)            Lancer le seed"
	@echo ""

# ─── Docker ───────────────────────────────────────────────────────────────────
infra:
	docker compose up -d postgres redis
	@echo "$(GREEN)✔ PostgreSQL + Redis démarrés$(RESET)"

up:
	docker compose up -d
	@echo "$(GREEN)✔ Services démarrés$(RESET)"

down:
	docker compose down
	@echo "$(GREEN)✔ Services arrêtés$(RESET)"

restart:
	docker compose restart
	@echo "$(GREEN)✔ Services redémarrés$(RESET)"

build:
	docker compose build app

rebuild:
	docker compose build --no-cache app

logs:
	docker compose logs -f $(s)

ps:
	docker compose ps

# ─── PostgreSQL ───────────────────────────────────────────────────────────────
db-shell:
	docker compose exec postgres psql -U $(DB_USER) -d $(DB_NAME)

db-reset:
	docker compose rm -sfv postgres
	docker volume rm -f $$(basename $$(pwd))_postgres_data
	docker compose up -d postgres
	@echo "$(GREEN)✔ PostgreSQL réinitialisé$(RESET)"

# ─── Redis ───────────────────────────────────────────────────────────────────
redis-shell:
	docker compose exec redis redis-cli -a $(REDIS_PASSWORD)

redis-flush:
	docker compose exec redis redis-cli -a $(REDIS_PASSWORD) FLUSHALL
	@echo "$(GREEN)✔ Redis vidé$(RESET)"

# ─── Prisma ───────────────────────────────────────────────────────────────────
migrate:
	pnpm prisma:migrate

migrate-prod:
	pnpm prisma:migrate:prod

migrate-reset:
	pnpm prisma:reset

prisma-studio:
	pnpm prisma:studio

prisma-generate:
	pnpm prisma:generate

seed:
	pnpm seed
