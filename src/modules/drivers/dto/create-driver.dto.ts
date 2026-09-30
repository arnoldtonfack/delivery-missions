import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../../common/transformers/normalize-email.transform';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDriverDto {
  @ApiProperty({ example: 'Jean Mbarga' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  readonly fullName: string;

  @ApiProperty({ example: 'jean.mbarga@delivery.cm' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  readonly email: string;

  /** Mot de passe initial, communiqué au chauffeur par le dispatcher. */
  @ApiProperty({ example: 'Password123!', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  // bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que tronquer.
  @MaxLength(72)
  readonly password: string;
}
