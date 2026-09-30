import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListDriversQueryDto {
  /** Query string → booléen : seules les valeurs `true` / `false` sont acceptées. */
  @ApiPropertyOptional({ description: 'Filtrer par état du compte' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  readonly isActive?: boolean;
}
