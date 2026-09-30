import { ApiProperty } from '@nestjs/swagger';
import type { MissionStatus } from '../../../../generated/prisma/client';

/** Un compteur par statut, TOUJOURS présent (0 si aucune mission). */
export class MissionCountByStatusDto implements Readonly<
  Record<MissionStatus, number>
> {
  @ApiProperty({ example: 3 })
  readonly PLANNED: number;

  @ApiProperty({ example: 1 })
  readonly STARTED: number;

  @ApiProperty({ example: 5 })
  readonly DELIVERED: number;

  @ApiProperty({ example: 1 })
  readonly FAILED: number;
}

export class DashboardResponseDto {
  @ApiProperty({ example: '2026-10-01', format: 'date' })
  readonly date: string;

  @ApiProperty({ example: 10, description: 'Missions prévues ce jour-là' })
  readonly total: number;

  @ApiProperty({ type: MissionCountByStatusDto })
  readonly byStatus: MissionCountByStatusDto;
}
