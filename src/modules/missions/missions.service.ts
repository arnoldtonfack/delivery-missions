import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MissionStatus, Prisma, Role } from '../../../generated/prisma/client';
import {
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from '../../common/utils/business-date.util';
import { PrismaService } from '../../database/prisma.service';
import { DriversService } from '../drivers/drivers.service';
import type { CreateMissionDto } from './dto/create-mission.dto';
import type { DeliverMissionDto } from './dto/deliver-mission.dto';
import type { FailMissionDto } from './dto/fail-mission.dto';
import type { ListMissionsQueryDto } from './dto/list-missions-query.dto';
import type { MissionDetailResponseDto } from './dto/mission-detail-response.dto';
import type { MissionResponseDto } from './dto/mission-response.dto';
import type { UpdateMissionDto } from './dto/update-mission.dto';
import { type TMissionViewer, visibleBy } from './mission-access';
import { canTransition } from './mission-status.machine';
import {
  MISSION_DETAIL_SELECT,
  MISSION_RESPONSE_SELECT,
  toMissionDetailResponse,
  toMissionResponse,
} from './mission.mapper';

/**
 * Missions de livraison. Le contrôle de PROPRIÉTÉ (un chauffeur ne voit et ne
 * modifie que ses missions) est fait ici, pas seulement par les rôles.
 */
@Injectable()
export class MissionsService {
  private readonly logger = new Logger(MissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driversService: DriversService,
  ) {}

  /**
   * Crée une mission PLANNED et sa première entrée d'historique (`null → PLANNED`,
   * auteur = le dispatcher), dans la même transaction que le verrou du chauffeur.
   */
  async create(
    dto: CreateMissionDto,
    dispatcherId: string,
  ): Promise<MissionResponseDto> {
    assertNotInPast(dto.plannedDate);
    try {
      const mission = await this.prisma.$transaction(async (tx) => {
        await this.assertAssignableDriver(tx, dto.driverId);
        return tx.mission.create({
          data: {
            reference: dto.reference,
            customerName: dto.customerName,
            pickupAddress: dto.pickupAddress,
            deliveryAddress: dto.deliveryAddress,
            plannedDate: dateOnlyToDate(dto.plannedDate),
            driverId: dto.driverId,
            createdById: dispatcherId,
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: MissionStatus.PLANNED,
                actorId: dispatcherId,
              },
            },
          },
          select: MISSION_RESPONSE_SELECT,
        });
      });
      this.logger.log(`Mission créée (${mission.id})`);
      return toMissionResponse(mission);
    } catch (error) {
      throw toReferenceConflict(error);
    }
  }

  /**
   * Modifie et/ou réassigne une mission, uniquement tant qu'elle est PLANNED.
   *
   * L'état de la mission est vérifié AVANT le contenu du corps : une mission
   * inexistante répond 404 et une mission démarrée 409, quel que soit le corps.
   * L'écriture reste conditionnée par le statut dans son `where` : si le
   * chauffeur démarre la mission entre la lecture et l'écriture, rien n'est
   * modifié (→ 409). Pas d'entrée d'historique : le statut ne change pas.
   */
  async update(id: string, dto: UpdateMissionDto): Promise<MissionResponseDto> {
    try {
      const mission = await this.prisma.$transaction(async (tx) => {
        const current = await tx.mission.findUnique({
          where: { id },
          select: MISSION_RESPONSE_SELECT,
        });
        if (!current) {
          throw new NotFoundException('MISSION_NOT_FOUND');
        }
        if (current.status !== MissionStatus.PLANNED) {
          throw new ConflictException('MISSION_NOT_EDITABLE');
        }
        // Corps vide : rien à écrire, `version` et `updatedAt` restent intacts.
        if (Object.values(dto).every((value) => value === undefined)) {
          return current;
        }
        // Date EFFECTIVE : une mission déjà en retard ne peut pas être modifiée
        // ni réassignée sans être replanifiée, sinon elle resterait invisible
        // dans les missions du jour du chauffeur.
        assertNotInPast(dto.plannedDate ?? dateToDateOnly(current.plannedDate));
        if (dto.driverId !== undefined) {
          await this.assertAssignableDriver(tx, dto.driverId);
        }
        try {
          return await tx.mission.update({
            where: { id, status: MissionStatus.PLANNED },
            data: {
              reference: dto.reference,
              customerName: dto.customerName,
              pickupAddress: dto.pickupAddress,
              deliveryAddress: dto.deliveryAddress,
              ...(dto.plannedDate !== undefined && {
                plannedDate: dateOnlyToDate(dto.plannedDate),
              }),
              driverId: dto.driverId,
              version: { increment: 1 },
            },
            select: MISSION_RESPONSE_SELECT,
          });
        } catch (error) {
          // P2025 : plus PLANNED depuis la lecture (démarrage concurrent).
          throw isPrismaError(error, 'P2025')
            ? new ConflictException('MISSION_NOT_EDITABLE')
            : error;
        }
      });
      this.logger.log(`Mission modifiée (${id})`);
      return toMissionResponse(mission);
    } catch (error) {
      throw toReferenceConflict(error);
    }
  }

  /**
   * Liste filtrée d'un jour (aujourd'hui par défaut). Pour un chauffeur, la portée
   * `visibleBy` est appliquée EN DERNIER : elle écrase tout `driverId` envoyé.
   * Sans historique (pas de N+1) : il est dans le détail.
   */
  async findAll(
    query: ListMissionsQueryDto,
    viewer: TMissionViewer,
  ): Promise<MissionResponseDto[]> {
    const missions = await this.prisma.mission.findMany({
      where: {
        plannedDate: dateOnlyToDate(query.date ?? businessToday()),
        ...(query.driverId !== undefined && { driverId: query.driverId }),
        ...(query.status !== undefined && { status: query.status }),
        ...visibleBy(viewer),
      },
      select: MISSION_RESPONSE_SELECT,
      orderBy: [{ createdAt: 'asc' }, { reference: 'asc' }],
    });
    return missions.map(toMissionResponse);
  }

  /**
   * Détail + historique. Mission d'un autre chauffeur → 404 (pas 403) : ne pas
   * révéler qu'elle existe.
   */
  async findOne(
    id: string,
    viewer: TMissionViewer,
  ): Promise<MissionDetailResponseDto> {
    const mission = await this.prisma.mission.findFirst({
      where: { id, ...visibleBy(viewer) },
      select: MISSION_DETAIL_SELECT,
    });
    if (!mission) {
      throw new NotFoundException('MISSION_NOT_FOUND');
    }
    return toMissionDetailResponse(mission);
  }

  /** Le chauffeur assigné prend la route : PLANNED → STARTED. */
  start(id: string, actor: TMissionViewer): Promise<MissionResponseDto> {
    return this.transition(id, actor, MissionStatus.STARTED, null);
  }

  /** STARTED → DELIVERED ; commentaire optionnel (vide après trim = aucun). */
  deliver(
    id: string,
    dto: DeliverMissionDto,
    actor: TMissionViewer,
  ): Promise<MissionResponseDto> {
    const comment = dto.comment?.trim() || null;
    return this.transition(id, actor, MissionStatus.DELIVERED, comment);
  }

  /**
   * STARTED → FAILED ; raison obligatoire. Le DTO la refuse déjà si vide après
   * trim : ce contrôle protège un appel direct du service, avant toute requête.
   */
  async fail(
    id: string,
    dto: FailMissionDto,
    actor: TMissionViewer,
  ): Promise<MissionResponseDto> {
    const reason = dto.reason.trim();
    if (reason.length === 0) {
      throw new BadRequestException('FAILURE_REASON_REQUIRED');
    }
    return this.transition(id, actor, MissionStatus.FAILED, reason);
  }

  /**
   * Mécanique commune des changements de statut.
   *
   * 1. Seul le chauffeur ASSIGNÉ agit : un dispatcher est refusé (403) ici aussi,
   *    pas seulement par `@Roles()` ; un autre chauffeur ne trouve pas la
   *    mission (404, portée `visibleBy` dans la requête).
   * 2. La transition doit être autorisée par la machine à états, sinon 409
   *    `INVALID_STATUS_TRANSITION` (double clic : la 2e requête lit déjà le
   *    nouveau statut).
   * 3. Statut + horodatage serveur + historique dans UNE transaction. L'écriture
   *    est conditionnée par la version ET le statut lus : si une autre requête a
   *    écrit entre la lecture et l'écriture, 0 ligne → 409 `MISSION_CONFLICT`,
   *    et rien n'est historisé.
   *
   * `note` (commentaire de livraison ou raison d'échec) est rangée dans la
   * colonne de son statut ET dans l'historique. Jamais loggée.
   */
  private async transition(
    id: string,
    actor: TMissionViewer,
    to: MissionStatus,
    note: string | null,
  ): Promise<MissionResponseDto> {
    if (actor.role !== Role.DRIVER) {
      throw new ForbiddenException('INSUFFICIENT_ROLE');
    }
    const mission = await this.prisma.$transaction(async (tx) => {
      const current = await tx.mission.findFirst({
        where: { id, ...visibleBy(actor) },
        select: { status: true, version: true },
      });
      if (!current) {
        throw new NotFoundException('MISSION_NOT_FOUND');
      }
      if (!canTransition(current.status, to)) {
        throw new ConflictException('INVALID_STATUS_TRANSITION');
      }

      const now = new Date();
      const { count } = await tx.mission.updateMany({
        where: { id, version: current.version, status: current.status },
        data: {
          status: to,
          version: { increment: 1 },
          ...transitionFields(to, now, note),
        },
      });
      if (count === 0) {
        throw new ConflictException('MISSION_CONFLICT');
      }

      await tx.missionStatusHistory.create({
        data: {
          missionId: id,
          fromStatus: current.status,
          toStatus: to,
          note,
          actorId: actor.id,
          createdAt: now,
        },
      });
      return tx.mission.findUniqueOrThrow({
        where: { id },
        select: MISSION_RESPONSE_SELECT,
      });
    });
    this.logger.log(`Mission ${id} : ${to}`);
    return toMissionResponse(mission);
  }

  /**
   * Le chauffeur doit exister et être actif. Sa ligne reste verrouillée jusqu'à
   * la fin de `tx` : il ne peut pas être désactivé entre ce contrôle et l'écriture.
   */
  private async assertAssignableDriver(
    tx: Prisma.TransactionClient,
    driverId: string,
  ): Promise<void> {
    const driver = await this.driversService.lockDriver(tx, driverId);
    if (!driver) {
      throw new BadRequestException('DRIVER_NOT_FOUND');
    }
    if (!driver.isActive) {
      throw new BadRequestException('DRIVER_INACTIVE');
    }
  }
}

