import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, Matches } from 'class-validator';

export class DashboardQueryDto {
  /** Jour compté. Absent = aujourd'hui (fuseau Africa/Douala, horloge serveur). */
  @ApiPropertyOptional({
    example: '2026-10-01',
    format: 'date',
    description: 'Jour prévu ; aujourd’hui (Africa/Douala) par défaut',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  readonly date?: string;
}
