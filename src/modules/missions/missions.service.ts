import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MissionStatus, Prisma, Role } from '../../../generated/prisma/client';
import type { IAuthenticatedUser } from '../../common/guards/authenticated-request';
import {
  businessToday,
  dateOnlyToDate,
} from '../../common/utils/business-date.util';
import { PrismaService } from '../../database/prisma.service';
import { lockDriver } from '../drivers/driver-lock';
import type { CreateMissionDto } from './dto/create-mission.dto';
import type { ListMissionsQueryDto } from './dto/list-missions-query.dto';
import type { MissionDetailResponseDto } from './dto/mission-detail-response.dto';
import type { MissionResponseDto } from './dto/mission-response.dto';
import type { UpdateMissionDto } from './dto/update-mission.dto';
import {
  MISSION_DETAIL_SELECT,
  MISSION_RESPONSE_SELECT,
  toMissionDetailResponse,
  toMissionResponse,
} from './mission.mapper';

/** Ce dont le contrôle d'accès a besoin sur l'appelant. */
export type TMissionViewer = Pick<IAuthenticatedUser, 'id' | 'role'>;

/**
 * Missions visibles par l'appelant, à combiner dans chaque `where` : tout pour
 * le dispatcher, uniquement les siennes pour un chauffeur. Le filtre est dans la
 * REQUÊTE (pas un contrôle après lecture) : la mission d'un autre chauffeur est
 * introuvable, exactement comme une mission inexistante.
 */
const visibleBy = (viewer: TMissionViewer): Prisma.MissionWhereInput =>
  viewer.role === Role.DRIVER ? { driverId: viewer.id } : {};

/**
 * Missions de livraison. Le contrôle de PROPRIÉTÉ (un chauffeur ne voit et ne
 * modifie que ses missions) est fait ici, pas seulement par les rôles.
 */
@Injectable()
export class MissionsService {
  private readonly logger = new Logger(MissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * L'écriture est conditionnée par le statut DANS le `where` : si le chauffeur
   * démarre la mission au même instant, l'une des deux écritures attend l'autre
   * et la modification ne touche plus rien (→ 409), au lieu de changer une
   * mission déjà en route. Pas d'entrée d'historique : le statut ne change pas.
   */
  async update(id: string, dto: UpdateMissionDto): Promise<MissionResponseDto> {
    if (dto.plannedDate !== undefined) {
      assertNotInPast(dto.plannedDate);
    }
    try {
      const mission = await this.prisma.$transaction(async (tx) => {
        if (dto.driverId !== undefined) {
          await this.assertAssignableDriver(tx, dto.driverId);
        }
        const { count } = await tx.mission.updateMany({
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
        });
        if (count === 0) {
          const exists = await tx.mission.count({ where: { id } });
          throw exists
            ? new ConflictException('MISSION_NOT_EDITABLE')
            : new NotFoundException('MISSION_NOT_FOUND');
        }
        return tx.mission.findUniqueOrThrow({
          where: { id },
          select: MISSION_RESPONSE_SELECT,
        });
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

  /**
   * Le chauffeur doit exister et être actif. Sa ligne reste verrouillée jusqu'à
   * la fin de `tx` : il ne peut pas être désactivé entre ce contrôle et l'écriture.
   */
  private async assertAssignableDriver(
    tx: Prisma.TransactionClient,
    driverId: string,
  ): Promise<void> {
    const driver = await lockDriver(tx, driverId);
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
 * Seule contrainte d'unicité de Mission hors clé primaire : la référence. Pas
 * de lecture préalable : la contrainte en base tranche aussi entre deux
 * écritures concurrentes. Toute autre erreur est rendue telle quelle.
 */
const toReferenceConflict = (error: unknown): unknown =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002'
    ? new ConflictException('MISSION_REFERENCE_ALREADY_USED')
    : error;
