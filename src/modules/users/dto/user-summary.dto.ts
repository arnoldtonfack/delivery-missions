import { ApiProperty } from '@nestjs/swagger';

/** Référence courte à un utilisateur (chauffeur assigné, auteur d'un changement). */
export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ example: 'Jean Mbarga' })
  readonly fullName: string;
}
