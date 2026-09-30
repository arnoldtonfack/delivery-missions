import { PartialType } from '@nestjs/swagger';
import { CreateDriverDto } from './create-driver.dto';

/**
 * Tous les champs optionnels : seuls ceux envoyés sont modifiés.
 * `skipNullProperties: false` : un champ envoyé à `null` est VALIDÉ (donc refusé
 * en 400) au lieu d'être ignoré puis de casser le hash ou Prisma en 500.
 */
export class UpdateDriverDto extends PartialType(CreateDriverDto, {
  skipNullProperties: false,
}) {}