/** Une mission se planifie aujourd'hui ou plus tard (fuseau métier). */
const assertNotInPast = (plannedDate: string): void => {
  // Comparaison lexicographique valide : les deux sont au format YYYY-MM-DD.
  if (plannedDate < businessToday()) {
    throw new BadRequestException('PLANNED_DATE_IN_PAST');
  }
};

/**
 * Colonnes propres au statut d'arrivée, cohérentes avec les contraintes CHECK :
 * `startedAt` dès STARTED, `completedAt` sur un statut terminal, la note dans
 * la colonne de son statut (commentaire de livraison ou raison d'échec).
 */
const transitionFields = (
  to: MissionStatus,
  now: Date,
  note: string | null,
): Prisma.MissionUpdateManyMutationInput => {
  switch (to) {
    case MissionStatus.STARTED:
      return { startedAt: now };
    case MissionStatus.DELIVERED:
      return { completedAt: now, deliveryComment: note };
    case MissionStatus.FAILED:
      return { completedAt: now, failureReason: note };
    case MissionStatus.PLANNED:
      return {};
  }
};

/**
 * Seule contrainte d'unicité de Mission hors clé primaire : la référence. Pas
 * de lecture préalable : la contrainte en base tranche aussi entre deux
 * écritures concurrentes. Toute autre erreur est rendue telle quelle.
 */
const toReferenceConflict = (error: unknown): unknown =>
  isPrismaError(error, 'P2002')
    ? new ConflictException('MISSION_REFERENCE_ALREADY_USED')
    : error;

const isPrismaError = (error: unknown, code: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
