import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../../common/transformers/trim.transform';

export class CreateMissionDto {
  /** Normalisée (trim + majuscules) : `cmd-001 ` et `CMD-001` sont la même référence. */
  @ApiProperty({ example: 'CMD-2026-0001', maxLength: 40 })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[A-Z0-9][A-Z0-9._/-]*$/, {
    message: 'reference must contain only letters, digits, ".", "_", "/", "-"',
  })
  readonly reference: string;

  @ApiProperty({ example: 'Boulangerie du Centre' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  readonly customerName: string;

  @ApiProperty({ example: 'Entrepôt Bonabéri, Douala' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly pickupAddress: string;

  @ApiProperty({ example: 'Rue Joss, Akwa, Douala' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly deliveryAddress: string;

  /** Jour prévu, sans heure. Aujourd'hui ou plus tard (fuseau Africa/Douala). */
  @ApiProperty({ example: '2026-10-01', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'plannedDate must be YYYY-MM-DD' })
  // `strict` refuse aussi les jours inexistants (2026-02-30).
  @IsISO8601({ strict: true })
  readonly plannedDate: string;

  /** Chauffeur assigné : un utilisateur DRIVER actif. */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly driverId: string;
}
