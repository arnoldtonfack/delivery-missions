import { PartialType } from '@nestjs/swagger';
import { CreateDriverDto } from './create-driver.dto';

/** Tous les champs optionnels : seuls ceux envoyés sont modifiés. */
export class UpdateDriverDto extends PartialType(CreateDriverDto) {}
