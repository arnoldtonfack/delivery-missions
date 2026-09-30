import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/transformers/trim.transform';

export class DeliverMissionDto {
  /** Optionnel ; vide après trim = pas de commentaire (enregistré `null`). */
  @ApiPropertyOptional({
    example: 'Remis en main propre au gérant',
    maxLength: 500,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  readonly comment?: string;
}
