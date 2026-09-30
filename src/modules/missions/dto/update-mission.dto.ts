import { PartialType } from '@nestjs/swagger';
import { CreateMissionDto } from './create-mission.dto';

/**
 * Tous les champs optionnels : seuls ceux envoyés sont modifiés ; `driverId`
 * réassigne la mission. `skipNullProperties: false` : un champ envoyé à `null`
 * est validé (donc refusé en 400) au lieu d'être ignoré.
 */
export class UpdateMissionDto extends PartialType(CreateMissionDto, {
  skipNullProperties: false,
}) {}
