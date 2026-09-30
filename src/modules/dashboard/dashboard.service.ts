import { Injectable } from '@nestjs/common';
import { MissionStatus } from '../../../generated/prisma/client';
import {
  businessToday,
  dateOnlyToDate,
} from '../../common/utils/business-date.util';
import { PrismaService } from '../../database/prisma.service';
import { type TMissionViewer, visibleBy } from '../missions/mission-access';
import type { DashboardQueryDto } from './dto/dashboard-query.dto';
import type { DashboardResponseDto } from './dto/dashboard-response.dto';

/**
 * Indicateurs du jour. Pas de cache (voir AGENTS.md) : un seul GROUP BY sur
 * l'index `(plannedDate, status)`, toujours à jour après une transition.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nombre de missions PRÉVUES ce jour-là (aujourd'hui par défaut), par statut
   * actuel. Toutes pour le dispatcher ; pour un chauffeur, uniquement les
   * siennes (même portée que la liste des missions).
   */
  async missionsByStatus(
    query: DashboardQueryDto,
    viewer: TMissionViewer,
  ): Promise<DashboardResponseDto> {
    const date = query.date ?? businessToday();
    const groups = await this.prisma.mission.groupBy({
      by: ['status'],
      where: { plannedDate: dateOnlyToDate(date), ...visibleBy(viewer) },
      _count: { _all: true },
    });

    const byStatus: Record<MissionStatus, number> = {
      [MissionStatus.PLANNED]: 0,
      [MissionStatus.STARTED]: 0,
      [MissionStatus.DELIVERED]: 0,
      [MissionStatus.FAILED]: 0,
    };
    for (const group of groups) {
      byStatus[group.status] = group._count._all;
    }
    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return { date, total, byStatus };
  }
}
