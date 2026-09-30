import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
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
  @MaxLength(128)
  readonly password: string;
}
