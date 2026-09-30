import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MissionStatus,
  type Prisma,
  PrismaClient,
  Role,
} from '../generated/prisma/client';
import { hashPassword } from '../src/common/crypto/password.util';
import {
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from '../src/common/utils/business-date.util';

/**
 * Données de démonstration : 1 dispatcher, 2 chauffeurs et des missions d'hier,
 * d'aujourd'hui et de demain dans tous les statuts, avec leur historique.
 *
 * IDEMPOTENT : les comptes sont mis à jour sur place (upsert par e-mail) ; les
 * missions de démo (référence `DEMO-…`, et elles seules) sont supprimées puis
 * recréées, datées par rapport au jour du lancement (fuseau Africa/Douala).
 * Relancer le seed remet donc la démo à zéro, sans doublon.
 *
 * Usage : `pnpm seed` (hôte) ou `make seed-docker` (conteneur).
 */
const logger = new Logger('Seed');

/** Mot de passe commun des comptes de démo, affiché dans le README. */
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_REFERENCE_PREFIX = 'DEMO-';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const USERS = {
  dispatcher: {
    email: 'dispatcher@livraison.test',
    fullName: 'Awa Nkemdirim',
    role: Role.DISPATCHER,
  },
  driver1: {
    email: 'chauffeur1@livraison.test',
    fullName: 'Jean Mbarga',
    role: Role.DRIVER,
  },
  driver2: {
    email: 'chauffeur2@livraison.test',
    fullName: 'Paul Ekambi',
    role: Role.DRIVER,
  },
} as const;

type TDriverKey = 'driver1' | 'driver2';

interface IDemoMission {
  readonly reference: string;
  /** Jour prévu par rapport à aujourd'hui : -1 hier, 0 aujourd'hui, 1 demain. */
  readonly dayOffset: number;
  readonly status: MissionStatus;
  readonly driver: TDriverKey;
  readonly customerName: string;
  readonly pickupAddress: string;
  readonly deliveryAddress: string;
  /** Commentaire de livraison (DELIVERED) ou raison d'échec (FAILED). */
  readonly note?: string;
}

const WAREHOUSE = 'Entrepôt Bonabéri, Douala';

const MISSIONS: readonly IDemoMission[] = [
  // Aujourd'hui — chauffeur 1 : un exemplaire de chaque statut.
  {
    reference: 'DEMO-001',
    dayOffset: 0,
    status: MissionStatus.PLANNED,
    driver: 'driver1',
    customerName: 'Boulangerie du Centre',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Rue Joss, Akwa, Douala',
  },
  {
    reference: 'DEMO-002',
    dayOffset: 0,
    status: MissionStatus.PLANNED,
    driver: 'driver1',
    customerName: 'Pharmacie de Bonapriso',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Rue Tokoto, Bonapriso, Douala',
  },
  {
    reference: 'DEMO-003',
    dayOffset: 0,
    status: MissionStatus.STARTED,
    driver: 'driver1',
    customerName: 'Supermarché Deido',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Boulevard de la Réunification, Deido, Douala',
  },
  {
    reference: 'DEMO-004',
    dayOffset: 0,
    status: MissionStatus.DELIVERED,
    driver: 'driver1',
    customerName: 'Quincaillerie Ndokoti',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Carrefour Ndokoti, Douala',
    note: 'Remis en main propre au gérant',
  },
  {
    reference: 'DEMO-005',
    dayOffset: 0,
    status: MissionStatus.FAILED,
    driver: 'driver1',
    customerName: 'Librairie de Bali',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Rue Gallieni, Bali, Douala',
    note: 'Client absent, boutique fermée',
  },
  // Aujourd'hui — chauffeur 2.
  {
    reference: 'DEMO-006',
    dayOffset: 0,
    status: MissionStatus.PLANNED,
    driver: 'driver2',
    customerName: 'Restaurant Le Wouri',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Boulevard de la Liberté, Akwa, Douala',
  },
  {
    reference: 'DEMO-007',
    dayOffset: 0,
    status: MissionStatus.DELIVERED,
    driver: 'driver2',
    customerName: 'Clinique de Makepe',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Makepe Missoké, Douala',
  },
  // Demain.
  {
    reference: 'DEMO-008',
    dayOffset: 1,
    status: MissionStatus.PLANNED,
    driver: 'driver1',
    customerName: 'Hôtel Akwa Palace',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Boulevard de la Liberté, Akwa, Douala',
  },
  {
    reference: 'DEMO-009',
    dayOffset: 1,
    status: MissionStatus.PLANNED,
    driver: 'driver2',
    customerName: 'École Les Lauriers',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Logpom, Douala',
  },
  // Hier.
  {
    reference: 'DEMO-010',
    dayOffset: -1,
    status: MissionStatus.DELIVERED,
    driver: 'driver2',
    customerName: 'Garage Bépanda',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'Bépanda Omnisport, Douala',
    note: 'Déposé à l’accueil',
  },
  {
    reference: 'DEMO-011',
    dayOffset: -1,
    status: MissionStatus.FAILED,
    driver: 'driver1',
    customerName: 'Imprimerie PK8',
    pickupAddress: WAREHOUSE,
    deliveryAddress: 'PK8, Douala',
    note: 'Adresse introuvable',
  },
];

/** `YYYY-MM-DD` décalé de `offset` jours (arithmétique sur minuit UTC). */
const shiftDay = (day: string, offset: number): string =>
  dateToDateOnly(new Date(dateOnlyToDate(day).getTime() + offset * DAY_MS));

/**
 * Mission + historique cohérents avec les contraintes CHECK : `startedAt` dès
 * STARTED, `completedAt` et note sur un statut terminal. Horodatages relatifs à
 * `now` : créée 3 jours avant, démarrée 3 h puis terminée 2 h avant son jour.
 */
const toCreateInput = (
  mission: IDemoMission,
  today: string,
  now: Date,
  ids: Readonly<Record<keyof typeof USERS, string>>,
): Prisma.MissionCreateInput => {
  const base = now.getTime() + Math.min(mission.dayOffset, 0) * DAY_MS;
  const createdAt = new Date(now.getTime() - 3 * DAY_MS);
  const startedAt = new Date(base - 3 * HOUR_MS);
  const completedAt = new Date(base - 2 * HOUR_MS);
  const isStarted = mission.status !== MissionStatus.PLANNED;
  const isTerminal =
    mission.status === MissionStatus.DELIVERED ||
    mission.status === MissionStatus.FAILED;
  const driverId = ids[mission.driver];
  const note = mission.note ?? null;

  const history: Prisma.MissionStatusHistoryCreateWithoutMissionInput[] = [
    {
      fromStatus: null,
      toStatus: MissionStatus.PLANNED,
      actor: { connect: { id: ids.dispatcher } },
      createdAt,
    },
  ];
  if (isStarted) {
    history.push({
      fromStatus: MissionStatus.PLANNED,
      toStatus: MissionStatus.STARTED,
      actor: { connect: { id: driverId } },
      createdAt: startedAt,
    });
  }
  if (isTerminal) {
    history.push({
      fromStatus: MissionStatus.STARTED,
      toStatus: mission.status,
      note,
      actor: { connect: { id: driverId } },
      createdAt: completedAt,
    });
  }

  return {
    reference: mission.reference,
    customerName: mission.customerName,
    pickupAddress: mission.pickupAddress,
    deliveryAddress: mission.deliveryAddress,
    plannedDate: dateOnlyToDate(shiftDay(today, mission.dayOffset)),
    status: mission.status,
    startedAt: isStarted ? startedAt : null,
    completedAt: isTerminal ? completedAt : null,
    deliveryComment: mission.status === MissionStatus.DELIVERED ? note : null,
    failureReason: mission.status === MissionStatus.FAILED ? note : null,
    // Une version par écriture de statut depuis la création.
    version: history.length - 1,
    createdAt,
    driver: { connect: { id: driverId } },
    createdBy: { connect: { id: ids.dispatcher } },
    statusHistory: { create: history },
  };
};

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });

  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const upsertUser = async (key: keyof typeof USERS): Promise<string> => {
      const user = USERS[key];
      // `update` remet le compte dans un état utilisable (actif, mot de passe connu).
      const { id } = await prisma.user.upsert({
        where: { email: user.email },
        create: { ...user, passwordHash, isActive: true },
        update: {
          fullName: user.fullName,
          role: user.role,
          passwordHash,
          isActive: true,
        },
        select: { id: true },
      });
      return id;
    };
    const ids = {
      dispatcher: await upsertUser('dispatcher'),
      driver1: await upsertUser('driver1'),
      driver2: await upsertUser('driver2'),
    };

    const today = businessToday();
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // L'historique part en cascade avec les missions.
      await tx.mission.deleteMany({
        where: { reference: { startsWith: DEMO_REFERENCE_PREFIX } },
      });
      for (const mission of MISSIONS) {
        await tx.mission.create({
          data: toCreateInput(mission, today, now, ids),
          select: { id: true },
        });
      }
    });

    logger.log(
      `Seed terminé : ${Object.keys(USERS).length} comptes, ` +
        `${MISSIONS.length} missions de démo (aujourd'hui = ${today}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
