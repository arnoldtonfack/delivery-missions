import { ApiProperty } from '@nestjs/swagger';
import {
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BCRYPT_MAX_BYTES } from '../../../common/crypto/password.util';
import { NormalizeEmail } from '../../../common/transformers/normalize-email.transform';
import { Trim } from '../../../common/transformers/trim.transform';

export class CreateDriverDto {
  @ApiProperty({ example: 'Jean Mbarga' })
  @Trim()
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
  // bcrypt ignore tout ce qui dépasse 72 OCTETS (pas caractères : « é » en vaut 2) :
  // on refuse plutôt que de tronquer silencieusement.
  @IsByteLength(0, BCRYPT_MAX_BYTES, {
    message: `password must not exceed ${BCRYPT_MAX_BYTES} bytes`,
  })
  readonly password: string;
}
