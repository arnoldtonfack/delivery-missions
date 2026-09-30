-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DISPATCHER', 'DRIVER');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('PLANNED', 'STARTED', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "plannedDate" DATE NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'PLANNED',
    "failureReason" TEXT,
    "deliveryComment" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "driverId" UUID NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionStatusHistory" (
    "id" UUID NOT NULL,
    "fromStatus" "MissionStatus",
    "toStatus" "MissionStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "missionId" UUID NOT NULL,
    "actorId" UUID NOT NULL,

    CONSTRAINT "MissionStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Mission_reference_key" ON "Mission"("reference");

-- CreateIndex
CREATE INDEX "Mission_driverId_plannedDate_status_idx" ON "Mission"("driverId", "plannedDate", "status");

-- CreateIndex
CREATE INDEX "Mission_plannedDate_status_idx" ON "Mission"("plannedDate", "status");

-- CreateIndex
CREATE INDEX "MissionStatusHistory_missionId_createdAt_idx" ON "MissionStatusHistory"("missionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionStatusHistory" ADD CONSTRAINT "MissionStatusHistory_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionStatusHistory" ADD CONSTRAINT "MissionStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Contraintes métier (ajoutées à la main : non exprimables dans le schéma Prisma) ───
-- Dernier rempart si une écriture contournait l'API : la base refuse un état incohérent.

-- FAILED exige une raison non vide.
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_failed_requires_reason_check"
  CHECK ("status" <> 'FAILED' OR length(btrim(coalesce("failureReason", ''))) > 0);

-- Une mission terminée (DELIVERED/FAILED) porte son horodatage de fin, et elle seule.
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_completed_at_matches_status_check"
  CHECK (("status" IN ('DELIVERED', 'FAILED')) = ("completedAt" IS NOT NULL));

-- Une mission démarrée (ou terminée) porte son horodatage de démarrage.
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_started_at_matches_status_check"
  CHECK (("status" = 'PLANNED') = ("startedAt" IS NULL));

ALTER TABLE "Mission" ADD CONSTRAINT "Mission_version_non_negative_check"
  CHECK ("version" >= 0);
