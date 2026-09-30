import { ApiProperty } from '@nestjs/swagger';
import {
  IsByteLength,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { BCRYPT_MAX_BYTES } from '../../../common/crypto/password.util';
import { NormalizeEmail } from '../../../common/transformers/normalize-email.transform';

export class LoginDto {
  @ApiProperty({ example: 'dispatcher@delivery.cm' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  readonly email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  // Même limite qu'à la création : au-delà, bcrypt tronquerait la saisie.
  @IsByteLength(0, BCRYPT_MAX_BYTES, {
    message: `password must not exceed ${BCRYPT_MAX_BYTES} bytes`,
  })
  readonly password: string;
}
