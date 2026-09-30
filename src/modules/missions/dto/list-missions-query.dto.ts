import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { MissionStatus } from '../../../../generated/prisma/client';

export class ListMissionsQueryDto {
  /** Jour prévu. Absent = aujourd'hui (fuseau Africa/Douala, horloge serveur). */
  @ApiPropertyOptional({
    example: '2026-10-01',
    format: 'date',
    description: 'Jour prévu ; aujourd’hui (Africa/Douala) par défaut',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  readonly date?: string;

  /** Ignoré pour un chauffeur : il ne voit jamais que ses propres missions. */
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Dispatcher uniquement (forcé à soi-même pour un chauffeur)',
  })
  @IsOptional()
  @IsUUID()
  readonly driverId?: string;

  @ApiPropertyOptional({ enum: MissionStatus, enumName: 'MissionStatus' })
  @IsOptional()
  @IsEnum(MissionStatus)
  readonly status?: MissionStatus;
}
