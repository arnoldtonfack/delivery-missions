import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MissionStatus, Role } from '../../../generated/prisma/client';
import { hashPassword } from '../../common/crypto/password.util';
import { PrismaService } from '../../database/prisma.service';
import type { UserResponseDto } from '../users/dto/user-response.dto';
import { toUserResponse, USER_RESPONSE_SELECT } from '../users/user.mapper';
import type { CreateDriverDto } from './dto/create-driver.dto';
import type { ListDriversQueryDto } from './dto/list-drivers-query.dto';
import type { UpdateDriverDto } from './dto/update-driver.dto';

/** Statuts qui empêchent de désactiver un chauffeur (mission à faire ou en cours). */
const OPEN_MISSION_STATUSES: readonly MissionStatus[] = [
  MissionStatus.PLANNED,
  MissionStatus.STARTED,
];

/**
 * Gestion des chauffeurs (utilisateurs de rôle DRIVER) par le dispatcher.
 * Un chauffeur n'est jamais supprimé : il est désactivé, ce qui conserve ses
 * missions et l'historique des statuts dont il est l'auteur.
 */
@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDriverDto): Promise<UserResponseDto> {
    await this.assertEmailAvailable(dto.email);
    const driver = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: Role.DRIVER,
        passwordHash: await hashPassword(dto.password),
      },
      select: USER_RESPONSE_SELECT,
    });
    this.logger.log(`Chauffeur créé (${driver.id})`);
    return toUserResponse(driver);
  }

  async findAll(query: ListDriversQueryDto): Promise<UserResponseDto[]> {
    const drivers = await this.prisma.user.findMany({
      where: {
        role: Role.DRIVER,
        ...(query.isActive !== undefined && { isActive: query.isActive }),
      },
      select: USER_RESPONSE_SELECT,
      orderBy: { fullName: 'asc' },
    });
    return drivers.map(toUserResponse);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const driver = await this.prisma.user.findFirst({
      where: { id, role: Role.DRIVER },
      select: USER_RESPONSE_SELECT,
    });
    if (!driver) {
      throw new NotFoundException('DRIVER_NOT_FOUND');
    }
    return toUserResponse(driver);
  }

  async update(id: string, dto: UpdateDriverDto): Promise<UserResponseDto> {
    await this.findOne(id);
    if (dto.email !== undefined) {
      await this.assertEmailAvailable(dto.email, id);
    }
    const driver = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        email: dto.email,
        ...(dto.password !== undefined && {
          passwordHash: await hashPassword(dto.password),
        }),
      },
      select: USER_RESPONSE_SELECT,
    });
    this.logger.log(`Chauffeur modifié (${id})`);
    return toUserResponse(driver);
  }

  /**
   * Active / désactive un chauffeur. Refusé s'il a encore des missions PLANNED
   * ou STARTED : il faut d'abord les réassigner ou les terminer, sinon elles
   * resteraient bloquées sans personne pour les faire avancer.
   */
  async setActive(id: string, isActive: boolean): Promise<UserResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      // Verrou de ligne sur le chauffeur jusqu'à la fin de la transaction : une
      // affectation de mission concurrente (qui prend le même verrou) attend, et
      // ne peut donc pas se glisser entre le comptage et la désactivation.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "User"
        WHERE "id" = ${id}::uuid AND "role" = 'DRIVER'
        FOR UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundException('DRIVER_NOT_FOUND');
      }
      if (!isActive) {
        const openMissions = await tx.mission.count({
          where: { driverId: id, status: { in: [...OPEN_MISSION_STATUSES] } },
        });
        if (openMissions > 0) {
          throw new ConflictException('DRIVER_HAS_OPEN_MISSIONS');
        }
      }
      const updated = await tx.user.update({
        where: { id },
        data: { isActive },
        select: USER_RESPONSE_SELECT,
      });
      this.logger.log(`Chauffeur ${isActive ? 'activé' : 'désactivé'} (${id})`);
      return toUserResponse(updated);
    });
  }

  /**
   * Code métier explicite plutôt que le 409 générique du filtre Prisma. La
   * contrainte d'unicité en base reste le filet en cas de création concurrente.
   */
  private async assertEmailAvailable(
    email: string,
    exceptUserId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing && existing.id !== exceptUserId) {
      throw new ConflictException('EMAIL_ALREADY_USED');
    }
  }
}
