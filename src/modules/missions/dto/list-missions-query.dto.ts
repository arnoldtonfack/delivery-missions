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
  /**
   * Jour prévu. Absent : toutes les dates pour le dispatcher, aujourd'hui pour le
   * chauffeur (fuseau Africa/Douala, horloge serveur).
   */
  @ApiPropertyOptional({
    example: '2026-10-01',
    format: 'date',
    description:
      'Jour prévu. Absent : toutes les dates (dispatcher), aujourd’hui en Africa/Douala (chauffeur)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  readonly date?: string;

  /**
   * Pour un chauffeur, remplacé par son propre id (il ne voit que ses missions) ;
   * doit quand même être un UUID valide s'il est envoyé.
   */
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filtre du dispatcher ; pour un chauffeur, remplacé par son propre id',
  })
  @IsOptional()
  @IsUUID()
  readonly driverId?: string;

  @ApiPropertyOptional({ enum: MissionStatus, enumName: 'MissionStatus' })
  @IsOptional()
  @IsEnum(MissionStatus)
  readonly status?: MissionStatus;
}
