import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateDriverStatusDto {
  @ApiProperty({
    description: 'false = désactiver le compte (connexion refusée)',
  })
  @IsBoolean()
  readonly isActive: boolean;
}
