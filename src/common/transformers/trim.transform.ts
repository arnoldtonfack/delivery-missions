import { Transform } from 'class-transformer';

/**
 * Retire les espaces en début/fin avant validation : `@IsNotEmpty()` refuse
 * alors une chaîne faite uniquement d'espaces. Les valeurs non textuelles sont
 * laissées telles quelles pour que `@IsString()` les refuse.
 */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
