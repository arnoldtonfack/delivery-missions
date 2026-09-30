import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { MissionStatus, Prisma } from '../../../generated/prisma/client';
import {
  businessToday,
  dateOnlyToDate,
} from '../../common/utils/business-date.util';
import { PrismaService } from '../../database/prisma.service';
import { lockDriver } from '../drivers/driver-lock';
import type { CreateMissionDto } from './dto/create-mission.dto';
import type { MissionResponseDto } from './dto/mission-response.dto';
import { MISSION_RESPONSE_SELECT, toMissionResponse } from './mission.mapper';

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
    // Comparaison lexicographique valide : les deux sont au format YYYY-MM-DD.
    if (dto.plannedDate < businessToday()) {
      throw new BadRequestException('PLANNED_DATE_IN_PAST');
    }
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
      // Seule contrainte d'unicité de Mission hors clé primaire : la référence.
      // Pas de lecture préalable : la contrainte en base tranche aussi entre
      // deux créations concurrentes.
      if (isUniqueViolation(error)) {
        throw new ConflictException('MISSION_REFERENCE_ALREADY_USED');
      }
      throw error;
    }
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

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
