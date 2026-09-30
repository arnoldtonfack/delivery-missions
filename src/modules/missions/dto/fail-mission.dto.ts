import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/transformers/trim.transform';

export class FailMissionDto {
  /** Obligatoire, non vide après trim (contrainte CHECK en base aussi). */
  @ApiProperty({ example: 'Client absent, boutique fermée', maxLength: 500 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  readonly reason: string;
}
